import type {CashierDay,CashierReportFile,SalesInvoice} from '../types/erp';
import type {StoreState} from './storeState';
import {cashierCostDetails,correctedCashierCost} from './cashierCosts';
import {inventoryDeductions,deductInventory} from './inventory';
import {multiplyMoney,roundMoney,sumMoney} from './money';
function validDate(date:string){const value=new Date(date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==date)throw Error('تاريخ يوم الكاشير غير صالح');}
type Report = {type:'financial';file:CashierReportFile;totalRevenue:number}|{type:'items';file:CashierReportFile;lines:NonNullable<CashierDay['itemsReport']>['lines']};
export function attachCashierReport(state:StoreState,date:string,report:Report):StoreState{
 validDate(date);
 if(state.salesInvoices.some(i=>i.saleType==='cashier_sync'&&i.date===date))throw Error('اليوم مسجل سابقًا بالنظام القديم؛ راجع سجل المبيعات قبل رفعه');
 const current=state.cashierDays.find(d=>d.date===date)??{id:crypto.randomUUID(),date,status:'pending' as const};
 if(current.status==='approved')throw Error('يوم الكاشير معتمد بالفعل');
 const key=report.type==='financial'?'financialReport':'itemsReport';
 if(current[key])throw Error('تم رفع هذا النوع من التقرير لنفس التاريخ؛ لا يمكن تكراره');
 if(state.cashierDays.some(d=>[d.financialReport,d.itemsReport].some(r=>r?.sha256===report.file.sha256)))throw Error('هذا الملف مرفوع بالفعل؛ راجع تاريخ يوم العمل');
 if(report.type==='financial'&&(!Number.isFinite(report.totalRevenue)||report.totalRevenue<0))throw Error('إيراد اليوم غير صالح');
 if(report.type==='items'){
  if(!report.lines.length)throw Error('تقرير الأصناف فارغ');
  inventoryDeductions(report.lines,state.items);
 }
 const next:CashierDay=report.type==='financial'?{...current,financialReport:{...report.file,totalRevenue:roundMoney(report.totalRevenue)}}:{...current,itemsReport:{...report.file,lines:report.lines}};
 return {...state,cashierDays:[next,...state.cashierDays.filter(d=>d.id!==next.id)]};
}
export function cashierDayImpact(lines:NonNullable<CashierDay['itemsReport']>['lines'],catalog:StoreState['items'],date:string) {
 const needs=inventoryDeductions(lines,catalog);
 const items=deductInventory(lines,catalog,{allowNegative:true,date});
 const byId=new Map(catalog.map(item=>[item.id,item]));
 const consumption=[...needs].map(([itemId,quantity])=>{
  const item=byId.get(itemId)!;
  return {itemId,quantity,unitCost:item.costPrice,totalCost:multiplyMoney(quantity,item.costPrice)};
 });
 const shortages=items.filter(item=>needs.has(item.id)&&item.stock<0).map(item=>({itemId:item.id,shortage:-item.stock}));
 return {items,consumption,shortages,totalCost:sumMoney(consumption.map(line=>line.totalCost))};
}
export function approveCashierDay(state:StoreState,id:string,actor:string):StoreState{
 const day=state.cashierDays.find(d=>d.id===id);
 if(!day||day.status!=='pending'||!day.itemsReport||!day.financialReport)throw Error('يلزم التقرير المالي وتقرير الأصناف لنفس اليوم قبل الاعتماد');
 const {items,consumption,shortages,totalCost}=cashierDayImpact(day.itemsReport.lines,state.items,day.date);
 const next:CashierDay={...day,status:'approved',approvedAt:new Date().toISOString(),partnerName:actor,consumption,shortages,totalCost};
 return {...state,items,cashierDays:state.cashierDays.map(d=>d.id===id?next:d),auditLogs:[{id:crypto.randomUUID(),timestamp:next.approvedAt!,partnerName:actor,actionType:'مزامنة كاشير',description:`اعتماد يوم الكاشير ${day.date} بالتقريرين؛ ${shortages.length} أصناف بعجز`,amount:day.financialReport.totalRevenue},...state.auditLogs]};
}
// Derived reporting view only: no second sales document or invented item revenue is persisted.
export type ReportSale=Omit<SalesInvoice,'totalCost'|'netProfit'>&{totalCost:number|null;netProfit:number|null};
export function salesForReports(state:Pick<StoreState,'salesInvoices'|'cashierDays'>&Partial<Pick<StoreState,'purchaseInvoices'>>):ReportSale[]{
 const details=cashierCostDetails(state.cashierDays,state.purchaseInvoices??[]);
 return [...state.salesInvoices,...state.cashierDays.filter(d=>d.financialReport).map(d=>{
  const revenue=d.financialReport!.totalRevenue;
  const cost=d.status==='approved'?correctedCashierCost(d,details.get(d.id))??null:null;
  return {id:d.id,invoiceNumber:`DAY-${d.date}`,date:d.date,saleType:'cashier_sync' as const,customerName:'مبيعات يوم الكاشير',
   items:[],subtotal:revenue,discount:0,totalAmount:revenue,totalCost:cost,netProfit:cost===null?null:sumMoney([revenue,-cost]),
   paidAmount:revenue,remainingAmount:0,paymentMethod:'نقدي' as const,partnerName:d.partnerName??'تقرير مالي'};
 })];
}
