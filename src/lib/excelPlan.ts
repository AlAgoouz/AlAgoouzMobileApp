import type {AuditLogEntry, Customer, Employee, Expense, InventoryItem, Partner, RecipeIngredient, RecipeProductDefinition, StocktakingItemVariance, Supplier, UnitType} from '../types/erp';
import {cloudFields, toCloud, validateStore, type StoreState} from './storeState';
import {adjustCatalogItem} from './catalogAdjustments';
import {changeCatalogNameDraft, completeCatalogNameDraft, normalizeCatalogName} from './catalogNameDrafts';
import {activateRecipeDraft, recordRecipeDefinition, updateCatalogRecipe} from './recipeCatalog';
import {isStockItem, itemCategories, requiresRecipe} from './itemPolicy';
import {checkCustomerDetails, checkSupplierDetails} from './contactDetails';
import {createInventoryActions} from './inventoryActions';
import {recordExpense, recordPayment} from './ledger';
import {payrollBalance, recordEmployeeAction} from './payroll';
import {businessDate} from './dates';
import {parseDecimalInput} from './decimalInput';
import {multiplyMoney, roundMoney, sumMoney} from './money';
import {isCountUnit, quantityUnits, unitLabel} from './units';
import {assertUserChanges, canWrite, type UserAccess} from './userAccess';
import {stockRevision, sheetSection, type Cell, type ExcelFile, type ExcelRow, type ExcelSection} from './excelWorkbook';
import {storeChanges} from './storeChanges';

export type ExcelIssue = {sheet:string; line?:number; column?:string; message:string};
export type ExcelEffect = {section:string; label:string; field:string; before:Cell; after:Cell};
export type ExcelPlan = {issues:ExcelIssue[]; effects:ExcelEffect[]; added:number; updated:number; changes:ReturnType<typeof storeChanges>};
const units = ['kg','piece','count','liter'] as const;
const customerTypes = ['جملة - كافيه','جملة - سوبر ماركت','جملة - تاجر','عميل محل'] as const;
const roles = ['باريستا','كاشير','مسؤول مطحنة وإنتاج','عامل مخزن وفرع'] as const;
const paySources = ['درج المحل','خزنة الشركة','من جيب الشريك'] as const;
const expenseCategories = ['إيجار','كهرباء ومياه وغاز','رواتب ويوميات','صيانة مطاحن وماكينات','أكياس وتغليف','نقل ومشال','مسحوبات شركاء','نثريات أخرى'] as const;
const staffActions = ['حضور يومية','سلفة','خصم/عجز','مكافأة','صرف راتب'] as const;
const canonicalCode=(value:Cell|undefined)=>String(value??'').normalize('NFKC').toUpperCase();
const message=(error:unknown)=>error instanceof Error?error.message:'راجع بيانات الملف.';
class InvalidCell extends Error {
  constructor(public field:string,text:string) { super(text); }
}

export function writableExcelSheets(section:ExcelSection, member:UserAccess):Set<string> {
  const config=sheetSection(section);
  const allowed=config.permission&&canWrite(member,config.permission)&&(!config.owner||member.isOwner);
  return new Set(Object.entries(config.sheets).filter(([key,sheet])=>sheet.input&&
    (key==='payments'?canWrite(member,'collections'):allowed)).map(([key])=>key));
}

function cells(row:ExcelRow) {
  const value=(key:string)=>row.values[key]??'';
  const text=(key:string,required=true,max=200)=>{
    const result=String(value(key)).trim();
    if((required&&!result)||result.length>max) throw new InvalidCell(key,required?'أدخل قيمة صحيحة في العمود.':'القيمة أطول من الحد المسموح.');
    return result;
  };
  const number=(key:string,fallback?:number,precision=6)=>{
    if(value(key)===''&&fallback!==undefined) return fallback;
    const parsed=parseDecimalInput(value(key));
    if(parsed===undefined||parsed<0||parsed>999999999999.99||Math.abs(parsed-Number(parsed.toFixed(precision)))>0.00000001) throw new InvalidCell(key,'أدخل رقمًا غير سالب بالدقة المطلوبة.');
    return parsed;
  };
  const choice=<T extends string>(key:string, options:readonly T[], fallback?:T):T=>{
    const entered=text(key,fallback===undefined);
    if(!entered&&fallback!==undefined) return fallback;
    const match=options.find(o=>o===entered);
    if(match===undefined) throw new InvalidCell(key,'اختر من القيم التالية: '+options.join('، ')+'.');
    return match;
  };
  const date=()=>{
    const entered=text('date');
    const candidate=new Date(entered+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(entered)||!Number.isFinite(candidate.getTime())||candidate.toISOString().slice(0,10)!==entered||entered>businessDate()) throw new InvalidCell('date','اكتب تاريخ عمل صحيحًا حتى اليوم بصيغة YYYY-MM-DD.');
    return entered;
  };
  return {value,text,number,choice,date};
}

const numericFields=new Set(['retail','wholesale','min','share','baseMonthlySalary','dailyRate','quantity','actual']);
const unchanged=(key:string,a:Cell|undefined,b:Cell|undefined)=>numericFields.has(key)&&a!==''&&b!==''&&a!==undefined&&b!==undefined
  ? parseDecimalInput(a)!==undefined&&parseDecimalInput(a)===parseDecimalInput(b)
  : String(a??'').trim()===String(b??'').trim();

function mergeRow(row:ExcelRow,live:Record<string,Cell>|undefined,fields:string[]):ExcelRow|null {
  if(!row.original){
    if(row.values.id)throw new InvalidCell('id','اترك معرّف السجل فارغًا في الصف الجديد، أو نزّل الملف الأصلي مرة تانية.');
    return row;
  }
  if(row.values.id!==row.original.id)throw new InvalidCell('id','معرّف السجل اتغيّر. ارجع للقالب الأصلي.');
  const edits=fields.filter(key=>!unchanged(key,row.values[key],row.original?.[key]));
  if(!edits.length)return null;
  if(!live)throw new InvalidCell('id','السجل اتغير أو لم يعد موجودًا. نزّل ملفًا جديدًا.');
  const values={...live};
  for(const key of edits){
    if(!unchanged(key,live[key],row.original[key])&&!unchanged(key,live[key],row.values[key])) throw new InvalidCell(key,'القيمة اتعدّلت في النظام بعد التنزيل. نزّل ملفًا جديدًا وراجع التغيير.');
    values[key]=row.values[key];
  }
  if(!fields.some(key=>!unchanged(key,live[key],values[key])))return null;
  return {...row,values};
}

function codeAvailable(state:StoreState,id:string,code:string,barcode=''){
  const keys=new Set([canonicalCode(code),...(barcode?[canonicalCode(barcode)]:[])]);
  if(state.items.some(i=>i.id!==id&&(keys.has(canonicalCode(i.code))||i.barcode&&keys.has(canonicalCode(i.barcode))))||
    state.catalogNameDrafts.some(d=>d.id!==id&&d.definition&&keys.has(canonicalCode(d.definition.code)))) throw new InvalidCell('code','الكود أو الباركود مستخدم لمنتج آخر.');
}
function product(state:StoreState,row:ExcelRow,actor:{id:string;name:string}) {
  const {text,number,choice}=cells(row);
  const id=text('id',false)||crypto.randomUUID();
  const name=text('name');
  const existing=state.items.find(i=>i.id===id);
  const draft=state.catalogNameDrafts.find(i=>i.id===id);
  if(draft&&!draft.definition&&['code','category','unit','retail','min','wholesale','barcode'].every(key=>row.values[key]==='')){
    return changeCatalogNameDraft(state,id,name,actor);
  }
  const entered=text('category');
  const category=itemCategories.find(c=>c.id===entered||c.label===entered)?.id;
  if(!category)throw new InvalidCell('category','اختر نوعًا من: '+itemCategories.map(c=>c.label).join('، '));
  const baseUnit=choice('unit',units);
  const code=text('code',true,100),barcode=text('barcode',false,100);
  codeAvailable(state,id,code,barcode);
  if((!existing||normalizeCatalogName(existing.name)!==normalizeCatalogName(name))&&
    [...state.items,...state.catalogNameDrafts].some(i=>i.id!==id&&normalizeCatalogName(i.name)===normalizeCatalogName(name))) throw new InvalidCell('name','اسم المنتج مسجل بالفعل.');
  const retailPrice=number('retail',0,2),wholesalePrice=number('wholesale',0,2),minStock=number('min',0);
  if(category==='manufactured_blend'&&baseUnit!=='kg'||category==='drink_recipe'&&baseUnit!=='piece') throw new InvalidCell('unit','استخدم الكيلو للتوليفة والقطعة للمشروب ذي الوصفة.');
  if((category==='drink_recipe'||category==='seasoning_recipe')&&minStock!==0)throw new InvalidCell('min','المنتج الذي يستهلك مكوناته مباشرة حد الطلب له صفر.');
  if(existing)return adjustCatalogItem(state,id,{name,code,barcode:barcode||undefined,category,baseUnit,retailPrice,wholesalePrice,minStock,
    ...(!requiresRecipe(category)&&existing.hasRecipe?{hasRecipe:false,recipe:[]}:{})},actor.name);
  if(requiresRecipe(category)){
    if(wholesalePrice||barcode)throw new InvalidCell(wholesalePrice?'wholesale':'barcode','أكمل اعتماد الوصفة أولًا قبل إضافة سعر جملة أو باركود.');
    return recordRecipeDefinition(state,id,name,{code,category,baseUnit,retailPrice,minStock,openingStock:draft?.definition?.openingStock??0} as RecipeProductDefinition,actor);
  }
  const input:Omit<InventoryItem,'id'>={name,code,barcode:barcode||undefined,category,baseUnit,retailPrice,wholesalePrice,minStock,stock:0,openingStock:0,costPrice:0,lastPurchasePrice:0,canSellDirectly:true,hasRecipe:false,recipe:[],supplierPrices:[]};
  return draft?completeCatalogNameDraft(state,id,input,actor):{...state,items:[{...input,id},...state.items]};
}

export function planExcel(file:ExcelFile,base:StoreState,member:UserAccess,financialPartnerId?:string):ExcelPlan {
  const config=sheetSection(file.section);
  const editable=writableExcelSheets(file.section,member);
  const issues:ExcelIssue[]=[];
  const actor={id:member.userId,name:member.displayName};
  let next=base;
  const requirePartner=(id=financialPartnerId)=>{
    const partner=next.partners.find(p=>p.id===id);
    if(!partner)throw new InvalidCell('account','اختر حساب الشريك المالي للعملية.');
    return partner;
  };
  const audit=(actionType:AuditLogEntry['actionType'],description:string,amount?:number)=>{
    next={...next,auditLogs:[{id:crypto.randomUUID(),timestamp:new Date().toISOString(),actorId:actor.id,partnerName:actor.name,actionType,description,amount},...next.auditLogs]};
  };
  const actions=createInventoryActions({
    engine:{
      get state(){return next;},
      field(key,update){next={...next,[key]:typeof update==='function'?update(next[key]):update};},
      replace(state){next=state;},
    },currentPartner:actor,requireFinancialPartner:requirePartner,addAuditLog:audit,showToast:()=>{},
  });
  const issue=(key:string,row:ExcelRow|undefined,error:unknown)=>{
    const sheet=config.sheets[key];
    issues.push({sheet:sheet?.name??config.title,line:row?.line,column:error instanceof InvalidCell?sheet?.fields[error.field]:undefined,message:message(error)});
  };
  const entries=(key:string)=>editable.has(key)?file.rows[key]??[]:[];
  const run=(key:string,row:ExcelRow,job:()=>void)=>{
    const before=next;
    try {job();}catch(error){next=before;issue(key,row,error);}
  };
  const newRows=(key:string,job:(row:ExcelRow)=>void)=>{
    for(const row of entries(key))run(key,row,()=>{
      if(row.original)throw Error('أضف الحركات الجديدة في صف فارغ.');
      job(row);
    });
  };
  const master=(key:string,job:(row:ExcelRow)=>void)=>{
    if(!editable.has(key))return;
    const seen=new Set<Cell>();
    const live=config.sheets[key].rows(base);
    const byId=new Map(live.map(row=>[row.id,row]));
    const fields=Object.keys(config.sheets[key].fields).filter(k=>k!=='id');
    for(const row of entries(key))run(key,row,()=>{
      const id=row.original?.id;
      if(id&&seen.has(id))throw new InvalidCell('id','معرّف السجل مكرر في الملف.');
      if(id)seen.add(id);
      const change=mergeRow(row,id?byId.get(id):undefined,fields);
      if(change)job(change);
    });
  };
  const getItem=(value:string,field='code')=>{
    const item=next.items.find(i=>canonicalCode(i.code)===canonicalCode(value));
    if(!item)throw new InvalidCell(field,'كود منتج غير موجود أو غير معتمد: '+value);
    return item;
  };

  if(file.section==='products')master('products',row=>{next=product(next,row,actor);});
  if(file.section==='customers')master('contacts',row=>{
    const v=cells(row),existing=next.customers.find(c=>c.id===v.value('id'));
    const contact:Customer={...(existing??{id:crypto.randomUUID(),balance:0,totalSales:0,invoicesCount:0}),name:v.text('name'),phone:v.text('phone'),area:v.text('area'),type:v.choice('type',customerTypes)};
    checkCustomerDetails(contact);
    next={...next,customers:existing?next.customers.map(c=>c.id===contact.id?contact:c):[contact,...next.customers]};
  });
  if(file.section==='suppliers')master('contacts',row=>{
    const v=cells(row),existing=next.suppliers.find(c=>c.id===v.value('id'));
    const contact:Supplier={...(existing??{id:crypto.randomUUID(),balance:0,totalPurchases:0,invoicesCount:0}),name:v.text('name'),phone:v.text('phone'),address:v.text('address'),representativeName:v.text('representativeName'),category:v.text('category')};
    checkSupplierDetails(contact);
    next={...next,suppliers:existing?next.suppliers.map(c=>c.id===contact.id?contact:c):[contact,...next.suppliers]};
  });
  if(file.section==='customers'||file.section==='suppliers')newRows('payments',row=>{
    const v=cells(row),kind=file.section==='customers'?'customer':'supplier';
    const id=v.text('account'),amount=v.number('amount',undefined,2);
    try{next=recordPayment(next,kind,id,amount,actor.name,v.text('notes',false));}
    catch(error){throw new InvalidCell((kind==='customer'?next.customers:next.suppliers).some(x=>x.id===id)?'amount':'account',message(error));}
  });
  if(file.section==='staff_payroll'){
    master('staff',row=>{
      const v=cells(row),existing=next.employees.find(e=>e.id===v.value('id'));
      const employee:Employee={...(existing??{id:crypto.randomUUID(),workedDaysThisMonth:0,totalAdvances:0,totalDeductions:0,totalBonuses:0,totalPaidOut:0}),name:v.text('name'),phone:v.text('phone',false),role:v.choice('role',roles),salaryType:v.choice('salaryType',['شهري','يومية']),baseMonthlySalary:v.number('baseMonthlySalary',0,2),dailyRate:v.number('dailyRate',0,2)};
      if(employee.salaryType==='شهري'?employee.baseMonthlySalary<=0:employee.dailyRate<=0)throw new InvalidCell(employee.salaryType==='شهري'?'baseMonthlySalary':'dailyRate','أدخل أجرًا أكبر من صفر.');
      next={...next,employees:existing?next.employees.map(e=>e.id===employee.id?employee:e):[employee,...next.employees]};
    });
    newRows('new',row=>{
      const v=cells(row),type=v.choice('type',staffActions);
      next=recordEmployeeAction(next,v.text('account'),type,v.number('amount',type==='حضور يومية'?0:undefined,2),v.text('notes',false),requirePartner().id,v.choice('source',paySources,'درج المحل'));
    });
  }
  if(file.section==='partners'){
    master('partners',row=>{
      const v=cells(row),existing=next.partners.find(p=>p.id===v.value('id'));
      const name=v.text('name'),sharePercent=v.number('share',undefined,3);
      if(sharePercent>100)throw new InvalidCell('share','النسبة بين صفر و100.');
      const id=existing?.id??crypto.randomUUID();
      const partner:Partner={...(existing??{id,username:'financial-'+id,role:'شريك',phone:'',totalPaidFromPocket:0,totalWithdrawals:0}),name,avatarLetter:name.charAt(0),sharePercent};
      next={...next,partners:existing?next.partners.map(p=>p.id===id?partner:p):[partner,...next.partners]};
    });
    if(next.partners!==base.partners&&Math.abs(next.partners.reduce((total,p)=>total+p.sharePercent,0)-100)>0.000001)issue('partners',undefined,new InvalidCell('share','مجموع حصص الشركاء لازم يساوي 100%.'));
  }
  if(file.section==='partners'||file.section==='expenses')newRows('new',row=>{
    const v=cells(row);
    const partner=requirePartner(file.section==='partners'?v.text('account'):undefined);
    const movement=file.section==='partners'?v.choice('type',['مساهمة','مسحوب']):undefined;
    const category=movement==='مسحوب'?'مسحوبات شركاء':v.choice('category',expenseCategories);
    if(movement==='مساهمة'&&category==='مسحوبات شركاء')throw new InvalidCell('category','اختر تصنيف المصروف اللي دفعه الشريك.');
    const source=movement==='مساهمة'?'من جيب الشريك':v.choice('source',paySources);
    if(movement==='مساهمة'&&v.value('source')!==''&&v.value('source')!==source)throw new InvalidCell('source','المساهمة تعني مصروفًا دفَعه الشريك من جيبه.');
    const expense:Omit<Expense,'id'>={date:v.date(),category,paidFrom:source,title:v.text('title'),amount:v.number('amount',undefined,2),frequency:file.section==='expenses'?v.choice('frequency',['daily','monthly_fixed'] as const,'daily'):'daily',notes:v.text('notes',false,500),partnerName:partner.name};
    next=recordExpense(next,expense,partner.id);
  });
  if(file.section==='production')newRows('new',row=>{
    const v=cells(row),item=getItem(v.text('code'));
    if(item.category!=='manufactured_blend')throw new InvalidCell('code','الإنتاج للتوليفات فقط.');
    const quantity=v.number('quantity');
    if(quantity===0)throw new InvalidCell('quantity','كمية الإنتاج لازم تكون أكبر من صفر.');
    const result=actions.handleExecuteProduction(item.id,quantity,v.text('notes',false,500));
    if(!result.ok)throw Error(result.message);
  });
  if(file.section==='stocktaking'){
    const counts:StocktakingItemVariance[]=[];
    const seen=new Set<string>();
    for(const row of entries('counts'))if(row.values.actual!=='')run('counts',row,()=>{
      const v=cells(row),id=v.text('id'),item=next.items.find(i=>i.id===id);
      if(!item||!isStockItem(item)||seen.has(id)||row.original?.id!==id)throw new InvalidCell('id','الصنف غير موجود أو مكرر. استخدم صف الصنف من القالب.');
      seen.add(id);
      if(row.original.stock!==item.stock||row.original.cost!==item.costPrice||row.original.revision!==stockRevision(base,id))throw new InvalidCell('actual','حصلت حركة على الصنف بعد التنزيل. نزّل جردًا جديدًا وراجع الكمية.');
      const actualStock=v.number('actual',undefined,3);
      if(isCountUnit(item.baseUnit)&&!Number.isInteger(actualStock))throw new InvalidCell('actual','العدد أو القطع لازم تكون رقمًا صحيحًا.');
      if(actualStock!==item.stock)counts.push({itemId:id,itemName:item.name,baseUnit:item.baseUnit,systemStock:item.stock,actualStock,difference:0,unitCost:0,financialDifference:0});
    });
    if(counts.length&&!issues.length)try{actions.handleCommitStocktaking(counts,'جرد معتمد من Excel');}catch(error){issue('counts',undefined,error);}
  }
  if(file.section==='recipes'){
    const groups=new Map<string,ExcelRow[]>();
    for(const row of entries('ingredients'))run('ingredients',row,()=>{
      const v=cells(row),code=canonicalCode(v.text('code'));
      if(row.original&&(code!==canonicalCode(row.original.code)||canonicalCode(v.text('ingredient'))!==canonicalCode(row.original.ingredient)))
        throw new InvalidCell('ingredient','لتبديل مكوّن، اكتب «حذف» في صفه وأضف المكوّن البديل في صف جديد.');
      const group=groups.get(code)??[];
      group.push(row);
      groups.set(code,group);
    });
    const active=new Set<string>();
    const finished=new Set<string>();
    function applyRecipe(code:string){
      if(finished.has(code))return;
      if(active.has(code))throw new InvalidCell('ingredient','المكونات فيها اعتماد دائري.');
      active.add(code);
      const rows=groups.get(code)??[];
      const prior=next;
      try {
        for(const row of rows)if(!row.original){
          const source=canonicalCode(row.values.ingredient);
          if(groups.has(source)&&!next.items.some(i=>canonicalCode(i.code)===source))applyRecipe(source);
        }
        const target=next.items.find(i=>canonicalCode(i.code)===code);
        const draft=next.catalogNameDrafts.find(d=>canonicalCode(d.definition?.code)===code);
        const recipe=new Map((target?.recipe??[]).map(i=>[i.ingredientId,i]));
        const seen=new Set<string>();
        let changed=false;
        let valid=true;
        for(const row of rows) {
          try {
            const v=cells(row),action=v.choice('action',['','حذف'],'');
            const ingredientCode=canonicalCode(v.text('ingredient'));
            if(seen.has(ingredientCode))throw new InvalidCell('ingredient','المكوّن مكرر في نفس الوصفة.');
            seen.add(ingredientCode);
            if(row.original&&!action&&unchanged('quantity',row.values.quantity,row.original.quantity)&&unchanged('unit',row.values.unit,row.original.unit))continue;
            const item=getItem(v.text('ingredient'),'ingredient');
            const current=recipe.get(item.id);
            if(row.original&&(!current||!unchanged('quantity',current.quantity,row.original.quantity)||current.unit!==row.original.unit))throw new InvalidCell('ingredient','المكوّن اتعدّل بعد التنزيل. نزّل ملف وصفات جديد.');
            if(!row.original&&current)throw new InvalidCell('ingredient','المكوّن موجود. عدّل صفه الأصلي.');
            if(action==='حذف'){
              if(!current)throw new InvalidCell('action','الحذف يحتاج صف مكوّن موجود في القالب.');
              recipe.delete(item.id);
            }else{
              const options:UnitType[]=isCountUnit(item.baseUnit)?['piece','count']:quantityUnits(item.baseUnit);
              const unit=v.choice('unit',options),quantity=v.number('quantity');
              if(quantity===0)throw new InvalidCell('quantity','كمية المكوّن لازم تكون أكبر من صفر.');
              const line:RecipeIngredient={ingredientId:item.id,ingredientName:item.name,quantity,unit};
              recipe.set(item.id,line);
            }
            changed=true;
          }catch(error){valid=false;issue('ingredients',row,error);}
        }
        if(!valid)return;
        if(changed) {
          if(target&&requiresRecipe(target.category))next=updateCatalogRecipe(next,target,[...recipe.values()],actor);
          else if(draft?.definition)next=activateRecipeDraft(next,draft.id,[...recipe.values()],actor);
          else throw new InvalidCell('code','عرّف المنتج كمنتج بوصفة في قسم المنتجات أولًا.');
        }
        finished.add(code);
      }catch(error){next=prior;throw error;}
      finally{active.delete(code);}
    }
    for(const [code,rows] of groups)try{applyRecipe(code);}catch(error){issue('ingredients',rows[0],error);}
  }

  if(file.section==='purchase'||file.section==='sales_pos'){
    const headers=new Map<string,ExcelRow>();
    const groups=new Map<string,ExcelRow[]>();
    newRows('new',row=>{
      const ref=cells(row).text('reference');
      if(headers.has(ref))throw new InvalidCell('reference','مرجع الفاتورة مكرر.');
      headers.set(ref,row);
    });
    newRows('lines',row=>{
      const ref=cells(row).text('reference');
      if(!headers.has(ref))throw new InvalidCell('reference','البند غير مرتبط بفاتورة جديدة في الملف.');
      const list=groups.get(ref)??[];
      list.push(row);
      groups.set(ref,list);
    });
    for(const [ref,row] of headers)run('new',row,()=>{
      const v=cells(row),date=v.date(),account=v.text('account');
      const lines=groups.get(ref)??[];
      if(!lines.length)throw new InvalidCell('reference','الفاتورة تحتاج بندًا واحدًا على الأقل.');
      const countBefore=issues.length;
      const seen=new Set<string>();
      const items=lines.flatMap(line=>{
        try{
          const input=cells(line),item=getItem(input.text('code'));
          if(seen.has(item.id))throw new InvalidCell('code','الصنف مكرر في نفس الفاتورة.');
          seen.add(item.id);
          const quantity=input.number('quantity');
          if(quantity<=0||isCountUnit(item.baseUnit)&&!Number.isInteger(quantity))throw new InvalidCell('quantity','أدخل كمية موجبة بوحدة الصنف الأساسية.');
          return [{item,quantity,price:input.number('price',undefined,2)}];
        }catch(error){issue('lines',line,error);return [];}
      });
      if(issues.length!==countBefore)return;
      const subtotal=sumMoney(items.map(i=>multiplyMoney(i.quantity,i.price)));
      if(file.section==='purchase'){
        const taxAmount=v.number('tax',0,2),totalAmount=sumMoney([subtotal,taxAmount]);
        const invoiceItems=items.map(({item,quantity,price})=>({
          itemId:item.id,itemName:item.name,quantity,unit:unitLabel(item.baseUnit),purchasePrice:price,
          previousLastPrice:item.lastPurchasePrice,previousWacCost:item.costPrice,cheapestSupplierPrice:0,cheapestSupplierName:'',updateProductCost:true,
        }));
        actions.handleSavePurchase({date,supplierId:account,supplierName:'',items:invoiceItems,netAmount:subtotal,taxAmount,totalAmount,paidAmount:totalAmount,remainingAmount:0,paymentMethod:'نقدي',partnerName:actor.name,notes:v.text('notes',false,500)});
      }else{
        const discount=v.number('discount',0,2),totalAmount=roundMoney(subtotal-discount);
        const paymentMethod=v.choice('method',['نقدي','آجل','محفظة/انستا باي'],'نقدي');
        const paidAmount=v.number('paid',paymentMethod==='آجل'?0:Math.max(totalAmount,0),2);
        if(paymentMethod!=='آجل'&&paidAmount!==totalAmount)throw new InvalidCell('paid','البيع النقدي أو بالمحفظة يحتاج سداد الإجمالي.');
        const invoiceItems=items.map(({item,quantity,price})=>({
          itemId:item.id,itemName:item.name,category:item.category,quantity,unitLabel:unitLabel(item.baseUnit),normalizedQtyInBaseUnit:quantity,
          unitPrice:price,unitCost:item.costPrice,totalPrice:multiplyMoney(quantity,price),totalCost:0,profit:0,
        }));
        actions.handleSaveSale({date,saleType:'wholesale',customerId:account,customerName:'',items:invoiceItems,subtotal,discount,totalAmount,totalCost:0,netProfit:0,
          paidAmount,remainingAmount:roundMoney(totalAmount-paidAmount),paymentMethod,partnerName:actor.name});
      }
    });
  }

  if(issues.length)return {issues,effects:[],added:0,updated:0,changes:{}};
  try{
    const after=validateStore(next);
    assertUserChanges(base,after,member);
    const effects=excelEffects(base,after);
    if(!effects.length)return {issues,effects,added:0,updated:0,changes:{}};
    next=after;
    const auditSections=new Map<string,string[]>();
    for(const effect of effects){
      const key=effect.section+' · '+effect.label;
      const lines=auditSections.get(key)??[];
      lines.push(effect.field+' ['+effect.before+' ← '+effect.after+']');
      auditSections.set(key,lines);
    }
    const summaries=[...auditSections].map(([key,lines])=>key+' · '+lines.join('، '));
    for(const summary of summaries.reverse())audit('تعديل وصفة/صنف','Excel '+file.id+' · '+summary.slice(0,1500));
    audit('تعديل وصفة/صنف','دفعة Excel · '+config.title+' · '+file.id+' · '+auditSections.size+' سجل');
    const changes=storeChanges(toCloud(base),toCloud(validateStore(next)));
    const keys=Object.values(cloudFields).filter(field=>field!=='audit_logs');
    const old=toCloud(base);
    const counts=keys.reduce((c,key)=>{
      const rowIds=new Set((old[key] as {id:string}[]).map(i=>i.id));
      for(const row of changes[key]?.upsert??[])if(rowIds.has(row.id))c.updated++;else c.added++;
      return c;
    },{added:0,updated:0});
    return {issues,effects,changes,...counts};
  }catch(error){
    issue('',undefined,error);
    return {issues,effects:[],changes:{},added:0,updated:0};
  }
}

const viewFields:Partial<Record<keyof StoreState,Record<string,string>>> = {
  items:{name:'الاسم',code:'الكود',barcode:'الباركود',category:'النوع',baseUnit:'الوحدة',stock:'الرصيد',retailPrice:'سعر البيع',wholesalePrice:'سعر الجملة',minStock:'حد الطلب',costPrice:'متوسط التكلفة',recipe:'المقادير'},
  catalogNameDrafts:{name:'الاسم',definition:'تعريف تحت الاستكمال'}, customers:{name:'الاسم',phone:'التليفون',area:'المنطقة',type:'النوع',balance:'المديونية'},
  suppliers:{name:'الاسم',phone:'التليفون',address:'العنوان',representativeName:'المندوب',category:'التصنيف',balance:'المستحق'},
  employees:{name:'الاسم',phone:'التليفون',role:'الدور',salaryType:'نوع الأجر',baseMonthlySalary:'الراتب الشهري',dailyRate:'الأجر اليومي',payable:'صافي المستحق'},
  partners:{name:'الاسم',sharePercent:'نسبة الحصة',totalPaidFromPocket:'المساهمات',totalWithdrawals:'المسحوبات'},
  purchaseInvoices:{totalAmount:'إجمالي الشراء',paidAmount:'المدفوع',remainingAmount:'المتبقي',taxAmount:'الضريبة'},
  salesInvoices:{totalAmount:'إجمالي البيع',paidAmount:'المدفوع',remainingAmount:'المتبقي',totalCost:'التكلفة'},
  productionBatches:{quantityProducedKg:'الكمية المنتجة',totalBatchCost:'تكلفة التشغيل'},
  stocktakingRecords:{totalShortageValue:'قيمة العجز',totalSurplusValue:'قيمة الزيادة',netVarianceValue:'صافي الفرق'},
  accountPayments:{amount:'قيمة الدفعة',openingBalanceAmount:'من رصيد سابق',allocations:'توزيع الدفعة'},
  expenses:{amount:'قيمة المصروف',paidFrom:'مصدر الصرف'},
  employeeTransactions:{amount:'قيمة الحركة',type:'نوع الحركة'},
};
const viewValue=(value:unknown, field:string):Cell=>{
  if(value===undefined||value===null)return '—';
  if(typeof value==='number'||typeof value==='string')return value;
  if(field==='recipe'&&Array.isArray(value))return value.map(l=>l.ingredientName+' '+l.quantity+' '+unitLabel(l.unit)).join('، ');
  if(field==='allocations'&&Array.isArray(value))return value.map(l=>l.invoiceId+' '+l.amount+' ج.م').join('، ')||'—';
  if(field==='definition'&&typeof value==='object'&&'code' in value)return Object.values(value).join(' / ');
  return '—';
};
const recordLabels:Partial<Record<keyof StoreState,string>> = {
  items:'المنتجات',catalogNameDrafts:'تحت الاستكمال',customers:'العملاء',suppliers:'الموردون',employees:'العمال',partners:'الشركاء',
  purchaseInvoices:'المشتريات',salesInvoices:'المبيعات',productionBatches:'الإنتاج',stocktakingRecords:'الجرد',accountPayments:'الدفعات',expenses:'المصاريف',employeeTransactions:'حركات العمال',
};
function excelEffects(before:StoreState,after:StoreState):ExcelEffect[] {
  const effects:ExcelEffect[]=[];
  for(const key of Object.keys(viewFields) as (keyof StoreState)[]){
    const old=new Map((before[key] as {id:string}[]).map(row=>[row.id,row]));
    for(const row of after[key] as {id:string}[]){
      const previous=old.get(row.id);
      if(JSON.stringify(previous)===JSON.stringify(row))continue;
      const current=row as unknown as Record<string,unknown>;
      const prior=previous as Record<string,unknown>|undefined;
      const caption=String(current.name??current.invoiceNumber??current.batchNumber??current.auditNumber??current.targetName??current.title??current.employeeName??current.id);
      const section=recordLabels[key]??key;
      for(const [field,label] of Object.entries(viewFields[key]??{})){
        const prev=field==='payable'&&previous?payrollBalance(previous as Employee).balance:prior?.[field];
        const value=field==='payable'?payrollBalance(row as Employee).balance:current[field];
        if(JSON.stringify(prev)===JSON.stringify(value))continue;
        effects.push({section,label:caption,field:label,before:viewValue(prev,field),after:viewValue(value,field)});
      }
    }
  }
  return effects;
}
