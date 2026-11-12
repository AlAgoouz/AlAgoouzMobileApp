import React,{useEffect,useState} from 'react';
import {FileText,Printer} from 'lucide-react';
import {z} from 'zod';
import {OperationHeader} from './OperationHeader';
import {RecordPagination} from './RecordPagination';
import {readRpc,salesPageSchema,type HistoryKind} from '../lib/readModels';
import {CashierDayDetail} from './CashierDayDetail';
import {invoiceDetail,cashierDayDetail} from '../lib/storeState';
import {money} from '../lib/reporting';
import type {CashierDay,SalesInvoice} from '../types/erp';
const InvoiceReceiptModal=React.lazy(()=>import('./ReceiptAndStatementModals').then(m=>({default:m.InvoiceReceiptModal})));
const number=z.number().finite();
const summary=z.object({id:z.string(),invoiceNumber:z.string(),date:z.string(),customerName:z.string(),totalAmount:number,paidAmount:number,remainingAmount:number,netProfit:number,paymentMethod:z.string(),isReturned:z.boolean().optional(),itemsCount:number});
const daySummary=z.object({id:z.string(),date:z.string(),status:z.enum(['pending','approved']),totalCost:number.optional(),financialReport:z.object({totalRevenue:number}).optional(),itemsCount:number});
export function PagedSalesHistory({onBack,onManage,onOpenCustomer}:{onBack:()=>void;onManage?:()=>void;onOpenCustomer?:(id:string)=>void}){
 const [kind,setKind]=useState<HistoryKind|null>(null),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const key=JSON.stringify([kind,query,offset,revision]);
 const [result,setResult]=useState<{key:string;data:z.infer<typeof salesPageSchema>|null;error:string}>({key:'',data:null,error:''});
 const [dayDetail,setDayDetail]=useState<{day:CashierDay;names:Record<string,string>}|null>(null);
 const [receipt,setReceipt]=useState<{invoice:SalesInvoice;phone:string}|null>(null),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState('');
 useEffect(()=>{let alive=true;const timer=setTimeout(()=>{void readRpc('bon_erp_sales_page',{p_kind:kind,p_query:query.trim(),p_offset:offset,p_limit:50}).then(value=>{
  const data=salesPageSchema.parse(value);for(const row of data.rows)(data.kind==='cashier'?daySummary:summary).parse(row);
  if(alive)setResult({key,data,error:''});
 }).catch(()=>{if(alive)setResult({key,data:null,error:'تعذر تحميل السجل؛ أعد المحاولة.'});});},query?250:0);return()=>{alive=false;clearTimeout(timer);};},[key]);
 const data=result.key===key?result.data:null,error=result.key===key?result.error:'',selected=kind??data?.kind;
 const open=async(id:string,kind:'invoice'|'cashier'='invoice')=>{if(detailBusy)return;setDetailBusy(true);setDetailError('');try{const value=await readRpc('bon_erp_sale_detail',{p_id:id,p_kind:kind});if(!value)throw Error();if(kind==='cashier')setDayDetail({day:cashierDayDetail(value),names:z.record(z.string(),z.string()).parse((value as Record<string,unknown>).itemNames??{})});else setReceipt({invoice:invoiceDetail(value),phone:z.object({customerPhone:z.string().optional()}).parse(value).customerPhone??''});}catch{setDetailError('تعذر تحميل تفاصيل الفاتورة. أعد المحاولة.');}finally{setDetailBusy(false);}};
 return <main dir="rtl" className="section-records pb-24">
  <OperationHeader title="سجل المبيعات" description="بحث في السجل كاملًا، مع تحميل الصفحة المطلوبة وتفاصيل الفاتورة عند فتحها." icon={FileText} onBack={onBack}><button onClick={()=>window.print()} aria-label="طباعة الصفحة الحالية"><Printer size={18}/></button>{onManage&&<button onClick={onManage}>إدارة المرتجعات</button>}</OperationHeader>
  <div className="record-workspace"><nav className="record-tabs" aria-label="نوع سجل المبيعات">{([{id:'wholesale',label:'فواتير الجملة'},{id:'cashier',label:'مبيعات أيام الكاشير'},{id:'legacy',label:'السجل السابق'}] as const).map(tab=><button type="button" key={tab.id} aria-pressed={selected===tab.id} onClick={()=>{setKind(tab.id);setOffset(0);}}>{tab.label}</button>)}</nav>
  <label className="record-search">البحث في السجل<input aria-label="بحث في كل الفواتير" maxLength={150} placeholder="رقم الفاتورة أو العميل أو التاريخ أو الصنف" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
  {!data&&!error&&<p role="status" className="record-state">جارٍ تحميل صفحة السجل…</p>}
  {error&&<div role="alert" className="record-state"><p>{error}</p><button onClick={()=>setRevision(n=>n+1)}>إعادة المحاولة</button></div>}
  {detailError&&<p role="alert" className="record-state">{detailError}</p>}
  {data&&<><RecordPagination page={offset/50} pages={Math.max(1,Math.ceil(data.total/50))} total={data.total} pageSize={50} setPage={page=>setOffset(page*50)}/>{!data.rows.length&&<p className="record-state">لا توجد سجلات مطابقة.</p>}
  <div className="record-grid">{data.rows.map(value=>{if(data.kind==='cashier'){const day=daySummary.parse(value);return <article className="record-card" key={day.id}><div className="record-heading"><h2>{day.date}</h2><span className="record-badge">{day.status==='approved'?'معتمد':'بانتظار الاعتماد'}</span></div><p>الإيراد: {day.financialReport?money(day.financialReport.totalRevenue)+' ج.م':'التقرير المالي لم يصل'}</p><p>التكلفة: {day.status==='approved'&&day.totalCost!==undefined?money(day.totalCost)+' ج.م':'تُحدد عند الاعتماد'}</p><p>{day.itemsCount} سطر أصناف</p><button className="record-action" disabled={detailBusy} onClick={()=>void open(day.id,'cashier')}>تفاصيل اليوم والتكلفة</button></article>;}
   const invoice=summary.parse(value);return <article className="record-card" key={invoice.id}><div className="record-heading"><div><p>#{invoice.invoiceNumber} · {invoice.date}</p><h2>{invoice.customerName}</h2></div><span className="record-badge">{invoice.isReturned?'مرتجعة':invoice.paymentMethod}</span></div><dl className="record-facts"><div><dt>الإجمالي</dt><dd>{money(invoice.totalAmount)} ج.م</dd></div><div><dt>المدفوع</dt><dd>{money(invoice.paidAmount)} ج.م</dd></div><div><dt>المتبقي</dt><dd>{money(invoice.remainingAmount)} ج.م</dd></div><div><dt>الأصناف</dt><dd>{invoice.itemsCount}</dd></div></dl><button className="record-action" disabled={detailBusy} onClick={()=>void open(invoice.id)}>طباعة / واتساب</button></article>;
  })}</div></>}
  </div>{dayDetail&&<CashierDayDetail day={dayDetail.day} names={dayDetail.names} onClose={()=>setDayDetail(null)}/>} {receipt&&<React.Suspense fallback={<p role="status">جارٍ فتح الفاتورة…</p>}><InvoiceReceiptModal invoice={receipt.invoice} customerPhone={receipt.phone} onOpenCustomer={onOpenCustomer} onClose={()=>setReceipt(null)}/></React.Suspense>}
 </main>;
}
