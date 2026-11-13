import React,{useEffect,useState} from 'react';
import {FileText,Printer} from 'lucide-react';
import {z} from 'zod';
import {OperationHeader} from './OperationHeader';
import {RecordPagination} from './RecordPagination';
import {ResponsiveRegister} from './ResponsiveRegister';
import {readRpc,salesPageSchema,type HistoryKind} from '../lib/readModels';
import {CashierDayDetail} from './CashierDayDetail';
import {invoiceDetail,cashierDayDetail} from '../lib/storeState';
import {money} from '../lib/reporting';
import type {CashierDay,SalesInvoice} from '../types/erp';
const InvoiceReceiptModal=React.lazy(()=>import('./ReceiptAndStatementModals').then(m=>({default:m.InvoiceReceiptModal})));
const number=z.number().finite();
const summary=z.object({id:z.string(),invoiceNumber:z.string(),date:z.string(),customerName:z.string(),totalAmount:number,paidAmount:number,remainingAmount:number,netProfit:number,paymentMethod:z.string(),isReturned:z.boolean().optional(),itemsCount:number});
const daySummary=z.object({id:z.string(),date:z.string(),status:z.enum(['pending','approved']),totalCost:number.optional(),financialReport:z.object({totalRevenue:number}).optional(),itemsCount:number});
export type SalesHistoryView = {kind:HistoryKind|null;query:string;offset:number};
export const initialSalesHistoryView:SalesHistoryView={kind:null,query:'',offset:0};
export function PagedSalesHistory({onBack,onManage,onOpenCustomer,view=initialSalesHistoryView,onViewChange}:{onBack:()=>void;onManage?:()=>void;onOpenCustomer?:(id:string)=>void;view?:SalesHistoryView;onViewChange?:(view:SalesHistoryView)=>void}){
 const [localView,setLocalView]=useState(view),[revision,setRevision]=useState(0);
 const {kind,query,offset}=onViewChange?view:localView;
 const change=(patch:Partial<SalesHistoryView>)=>(onViewChange??setLocalView)({kind,query,offset,...patch});
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
  <div className="record-workspace"><nav className="record-tabs" aria-label="نوع سجل المبيعات">{([{id:'wholesale',label:'فواتير الجملة'},{id:'cashier',label:'مبيعات أيام الكاشير'},{id:'legacy',label:'السجل السابق'}] as const).map(tab=><button type="button" key={tab.id} aria-pressed={selected===tab.id} onClick={()=>{change({kind:tab.id,offset:0});}}>{tab.label}</button>)}</nav>
  <label className="record-search">البحث في السجل<input aria-label="بحث في كل الفواتير" maxLength={150} placeholder="رقم الفاتورة أو العميل أو التاريخ أو الصنف" value={query} onChange={e=>{change({query:e.target.value,offset:0});}}/></label>
  {!data&&!error&&<p role="status" className="record-state">جارٍ تحميل صفحة السجل…</p>}
  {error&&<div role="alert" className="record-state"><p>{error}</p><button onClick={()=>setRevision(n=>n+1)}>إعادة المحاولة</button></div>}
  {detailError&&<p role="alert" className="record-state">{detailError}</p>}
  {data&&<><RecordPagination page={offset/50} pages={Math.max(1,Math.ceil(data.total/50))} total={data.total} pageSize={50} setPage={page=>change({offset:page*50})}/>{!data.rows.length&&<p className="record-state">لا توجد سجلات مطابقة.</p>}
  {data.rows.length>0&&(data.kind==='cashier'
    ? <ResponsiveRegister label="أيام الكاشير" rows={data.rows.map(row=>daySummary.parse(row))} columns={[
      {title:'اليوم',render:day=><time dateTime={day.date}>{day.date}</time>},
      {title:'الإيراد',render:day=>day.financialReport?money(day.financialReport.totalRevenue)+' ج.م':'التقرير المالي لم يصل'},
      {title:'التكلفة',render:day=>day.status==='approved'&&day.totalCost!==undefined?money(day.totalCost)+' ج.م':'تُحدد عند الاعتماد'},
      {title:'الحالة',render:day=><span className="record-badge">{day.status==='approved'?'معتمد':'بانتظار الاعتماد'}</span>},
      {title:'التفاصيل',render:day=><button type="button" className="record-action" disabled={detailBusy} onClick={()=>void open(day.id,'cashier')}>تفاصيل اليوم والتكلفة</button>},
    ]}/>
    : <ResponsiveRegister label="فواتير البيع" rows={data.rows.map(row=>summary.parse(row))} columns={[
      {title:'الفاتورة',render:invoice=><><b>{invoice.customerName}</b><p dir="ltr">#{invoice.invoiceNumber}</p></>},
      {title:'التاريخ',render:invoice=><time dateTime={invoice.date}>{invoice.date}</time>},
      {title:'الإجمالي',render:invoice=><b>{money(invoice.totalAmount)} ج.م</b>},
      {title:'المدفوع',render:invoice=>money(invoice.paidAmount)+' ج.م'},
      {title:'المتبقي',render:invoice=>money(invoice.remainingAmount)+' ج.م'},
      {title:'الحالة',render:invoice=><span className="record-badge">{invoice.isReturned?'مرتجعة':invoice.paymentMethod}</span>},
      {title:'التفاصيل',render:invoice=><button type="button" className="record-action" disabled={detailBusy} onClick={()=>void open(invoice.id)}>طباعة / واتساب</button>},
    ]}/>)}</>}
  </div>{dayDetail&&<CashierDayDetail day={dayDetail.day} names={dayDetail.names} onClose={()=>setDayDetail(null)}/>} {receipt&&<React.Suspense fallback={<p role="status">جارٍ فتح الفاتورة…</p>}><InvoiceReceiptModal invoice={receipt.invoice} customerPhone={receipt.phone} onOpenCustomer={onOpenCustomer} onClose={()=>setReceipt(null)}/></React.Suspense>}
 </main>;
}
