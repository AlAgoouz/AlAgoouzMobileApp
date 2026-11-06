import type {CashierDay,CashierReportFile,SalesInvoice} from '../types/erp';
import type {StoreState} from './storeState';
import {inventoryDeductions,deductInventory} from './inventory';
const round=(n:number)=>Number(n.toFixed(2));
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
 const next:CashierDay=report.type==='financial'?{...current,financialReport:{...report.file,totalRevenue:round(report.totalRevenue)}}:{...current,itemsReport:{...report.file,lines:report.lines}};
 return {...state,cashierDays:[next,...state.cashierDays.filter(d=>d.id!==next.id)]};
}
export function approveCashierDay(state:StoreState,id:string,actor:string):StoreState{
 const day=state.cashierDays.find(d=>d.id===id);
 if(!day||day.status!=='pending'||!day.itemsReport||!day.financialReport)throw Error('يلزم التقرير المالي وتقرير الأصناف لنفس اليوم قبل الاعتماد');
 const needs=inventoryDeductions(day.itemsReport.lines,state.items);
 const consumption=[...needs].map(([itemId,quantity])=>{const raw=state.items.find(i=>i.id===itemId)!;return {itemId,quantity,unitCost:raw.costPrice,totalCost:round(quantity*raw.costPrice)};});
 const items=deductInventory(day.itemsReport.lines,state.items,{allowNegative:true,date:day.date});
 const shortages=items.filter(i=>needs.has(i.id)&&i.stock<0).map(i=>({itemId:i.id,shortage:Number((-i.stock).toFixed(6))}));
 const next:CashierDay={...day,status:'approved',approvedAt:new Date().toISOString(),partnerName:actor,consumption,shortages,totalCost:round(consumption.reduce((s,l)=>s+l.totalCost,0))};
 return {...state,items,cashierDays:state.cashierDays.map(d=>d.id===id?next:d),auditLogs:[{id:crypto.randomUUID(),timestamp:next.approvedAt!,partnerName:actor,actionType:'مزامنة كاشير',description:`اعتماد يوم الكاشير ${day.date} بالتقريرين؛ ${shortages.length} أصناف بعجز`,amount:day.financialReport.totalRevenue},...state.auditLogs]};
}
// Derived reporting view only: no second sales document or invented item revenue is persisted.
export type ReportSale=Omit<SalesInvoice,'totalCost'|'netProfit'>&{totalCost:number|null;netProfit:number|null};
export function salesForReports(state:Pick<StoreState,'salesInvoices'|'cashierDays'>):ReportSale[]{
 return [...state.salesInvoices,...state.cashierDays.filter(d=>d.financialReport).map(d=>({id:d.id,invoiceNumber:`DAY-${d.date}`,date:d.date,saleType:'cashier_sync' as const,customerName:'مبيعات يوم الكاشير',items:[],subtotal:d.financialReport!.totalRevenue,discount:0,totalAmount:d.financialReport!.totalRevenue,totalCost:d.status==='approved'?d.totalCost!:null,netProfit:d.status==='approved'?round(d.financialReport!.totalRevenue-d.totalCost!):null,paidAmount:d.financialReport!.totalRevenue,remainingAmount:0,paymentMethod:'نقدي' as const,partnerName:d.partnerName??'تقرير مالي'}))];
}
