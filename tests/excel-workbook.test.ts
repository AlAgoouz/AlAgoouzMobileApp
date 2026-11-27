import {describe,expect,it} from 'vitest';
import {createExcelWorkbook,readExcelWorkbook,stockRevision,type ExcelFile,type ExcelRow,type ExcelSection} from '../src/lib/excelWorkbook';
import {planExcel,writableExcelSheets} from '../src/lib/excelPlan';
import {emptyStore,fromCloud,toCloud,type StoreState} from '../src/lib/storeState';
import {applyStoreChanges} from '../src/lib/storeChanges';
import type {InventoryItem} from '../src/types/erp';
import type {UserAccess} from '../src/lib/userAccess';
import {businessDate} from '../src/lib/dates';

const owner:UserAccess={userId:'11111111-1111-4111-8111-111111111111',role:'partner',partnerId:'p1',displayName:'Owner',username:'owner',isOwner:true,permissions:{}};
const item:InventoryItem={id:'bean',code:'BEAN',name:'بن',category:'raw_bean',baseUnit:'kg',stock:10,openingStock:10,minStock:1,costPrice:100,lastPurchasePrice:100,retailPrice:150,wholesalePrice:130,canSellDirectly:true,hasRecipe:false,supplierPrices:[]};
const blend:InventoryItem={...item,id:'blend',code:'BLEND',name:'توليفة',category:'manufactured_blend',stock:4,openingStock:4,hasRecipe:true,recipeYield:1,recipe:[{ingredientId:item.id,ingredientName:item.name,quantity:1000,unit:'gram'}]};
const partner={id:'p1',name:'مالك',role:'شريك',avatarLetter:'م',phone:'',username:'partner',sharePercent:100,totalPaidFromPocket:0,totalWithdrawals:0};
const supplier={id:'supplier',name:'مورد',phone:'01012345678',address:'القاهرة',representativeName:'مندوب',category:'بن',balance:0,totalPurchases:0,invoicesCount:0};
const customer={id:'customer',name:'عميل',phone:'01098765432',area:'القاهرة',type:'جملة - تاجر' as const,balance:0,totalSales:0,invoicesCount:0};
const employee={id:'worker',name:'عامل',phone:'01012345678',role:'باريستا' as const,salaryType:'شهري' as const,baseMonthlySalary:1000,dailyRate:0,workedDaysThisMonth:0,totalAdvances:0,totalDeductions:0,totalBonuses:0,totalPaidOut:0};
const base:StoreState={...emptyStore,items:[item,blend],partners:[partner],suppliers:[supplier],customers:[customer],employees:[employee]};
const row=(values:ExcelRow['values'],original?:ExcelRow['values'],line=2):ExcelRow=>({line,values,original});
function plan(section:ExcelSection,rows:ExcelFile['rows'],state=base,member=owner){
  return planExcel({id:'22222222-2222-4222-8222-222222222222',section,rows},state,member,partner.id);
}
function changed(result:ReturnType<typeof plan>,state=base){
  expect(result.issues).toEqual([]);
  expect(result.effects.length).toBeGreaterThan(0);
  return fromCloud(applyStoreChanges(toCloud(state),result.changes));
}
async function roundTrip(section:ExcelSection,edit?:(value:Awaited<ReturnType<typeof createExcelWorkbook>>)=>void){
  const writable=writableExcelSheets(section,owner);
  const workbook=await createExcelWorkbook(section,base,undefined,writable);
  edit?.(workbook);
  const buffer=workbook.xlsx.write(workbook.book,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
  return readExcelWorkbook({name:'agouz.xlsx',size:buffer.byteLength,arrayBuffer:async()=>buffer},section,writable);
}
const productRow={id:item.id,name:item.name,code:item.code,barcode:'',category:'بن خام',unit:'kg',retail:150,wholesale:130,min:1};
const operationalExpense={date:businessDate(),title:'صيانة',category:'صيانة مطاحن وماكينات',frequency:'daily',amount:80,source:'من جيب الشريك',notes:''};

describe('ERP Excel',()=>{
  it('round-trips Arabic product fields, preserves stock and ignores unchanged sheet rows',async()=>{
    const file=await roundTrip('products',({book})=>{
      book.Sheets['المنتجات'].G2={t:'n',v:170};
    });
    const result=planExcel(file,base,owner,'p1');
    expect(result.effects).toEqual([{section:'المنتجات',label:item.name,field:'سعر البيع',before:150,after:170}]);
    expect(changed(result).items.find(i=>i.id===item.id)).toMatchObject({retailPrice:170,stock:10,costPrice:100});
    const noChange=await roundTrip('products');
    expect(planExcel(noChange,base,owner).effects).toEqual([]);
  });
  it('rejects formulas in editable cells and preserves cell addresses',async()=>{
    await expect(roundTrip('products',({book})=>{
      book.Sheets['المنتجات'].G2={t:'n',v:170,f:'100+70'};
    })).rejects.toThrow('عمود «سعر البيع»');
  });
  it('merges edits to a different field, blocks same-field concurrent edits, and never deletes a missing sheet row',()=>{
    const updated={...base,items:[{...item,name:'بن محدث',stock:12},blend]};
    const result=plan('products',{products:[row({...productRow,retail:165},productRow)]},updated);
    expect(changed(result,updated).items).toEqual([expect.objectContaining({id:item.id,name:'بن محدث',stock:12,retailPrice:165}),expect.objectContaining({id:blend.id})]);
    const concurrent={...base,items:[{...item,retailPrice:180},blend]};
    const conflict=plan('products',{products:[row({...productRow,retail:165},productRow)]},concurrent);
    expect(conflict.issues[0]).toMatchObject({line:2,column:'سعر البيع'});
    expect(conflict.changes).toEqual({});
    const collision=plan('products',{products:[row({...productRow,id:'',name:'منتج جديد',code:'bean'})]});
    expect(collision.issues[0]).toMatchObject({line:2,column:'كود المنتج'});
  });
  it('imports a recipe product in draft, then validates ingredients and activates it',()=>{
    const draft=changed(plan('products',{products:[row({name:'مشروب جديد',code:'DRINK',unit:'piece',category:'مشروبات لها وصفة',retail:30,min:0})]}));
    expect(draft.catalogNameDrafts[0].definition).toMatchObject({code:'DRINK',openingStock:0});
    const result=plan('recipes',{ingredients:[row({code:'DRINK',ingredient:'BEAN',quantity:50,unit:'gram'})]},draft);
    const active=changed(result,draft);
    expect(active.catalogNameDrafts).toHaveLength(0);
    expect(active.items.find(i=>i.code==='DRINK')).toMatchObject({costPrice:5,recipe:[{ingredientId:item.id,quantity:50,unit:'gram'}]});
    expect(active.items.find(i=>i.code==='BEAN')?.stock).toBe(10);
    const invalid=plan('recipes',{ingredients:[row({code:'DRINK',ingredient:'BEAN',quantity:50,unit:'ml'})]},draft);
    expect(invalid.issues[0]).toMatchObject({line:2,column:'الوحدة'});
  });
  it('creates one physical count with valuation and catches stock motion even if the balance returns',async()=>{
    const original={id:item.id,name:item.name,code:item.code,unit:'kg',stock:10,cost:100,actual:'',revision:stockRevision(base,item.id)};
    const file=await roundTrip('stocktaking',({book})=>{
      book.Sheets['كميات الجرد'].G2={t:'n',v:8};
    });
    const adjusted=changed(planExcel(file,base,owner));
    expect(adjusted.items.find(i=>i.id===item.id)?.stock).toBe(8);
    expect(adjusted.stocktakingRecords[0]).toMatchObject({totalShortageValue:200,netVarianceValue:-200});
    const sameStock={...adjusted,items:base.items};
    const failed=plan('stocktaking',{counts:[row({...original,actual:8},original)]},sameStock);
    expect(failed.issues[0]).toMatchObject({line:2,column:'الكمية الفعلية'});
  });
  it('validates purchase header and all lines before receiving stock and computing tax and weighted cost',()=>{
    const header=row({reference:'A1',account:supplier.id,date:businessDate(),tax:20});
    const good=row({reference:'A1',code:'BEAN',quantity:5,price:160});
    const bad=row({reference:'A1',code:'UNKNOWN',quantity:1,price:5},undefined,3);
    const invalid=plan('purchase',{new:[header],lines:[good,bad]});
    expect(invalid.issues[0]).toMatchObject({sheet:'بنود الفواتير الجديدة',line:3,column:'كود المنتج'});
    expect(invalid.changes).toEqual({});
    const after=changed(plan('purchase',{new:[header],lines:[good]}));
    expect(after.purchaseInvoices[0]).toMatchObject({netAmount:800,taxAmount:20,totalAmount:820,paidAmount:820,remainingAmount:0});
    expect(after.items.find(i=>i.id===item.id)).toMatchObject({stock:15,costPrice:120});
    expect(after.suppliers[0]).toMatchObject({balance:0,totalPurchases:820,invoicesCount:1});
  });
  it('keeps wholesale stock, payment allocation and customer debt in agreement',()=>{
    const header=row({reference:'A1',account:customer.id,date:businessDate(),paid:100,method:'آجل',discount:0});
    const input=row({reference:'A1',code:'BLEND',quantity:2,price:170});
    const invoice=changed(plan('sales_pos',{new:[header],lines:[input]}));
    expect(invoice.salesInvoices[0]).toMatchObject({totalAmount:340,remainingAmount:240,paidAmount:100});
    expect(invoice.items.find(i=>i.id===blend.id)?.stock).toBe(2);
    const receipt=changed(plan('customers',{payments:[row({account:customer.id,amount:140})]},invoice),invoice);
    expect(receipt.customers[0].balance).toBe(100);
    expect(receipt.salesInvoices[0].remainingAmount).toBe(100);
    expect(receipt.accountPayments[0].allocations).toEqual([{invoiceId:invoice.salesInvoices[0].id,amount:140}]);
  });
  it('processes production atomically and rejects an order consuming beyond stock',()=>{
    const approved=changed(plan('production',{new:[row({code:'BLEND',quantity:2})]}));
    expect(approved.productionBatches[0]).toMatchObject({quantityProducedKg:2,totalBatchCost:200});
    expect(approved.items.map(i=>i.stock)).toEqual([8,6]);
    const invalid=plan('production',{new:[row({code:'BLEND',quantity:2}),row({code:'BLEND',quantity:10},undefined,3)]});
    expect(invalid.issues[0].line).toBe(3);
    expect(invalid.changes).toEqual({});
  });
  it('posts expenses, payroll and partner movements through the ledger with role checks',()=>{
    const expense=changed(plan('expenses',{new:[row(operationalExpense)]}));
    expect(expense.partners[0].totalPaidFromPocket).toBe(80);
    const salary=changed(plan('staff_payroll',{new:[row({account:employee.id,type:'صرف راتب',amount:400,source:'خزنة الشركة'})]}));
    expect(salary.employees[0].totalPaidOut).toBe(400);
    expect(salary.expenses[0].sourceEmployeeTransactionId).toBe(salary.employeeTransactions[0].id);
    const share=changed(plan('partners',{new:[row({...operationalExpense,account:partner.id,type:'مسحوب',source:'خزنة الشركة'})]}));
    expect(share.partners[0].totalWithdrawals).toBe(80);
    const nonOwner={...owner,isOwner:false,permissions:{view:true,partners:true}};
    expect(writableExcelSheets('partners',nonOwner).size).toBe(0);
    expect(writableExcelSheets('customers',{...nonOwner,permissions:{view:true,collections:true}})).toEqual(new Set(['payments']));
  });
});
