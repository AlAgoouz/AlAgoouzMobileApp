import type {StoreState} from './storeState';
import {businessDate} from './dates';
import {validCalendarDate} from './reporting';
import type {StoreEngine} from './storeEngine';

function cents(value:number){
 const n=Math.round(value*100);
 if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(n)||Math.abs(value*100-n)>0.0001)throw Error('قيمة مالية غير مؤكدة');
 return BigInt(n);
}
function units(value:bigint){const n=Number(value);if(!Number.isSafeInteger(n))throw Error('تجاوز حد دقة الرصيد');return n/100;}
export function recordFinancialOpening(state:StoreState,date:string,amount:number,reason:string,actor:{id:string;name:string}){
 if(!validCalendarDate(date)||date>businessDate())throw Error('تاريخ بداية المدة غير صالح أو في المستقبل');
 cents(amount);if(amount>999999999999.99)throw Error('رصيد أول المدة أكبر من الحد المسموح');
 reason=reason.trim();if(reason.length<6||reason.length>500)throw Error('اكتب بيانًا واضحًا من 6 إلى 500 حرف');
 const old=state.financialOpenings[0];if(old&&date!==old.date)throw Error('تاريخ بداية المدة ثابت؛ يمكنك تصحيح المبلغ مع تسجيل السبب');
 const event={id:crypto.randomUUID(),recordedAt:new Date().toISOString(),actorId:actor.id,actorName:actor.name,amount,reason};
 return {...state,financialOpenings:[{id:old?.id??crypto.randomUUID(),date,account:'treasury' as const,amount,priorPeriodSettled:true as const,history:[...(old?.history??[]),event]}]};
}

export async function saveFinancialOpening(engine:StoreEngine,date:string,amount:number,reason:string,actor:{id:string;name:string}){
 const confirm=async()=>{await engine.flush();if(engine.snapshot.status!=='ready')throw Error(engine.snapshot.error||'لم يصل تأكيد حفظ رصيد البداية');};
 // Retry an uncertain operation with its existing id before making a correction.
 // Otherwise a lost acknowledgement could append two events against one version.
 if(engine.hasPending){
  await confirm();
  const saved=engine.state.financialOpenings[0],last=saved?.history[saved.history.length-1];
  if(saved?.date===date&&saved.amount===amount&&last?.reason===reason.trim()&&last.actorId===actor.id)return;
 }
 engine.replace(recordFinancialOpening(engine.state,date,amount,reason,actor));
 await confirm();
}

// Cash movements are derived from documents, never persisted as extra sales.
// Active allocations are removed from invoice paidAmount before collections
// are counted at their own dates, including reversals and cross-period debt.
export function financialPosition(state:StoreState,from:string,to:string){
 const opening=state.financialOpenings[0];
 if(!opening||!validCalendarDate(from)||!validCalendarDate(to)||from>to||to<opening.date)return null;
 const start=from>opening.date?from:opening.date;
 let brought=cents(opening.amount),inflow=0n,outflow=0n,pendingRefunds=0n;
 const issues=new Set<string>();
 const cash=(date:string,amount:bigint)=>{
  if(!validCalendarDate(date)){issues.add('حركة مالية بلا تاريخ صالح');return;}
  if(date<opening.date||date>to)return;
  if(date<start)brought+=amount;else if(amount>=0)inflow+=amount;else outflow-=amount;
 };
 const timestamp=(value:string|undefined)=>{
  if(!value||!Number.isFinite(Date.parse(value))){issues.add('حركة عكس بلا تاريخ مؤكد');return null;}
  return businessDate(new Date(value));
 };
 const allocated=new Map<string,bigint>();
 const legacyTargets=new Set(state.accountPayments.filter(p=>!p.allocations).map(p=>p.targetType+':'+p.targetId));
 for(const p of state.accountPayments){
  try{if(!p.reversedAt)for(const a of p.allocations??[])allocated.set(p.targetType+':'+a.invoiceId,(allocated.get(p.targetType+':'+a.invoiceId)??0n)+cents(a.amount));}catch{issues.add('توزيع دفعة يحتاج مراجعة');}
 }
 const invoices=[...state.salesInvoices.map(i=>({invoice:i,type:'customer' as const,sign:1n})),...state.purchaseInvoices.map(i=>({invoice:i,type:'supplier' as const,sign:-1n}))];
 for(const {invoice:i,type,sign} of invoices){
  try{
   if(i.date>=opening.date&&i.date<=to&&i.paidAmount>0&&legacyTargets.has(type+':'+('customerId' in i?i.customerId:'supplierId' in i?i.supplierId:'')))issues.add('دفعة قديمة بلا توزيع واضح على الفواتير');
   const initial=cents(i.paidAmount)-(allocated.get(type+':'+i.id)??0n);
   if(initial<0)throw Error();
   cash(i.date,initial*sign);
   if('isReturned' in i&&i.isReturned){const day=timestamp(i.returnedAt);if(day&&day>=opening.date&&day<=to){if(i.returnRefundAmount===undefined)issues.add('مرتجع قديم بلا مبلغ رد مؤكد');else cash(day,-cents(i.returnRefundAmount));}}
   if('isCancelled' in i&&i.isCancelled){const day=timestamp(i.cancelledAt);if(day&&day<=to&&i.refundDue!==undefined)pendingRefunds+=cents(i.refundDue);}
  }catch{issues.add('بيانات سداد فاتورة تحتاج مراجعة');}
 }
 for(const p of state.accountPayments){
  try{const value=cents(p.amount)*(p.targetType==='customer'?1n:-1n);cash(p.date,value);if(p.reversedAt){const day=timestamp(p.reversedAt);if(day)cash(day,-value);}}catch{issues.add('قيمة دفعة تحتاج مراجعة');}
 }
 for(const day of state.cashierDays)if(day.financialReport){
  try{if(!day.financialReport)throw Error();cash(day.date,cents(day.financialReport.totalRevenue));}catch{issues.add('يوم كاشير بلا مبلغ مؤكد');}
 }
 for(const e of state.expenses){
  if(!['درج المحل','خزنة الشركة'].includes(e.paidFrom))continue;
  try{const value=cents(e.amount);cash(e.date,-value);if(e.isCancelled){const day=timestamp(e.cancelledAt);if(day)cash(day,value);}}catch{issues.add('مصروف يحتاج مراجعة');}
 }
 try{return {start,to,opening:issues.size?null:units(brought),inflow:units(inflow),outflow:units(outflow),resources:issues.size?null:units(brought+inflow),closing:issues.size?null:units(brought+inflow-outflow),pendingRefunds:units(pendingRefunds),issues:[...issues]};}
 catch{return {start,to,opening:null,inflow:null,outflow:null,resources:null,closing:null,pendingRefunds:null,issues:['تجاوز حد دقة الرصيد؛ يلزم تضييق الفترة أو مراجعة البيانات']};}
}
