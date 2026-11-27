import type {StoreState} from './storeState';
import type {WritePermission} from './userAccess';
import {isStockItem, categoryLabel} from './itemPolicy';
import {businessDate} from './dates';
import {cashierCostDetails, correctedCashierCost} from './cashierCosts';

export type Cell = string | number;
type Values = Record<string, Cell>;
type Sheet = {name:string; fields:Record<string,string>; input?:boolean; dated?:boolean; rows:(state:StoreState)=>Values[]};
type Section = {title:string; permission?:WritePermission; owner?:boolean; sheets:Record<string,Sheet>};
export type ExcelRow = {line:number; values:Values; original?:Values};
export type ExcelFile = {id:string; section:ExcelSection; rows:Record<string,ExcelRow[]>};
const id = 'معرّف السجل';
const name = 'الاسم';
const date = 'التاريخ';
const notes = 'ملاحظات';
const amount = 'المبلغ';
const account = 'معرّف الحساب';
const code = 'كود المنتج';
const unit = 'الوحدة';
const label = (record:object) => Object.fromEntries(Object.entries(record).map(([key,value])=>[key,value??''])) as Values;
const identifiers = {id,name};
const invoice = {reference:'مرجع الفاتورة في الملف',date,account};
const lines = {reference:'مرجع الفاتورة في الملف',code,quantity:'الكمية بالوحدة الأساسية',price:'سعر الوحدة'};
const payments = (type:'customer'|'supplier'):Sheet => ({
  name:type==='customer'?'التحصيلات الجديدة':'المدفوعات الجديدة', input:true, fields:{account,amount,notes}, rows:()=>[],
});
const paymentHistory = (type:'customer'|'supplier'):Sheet => ({
  name:'سجل الدفعات', dated:true, fields:{id,date,account,name,amount,notes,status:'الحالة'},
  rows:s=>s.accountPayments.filter(p=>p.targetType===type).map(p=>label({...p,account:p.targetId,name:p.targetName,status:p.reversedAt?'معكوسة':'مسجلة'})),
});
const stockFields = {...identifiers,code,unit,stock:'الرصيد الحالي',cost:'متوسط التكلفة',min:'حد الطلب'};
const accountBalances=(type:'customer'|'supplier'):Sheet=>({
  name:'أرصدة الحسابات',fields:{...identifiers,balance:'الرصيد',total:'إجمالي الفواتير',count:'عدد الفواتير'},
  rows:s=>type==='customer'?s.customers.map(i=>label({...i,total:i.totalSales,count:i.invoicesCount})):
    s.suppliers.map(i=>label({...i,total:i.totalPurchases,count:i.invoicesCount})),
});
const stockRow = (i:StoreState['items'][number])=>label({id:i.id,name:i.name,code:i.code,unit:i.baseUnit,stock:i.stock,cost:i.costPrice,min:i.minStock});
const saleHistory:Sheet = {name:'سجل الفواتير',dated:true,fields:{id,date,number:'رقم الفاتورة',name:'العميل',total:'الإجمالي',paid:'المدفوع',remaining:'المتبقي',status:'الحالة'},
  rows:s=>s.salesInvoices.map(i=>label({id:i.id,date:i.date,number:i.invoiceNumber,name:i.customerName,total:i.totalAmount,paid:i.paidAmount,remaining:i.remainingAmount,status:i.isReturned?'مرتجع':'مسجلة'}))};
const saleLines:Sheet = {name:'بنود سجل البيع',dated:true,fields:{id,date,name:'الصنف',quantity:'الكمية',unit,price:'سعر البيع',total:'الإجمالي'},
  rows:s=>s.salesInvoices.flatMap(i=>i.items.map(l=>label({id:i.id,date:i.date,name:l.itemName,quantity:l.quantity,unit:l.unitLabel,price:l.unitPrice,total:l.totalPrice})))};
const cashierItems:Sheet = {name:'أصناف تقارير الكاشير',dated:true,fields:{id,date,code,name:'الصنف',quantity:'الكمية',unit,base:'الكمية بالوحدة الأساسية'},
  rows:s=>{const items=new Map(s.items.map(i=>[i.id,i]));return s.cashierDays.flatMap(d=>(d.itemsReport?.lines??[]).map(l=>label({id:d.id,date:d.date,
    code:items.get(l.itemId)?.code??l.itemId,name:items.get(l.itemId)?.name,quantity:l.quantity,unit:l.unitLabel,base:l.normalizedQtyInBaseUnit})));}};
const cashierHistory:Sheet = {name:'أيام الكاشير',dated:true,fields:{id,date,status:'الحالة',amount:'الإيراد',cost:'التكلفة',financial:'التقرير المالي',items:'تقرير الأصناف'},
  rows:s=>{const details=cashierCostDetails(s.cashierDays,s.purchaseInvoices);return s.cashierDays.map(i=>label({id:i.id,date:i.date,status:i.status==='approved'?'معتمد':'قيد المراجعة',amount:i.financialReport?.totalRevenue,cost:i.correctedTotalCost??correctedCashierCost(i,details.get(i.id)),financial:i.financialReport?.fileName,items:i.itemsReport?.fileName}));}};
const purchaseHistory:Sheet = {name:'سجل المشتريات',dated:true,fields:{id,date,number:'رقم الفاتورة',name:'المورد',total:'الإجمالي',tax:'الضريبة',paid:'المدفوع',remaining:'المتبقي',status:'الحالة'},
  rows:s=>s.purchaseInvoices.map(i=>label({id:i.id,date:i.date,number:i.invoiceNumber,name:i.supplierName,total:i.totalAmount,tax:i.taxAmount,paid:i.paidAmount,remaining:i.remainingAmount,status:i.isCancelled?'ملغاة':'مسجلة'}))};
const expenseHistory:Sheet={name:'سجل المصاريف', dated:true,fields:{id,date,title:'البيان',category:'التصنيف',frequency:'الدورية',amount,source:'مصدر الدفع',name:'الشريك',notes,status:'الحالة'},
  rows:s=>s.expenses.map(e=>label({...e,source:e.paidFrom,name:e.partnerName,status:e.isCancelled?'ملغى':'مسجل'}))};
export const sheetsBySection = {
  products:{title:'المنتجات والتسعير',permission:'catalog',sheets:{
    products:{name:'المنتجات',input:true,fields:{...identifiers,code,barcode:'الباركود',category:'النوع',unit,retail:'سعر البيع',wholesale:'سعر الجملة',min:'حد الطلب'},
      rows:s=>[...s.items.map(i=>label({...i,category:categoryLabel(i.category),unit:i.baseUnit,retail:i.retailPrice,wholesale:i.wholesalePrice,min:i.minStock})),
        ...s.catalogNameDrafts.map(d=>label({id:d.id,name:d.name,code:d.definition?.code,category:d.definition?categoryLabel(d.definition.category):'',unit:d.definition?.baseUnit,retail:d.definition?.retailPrice,min:d.definition?.minStock,barcode:'',wholesale:''}))]},
  }},
  recipes:{title:'الوصفات',permission:'catalog',sheets:{
    recipes:{name:'الوصفات',fields:{...identifiers,code,status:'الحالة'},
      rows:s=>[...s.items.filter(i=>i.hasRecipe).map(i=>label({id:i.id,name:i.name,code:i.code,status:'معتمدة'})),...s.catalogNameDrafts.filter(i=>i.definition).map(i=>label({id:i.id,name:i.name,code:i.definition?.code,status:'تحت الاستكمال'}))]},
    ingredients:{name:'المكونات',input:true,fields:{code,ingredient:'كود المكوّن',quantity:'الكمية',unit,action:'الإجراء'},
      rows:s=>s.items.flatMap(i=>(i.recipe??[]).map(l=>label({code:i.code,ingredient:s.items.find(c=>c.id===l.ingredientId)?.code,quantity:l.quantity,unit:l.unit})))},
  }},
  inventory:{title:'مخزن البن',sheets:{stock:{name:'الأرصدة',fields:stockFields,rows:s=>s.items.filter(isStockItem).map(stockRow)}}},
  shortages:{title:'النواقص',sheets:{stock:{name:'النواقص',fields:stockFields,rows:s=>s.items.filter(i=>isStockItem(i)&&i.stock<=i.minStock).map(stockRow)}}},
  stocktaking:{title:'جرد الميزان',permission:'stocktaking',sheets:{
    counts:{name:'كميات الجرد',input:true,fields:{...identifiers,code,unit,stock:'رصيد وقت التنزيل',cost:'تكلفة وقت التنزيل',actual:'الكمية الفعلية'},
      rows:s=>s.items.filter(isStockItem).map(i=>({...stockRow(i),actual:'',revision:stockRevision(s,i.id)}))},
    history:{name:'محاضر الجرد',dated:true,fields:{id,date,number:'رقم المحضر',shortage:'قيمة العجز',surplus:'قيمة الزيادة',net:'صافي الفرق',notes},
      rows:s=>s.stocktakingRecords.map(i=>label({...i,number:i.auditNumber,shortage:i.totalShortageValue,surplus:i.totalSurplusValue,net:i.netVarianceValue}))},
    historyLines:{name:'تفاصيل فروق الجرد',dated:true,fields:{id,date,name:'الصنف',unit,stock:'الرصيد قبل الجرد',actual:'الكمية الفعلية',difference:'الفرق',value:'قيمة الفرق'},
      rows:s=>s.stocktakingRecords.flatMap(i=>i.itemsAudited.map(l=>label({id:i.id,date:i.date,name:l.itemName,unit:l.baseUnit,stock:l.systemStock,actual:l.actualStock,difference:l.difference,value:l.financialDifference})))},
  }},
  customers:{title:'عملاء الجملة',permission:'contacts',sheets:{
    contacts:{name:'العملاء',input:true,fields:{...identifiers,phone:'التليفون',area:'المنطقة',type:'نوع العميل'},
      rows:s=>s.customers.map(label)}, payments:payments('customer'), history:paymentHistory('customer'), balances:accountBalances('customer'),
  }},
  suppliers:{title:'الموردون',permission:'contacts',sheets:{
    contacts:{name:'الموردون',input:true,fields:{...identifiers,phone:'التليفون',address:'العنوان',representativeName:'المندوب',category:'التصنيف'},
      rows:s=>s.suppliers.map(label)}, payments:payments('supplier'), history:paymentHistory('supplier'), balances:accountBalances('supplier'),
  }},
  production:{title:'إنتاج التوليفات',permission:'production',sheets:{
    new:{name:'أوامر جديدة',input:true,fields:{code,quantity:'الكمية بالكيلو',notes},rows:()=>[]},
    history:{name:'التشغيلات',dated:true,fields:{id,date,number:'رقم التشغيلة',name:'التوليفة',quantity:'الكمية بالكيلو',cost:'التكلفة',notes},
      rows:s=>s.productionBatches.map(i=>label({...i,number:i.batchNumber,name:i.blendName,quantity:i.quantityProducedKg,cost:i.totalBatchCost}))},
    ingredients:{name:'خامات التشغيلات',dated:true,fields:{id,date,name:'الخام',quantity:'الكمية بالوحدة الأساسية',display:'الكمية المسجلة',cost:'التكلفة'},
      rows:s=>s.productionBatches.flatMap(i=>i.ingredientsConsumed.map(l=>label({id:i.id,date:i.date,name:l.ingredientName,quantity:l.quantityUsed,display:l.displayQuantity,cost:l.cost})))},
  }},
  purchase:{title:'المشتريات',permission:'purchases',sheets:{
    new:{name:'فواتير جديدة',input:true,fields:{...invoice,tax:'الضريبة',notes},rows:()=>[]},
    lines:{name:'بنود الفواتير الجديدة',input:true,fields:lines,rows:()=>[]},
    history:purchaseHistory,
    historyLines:{name:'بنود سجل الشراء',dated:true,fields:{id,date,name:'الصنف',quantity:'الكمية',unit,price:'سعر الشراء'},
      rows:s=>s.purchaseInvoices.flatMap(i=>i.items.map(l=>label({id:i.id,date:i.date,name:l.itemName,quantity:l.quantity,unit:l.unit,price:l.purchasePrice})))},
    accounts:{name:'مرجع الموردين',fields:identifiers,rows:s=>s.suppliers.map(label)},
    items:{name:'مرجع المنتجات',fields:{...identifiers,code,unit},rows:s=>s.items.map(stockRow)},
  }},
  sales_pos:{title:'فواتير الجملة',permission:'sales',sheets:{
    new:{name:'فواتير جديدة',input:true,fields:{...invoice,discount:'الخصم',paid:'المدفوع',method:'طريقة الدفع'},rows:()=>[]},
    lines:{name:'بنود الفواتير الجديدة',input:true,fields:lines,rows:()=>[]},
    history:{...saleHistory, rows:s=>saleHistory.rows({...s,salesInvoices:s.salesInvoices.filter(i=>i.saleType==='wholesale')})},
    historyLines:{...saleLines,rows:s=>saleLines.rows({...s,salesInvoices:s.salesInvoices.filter(i=>i.saleType==='wholesale')})},
    accounts:{name:'مرجع العملاء',fields:identifiers,rows:s=>s.customers.map(label)},
    items:{name:'مرجع التوليفات',fields:{...identifiers,code,unit},rows:s=>s.items.filter(i=>i.category==='manufactured_blend').map(stockRow)},
  }},
  expenses:{title:'المصاريف',permission:'expenses',sheets:{
    new:{name:'مصروفات جديدة',input:true,fields:{date,title:'البيان',category:'التصنيف',frequency:'الدورية',amount,source:'مصدر الدفع',notes},rows:()=>[]},history:expenseHistory,
  }},
  staff_payroll:{title:'العمال والرواتب',permission:'staff',sheets:{
    staff:{name:'العاملون',input:true,fields:{...identifiers,phone:'التليفون',role:'الدور',salaryType:'نظام الأجر',baseMonthlySalary:'الراتب الشهري',dailyRate:'الأجر اليومي'},rows:s=>s.employees.map(label)},
    new:{name:'حركات عمال جديدة',input:true,fields:{account,type:'نوع الحركة',amount,source:'مصدر الدفع',notes},rows:()=>[]},
    history:{name:'سجل الحركات',dated:true,fields:{id,date,account,name:'العامل',type:'نوع الحركة',amount,source:'مصدر الدفع',notes,status:'الحالة'},
      rows:s=>s.employeeTransactions.map(t=>label({...t,account:t.employeeId,name:t.employeeName,source:t.paidFrom,status:t.reversedAt?'معكوسة':'مسجلة'}))},
  }},
  partners:{title:'الشركاء والحصص',permission:'partners',owner:true,sheets:{
    partners:{name:'الشركاء',input:true,fields:{...identifiers,share:'نسبة الحصة'},rows:s=>s.partners.map(p=>label({...p,share:p.sharePercent}))},
    balances:{name:'أرصدة الشركاء',fields:{...identifiers,contributions:'المساهمات',withdrawals:'المسحوبات'},
      rows:s=>s.partners.map(p=>label({...p,contributions:p.totalPaidFromPocket,withdrawals:p.totalWithdrawals}))},
    new:{name:'حركات الشركاء الجديدة',input:true,fields:{date,account,type:'نوع الحركة',title:'البيان',category:'تصنيف المصروف الممول',amount,source:'مصدر الدفع',notes},rows:()=>[]},
    history:{...expenseHistory,name:'حركات الشركاء المسجلة',rows:s=>expenseHistory.rows({...s,expenses:s.expenses.filter(e=>e.category==='مسحوبات شركاء'||e.paidFrom==='من جيب الشريك')})},
  }},
  cashier_sync:{title:'تقارير يوم الكاشير',sheets:{history:cashierHistory,items:cashierItems}},
  sales_invoices:{title:'سجل البيع',sheets:{invoices:saleHistory,cashier:cashierHistory,
    lines:saleLines,cashierItems,
  }},
} satisfies Record<string,Section>;
export type ExcelSection = keyof typeof sheetsBySection;
export const sheetSection = (section:ExcelSection):Section => sheetsBySection[section];

export function stockRevision(state:StoreState,id:string):string {
  return [
    state.stocktakingRecords.find(v=>v.itemsAudited.some(l=>l.itemId===id))?.id,
    state.purchaseInvoices.find(v=>v.items.some(l=>l.itemId===id))?.id,
    state.salesInvoices.find(v=>v.items.some(l=>l.itemId===id))?.id,
    state.productionBatches.find(v=>v.blendId===id||v.ingredientsConsumed.some(l=>l.ingredientId===id))?.id,
    state.cashierDays.find(v=>v.status==='approved'&&v.consumption?.some(l=>l.itemId===id))?.id,
    state.items.find(i=>i.id===id)?.costHistory?.slice(-1)[0]?.id,
  ].join('|');
}

const identification = '_Agouz';
const previous = 'البيانات الأصلية';
const maxRows = 2000;
const maxBytes = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function createExcelWorkbook(section:ExcelSection,state:StoreState,range?:{from:string;to:string},writable?:Set<string>){
  const xlsx = await import('xlsx');
  const book = xlsx.utils.book_new();
  const config = sheetSection(section);
  const instructions = [
    ['ملف Excel — '+config.title],
    ['التعديل','استخدم التبويبات القابلة للرفع. سيظهر ملخص التغييرات قبل الاعتماد.'],
    ['الإضافة','أضف صفًا جديدًا واترك معرّف السجل والبيانات الأصلية فارغين.'],
    ['معرّف السجل','احتفظ بمعرّف السجل والبيانات الأصلية. حذف الصف لا يحذف السجل.'],
    ['الوحدات','kg كيلو، gram جرام، piece قطعة، count عدد، liter لتر، ml ملّي.'],
    ['الأكواد والتواريخ','اكتب الأكواد والتليفونات كنص، والتواريخ بصيغة YYYY-MM-DD.'],
    ['الفواتير','اربط كل بند بمرجع الفاتورة من التبويب الأول. الكميات بوحدة المنتج الأساسية.'],
    ['مصادر الدفع','درج المحل، خزنة الشركة، أو من جيب الشريك حسب نوع الحركة. الدورية daily يومي أو monthly_fixed شهري ثابت.'],
    ['الوصفات','لتعديل المقادير عدّل صف المكوّن. لإزالته من الوصفة اكتب حذف في عمود الإجراء.'],
    ['اعتماد الملف','بعد اعتماد أي تغييرات، نزّل ملفًا جديدًا للدفعة التالية.'],
  ];
  xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet(instructions),'طريقة الاستخدام');
  for (const [key, sheet] of Object.entries(config.sheets)) {
    if (writable && sheet.input && sheet.rows(state).length===0 && !writable.has(key)) continue;
    const keys = Object.keys(sheet.fields);
    const editable = sheet.input && (!writable || writable.has(key));
    const content = sheet.rows(state).filter(row=>!sheet.dated||!range||((!range.from||String(row.date)>=range.from)&&(!range.to||String(row.date)<=range.to)));
    const data = content.map(row=>{
      const values = keys.map(key=>row[key]??'');
      return editable?[...values,JSON.stringify({...Object.fromEntries(keys.map((key,index)=>[key,values[index]])),...(row.revision!==undefined?{revision:row.revision}:{})})]:values;
    });
    const ws = xlsx.utils.aoa_to_sheet([[...Object.values(sheet.fields),...(editable?[previous]:[])],...data]);
    ws['!cols'] = [...keys.map(key=>({wch:key==='id'||key==='account'?38:22})),...(editable?[{hidden:true}]:[])];
    xlsx.utils.book_append_sheet(book,ws,sheet.name);
  }
  xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([[1,section,crypto.randomUUID()]]),identification);
  xlsx.utils.book_set_sheet_visibility(book,identification,1);
  return {xlsx,book};
}
export async function downloadExcelWorkbook(section:ExcelSection,state:StoreState,range?:{from:string;to:string},writable?:Set<string>){
  const {xlsx,book}=await createExcelWorkbook(section,state,range,writable);
  xlsx.writeFile(book,configFileName(section));
}
const configFileName = (section:ExcelSection)=>sheetSection(section).title.replace(/ /g,'_')+'_'+businessDate()+'.xlsx';

export async function readExcelWorkbook(file:Pick<File,'name'|'size'|'arrayBuffer'>,section:ExcelSection,writable:Set<string>):Promise<ExcelFile> {
  if (!/\.xlsx$/i.test(file.name)||file.size===0||file.size>maxBytes) throw Error('اختر ملف Excel بصيغة XLSX حتى 4 ميجابايت.');
  const bytes=await file.arrayBuffer();
  // Verify the ZIP directory and bound the uncompressed workbook before parsing.
  const zip=new DataView(bytes);
  let end=bytes.byteLength-22;
  for (;end>=Math.max(0,bytes.byteLength-65557);end--) {
    if (zip.getUint32(end,true)===0x06054b50 && end+22+zip.getUint16(end+20,true)===bytes.byteLength) break;
  }
  if(end<Math.max(0,bytes.byteLength-65557)) throw Error('ملف Excel تالف أو محمي بكلمة مرور.');
  let entry=zip.getUint32(end+16,true), total=0;
  const count=zip.getUint16(end+10,true);
  if(count>128 || zip.getUint16(end+4,true)!==0 || zip.getUint16(end+6,true)!==0) throw Error('بنية ملف Excel خارج الحدود المدعومة.');
  for(let i=0;i<count;i++){
    if(entry+46>end||zip.getUint32(entry,true)!==0x02014b50) throw Error('ملف Excel تالف.');
    total+=zip.getUint32(entry+24,true);
    if(total>32*1024*1024) throw Error('حجم البيانات داخل ملف Excel كبير.');
    entry+=46+zip.getUint16(entry+28,true)+zip.getUint16(entry+30,true)+zip.getUint16(entry+32,true);
  }
  const xlsx = await import('xlsx');
  const book = xlsx.read(bytes,{type:'array',cellFormula:true,cellHTML:false,cellText:false,sheetRows:maxRows+2});
  const meta = book.Sheets[identification];
  const [version,kind,operation] = meta ? (xlsx.utils.sheet_to_json<Cell[]>(meta,{header:1})[0]??[]) : [];
  if(version!==1||kind!==section||typeof operation!=='string'||!uuid.test(operation)) throw Error('نزّل ملف Excel من القسم نفسه، ثم عدّل القالب وارفعه.');
  const rows:ExcelFile['rows']={};
  for (const [key,sheet] of Object.entries(sheetSection(section).sheets)) {
    if (!sheet.input||!writable.has(key)) continue;
    const sheetData=book.Sheets[sheet.name];
    if(!sheetData) throw Error('تبويب «'+sheet.name+'» مطلوب.');
    const ref=xlsx.utils.decode_range(sheetData['!fullref']??sheetData['!ref']??'A1');
    const keys=Object.keys(sheet.fields);
    if(ref.e.r>maxRows||ref.e.c>keys.length) throw Error('عدد الصفوف أو الأعمدة أكبر من حد الاستيراد في «'+sheet.name+'».');
    const input=xlsx.utils.sheet_to_json<Cell[]>(sheetData,{header:1,defval:'',raw:true,blankrows:true});
    const header=input.shift()??[];
    const expected=[...Object.values(sheet.fields),previous];
    if(expected.some(title=>header.filter(value=>value===title).length!==1)||header.some(value=>value!==''&&!expected.includes(String(value)))) throw Error('أعمدة «'+sheet.name+'» اتغيرت. استخدم رؤوس الأعمدة في القالب.');
    rows[key]=input.flatMap((values,index)=>{
      const line=index+2;
      const parsed:Values={};
      for(const field of keys){
        const at=header.indexOf(sheet.fields[field]);
        const cell=sheetData[xlsx.utils.encode_cell({r:line-1,c:at})];
        if(cell?.f||cell?.t==='e') throw Error('استخدم قيمة مباشرة في «'+sheet.name+'»، صف '+line+'، عمود «'+sheet.fields[field]+'».');
        let value=values[at]??'';
        if(field==='date'&&typeof value==='number') {
          const date=xlsx.SSF.parse_date_code(value,{date1904:book.Workbook?.WBProps?.date1904});
          if(!date||date.H||date.M||date.S||date.u) throw Error('تاريخ غير صالح في «'+sheet.name+'»، صف '+line+'.');
          value=[date.y,String(date.m).padStart(2,'0'),String(date.d).padStart(2,'0')].join('-');
        }
        if(typeof value!=='string'&&typeof value!=='number') throw Error('نوع خلية غير مدعوم في «'+sheet.name+'»، صف '+line+'، عمود «'+sheet.fields[field]+'».');
        parsed[field]=typeof value==='string'?value.trim():value;
      }
      const snapshot=values[header.indexOf(previous)];
      if(snapshot!==undefined&&snapshot!==''){
        try{
          if(typeof snapshot!=='string') throw Error();
          const original=JSON.parse(snapshot) as Values;
          if(!original||typeof original!=='object'||Object.keys(original).length!==keys.length+(key==='counts'?1:0)||keys.some(key=>typeof original[key]!=='string'&&typeof original[key]!=='number')) throw Error();
          return [{line,values:parsed,original}];
        }catch{throw Error('البيانات الأصلية اتغيرت في «'+sheet.name+'»، صف '+line+'. نزّل القالب مرة تانية.');}
      }
      return Object.values(parsed).some(value=>value!=='')?[{line,values:parsed}]:[];
    });
  }
  return {id:operation.toLowerCase(),section,rows};
}
