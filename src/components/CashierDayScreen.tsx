import {unitLabel as displayUnit} from '../lib/units';
import React,{useState,useMemo} from 'react';
import {FolderSync} from 'lucide-react';
import type {ImportJob} from '../lib/importJobs';
import {queuedRows} from '../lib/importJobs';
import {CashierRowReview} from './CashierRowReview';
import {CashierApprovalPreview} from './CashierApprovalPreview';
import {ImportJobsPanel} from './ImportJobsPanel';
import {OperationHeader} from './OperationHeader';
import {RecordPagination,useRecordPage} from './RecordPagination';
import type {CashierDay,InventoryItem} from '../types/erp';
import {businessDate} from '../lib/dates';
import {reviewedCashierRows,type CashierReview} from '../lib/cashierRows';
import {begunRevenue} from '../lib/cashierFinancial';
import {convertToBaseUnit} from '../lib/itemCosts';
import type {attachCashierReport} from '../lib/cashierDays';
type Report=Parameters<typeof attachCashierReport>[2];
export type QueuedCashierReport={id:string;file_name:string;sale_date:string;content_hash:string;report_kind?:'financial'|'items';import_job_id?:string;raw_rows?:Record<string,unknown>[]};
export function CashierDayScreen({items,days,queued=[],onAttach,onApprove,onBack}: {items:InventoryItem[];days:CashierDay[];queued?:QueuedCashierReport[];onAttach:(date:string,report:Report)=>Promise<void>;onApprove:(id:string)=>Promise<void>;onBack:()=>void}){
 const [date,setDate]=useState(businessDate()),[type,setType]=useState<'financial'|'items'>('financial');
 const [preview,setPreview]=useState<{name:string;sha256:string;rows:Record<string,unknown>[];sourceQueueId?:string;suggestions?:NonNullable<ImportJob['result']>['suggestions']} | null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [review,setReview]=useState<{hash:string;choices:CashierReview}>({hash:'',choices:{}});
 const choices=review.hash===preview?.sha256?review.choices:{};
 const parsed=useMemo(()=>preview&&type==='items'?reviewedCashierRows(preview.rows,items,choices):[],[preview,type,items,review]);
 const matchPage=useRecordPage(parsed,preview?.sha256);
 const choose=(row:number,change:Partial<CashierReview[number]>)=>{if(!preview)return;setReview({hash:preview.sha256,choices:{...choices,[row]:{itemId:choices[row]?.itemId??'',unit:choices[row]?.unit??'',...change}}});};
 const [historySearch,setHistorySearch]=useState('');
 const [approvalId,setApprovalId]=useState<string>();
 const approval=days.find(day=>day.id===approvalId);
 const history=useMemo(()=>[...days].filter(d=>d.date.includes(historySearch)).sort((a,b)=>b.date.localeCompare(a.date)),[days,historySearch]);
 const page=useRecordPage(history,historySearch);
 const revenue=preview?begunRevenue(preview.rows,date):undefined;
 const printed=type==='items'&&preview?.rows.some(row=>row.sourceFormat==='uws-items-v1');
 const sourceDateError=printed&&preview?.rows.some(row=>row.businessDate!==date)?'تاريخ تقرير الأصناف لا يطابق يوم العمل؛ أعد معالجة الملف بالتاريخ الصحيح.':'';
 const act=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const attach=async()=>{
  if(!preview)throw Error('اختر ملف التقرير');
  const file={fileName:preview.name,sha256:preview.sha256,uploadedAt:new Date().toISOString(),...(preview.sourceQueueId?{sourceQueueId:preview.sourceQueueId}:{})};
  if(type==='financial'){
   if(revenue===undefined)throw Error('تعذر التأكد من قيمة Begun وتاريخها؛ أعد معالجة ملف المبيعات ليوم العمل الصحيح.');
   await onAttach(date,{type,file,totalRevenue:revenue});
  }else{
   if(sourceDateError)throw Error(sourceDateError);
   const bad=parsed.find(r=>r.error||!r.matchedItem);if(bad)throw Error(`${bad.rawName||bad.rawCode}: ${bad.error}`);
   await onAttach(date,{type,file,lines:parsed.map(r=>({itemId:r.matchedItem!.id,quantity:r.quantity,unitLabel:r.unitHint,normalizedQtyInBaseUnit:convertToBaseUnit(r.quantity,r.unitHint,r.matchedItem!.baseUnit)}))});
  }
  setPreview(null);
 };
 const input='w-full min-w-0 max-w-full border rounded-xl p-3 bg-white';
 return <main dir="rtl" className="operation-screen min-h-screen bg-[#FAF8F4] p-4 pb-28 space-y-4">
  <OperationHeader title="تقارير يوم الكاشير" description="تقرير مالي + تقرير أصناف، لحساب يومك بدقة." icon={FolderSync} onBack={onBack} busy={busy}/>
  <p className="operation-note">تقرير المبيعات يسجل الإيراد والرصيد المالي فور حفظه. تقرير الأصناف لنفس اليوم يكمل التكلفة والربح ويخصم المخزون عند الاعتماد؛ لا يكرر الإيراد.</p>
  {!!queued.length&&<section className="border rounded-xl p-3"><h2 className="font-bold">ملفات وصلت من جهاز الكاشير وتنتظر المراجعة</h2><p>افتح الملف لمراجعته.</p>{queued.some(q=>!q.report_kind)&&<label>نوع الملف القديم<select value={type} onChange={e=>{setType(e.target.value as typeof type);setPreview(null);}}><option value="financial">تقرير مالي</option><option value="items">تقرير أصناف</option></select></label>}{queued.map(q=><button key={q.id} disabled={busy} className="block p-2 underline" onClick={()=>void act(async()=>{const rows=q.raw_rows??await queuedRows(q.id);setDate(q.sale_date);if(q.report_kind)setType(q.report_kind);setPreview({name:q.file_name,sha256:q.content_hash,rows,sourceQueueId:q.id});})}>{q.sale_date} — {q.file_name}</button>)}</section>}
  <ImportJobsPanel onReview={job=>{if(!job.result)return;setDate(job.sale_date);setType(job.kind);setPreview({name:job.file_name,sha256:job.result.sha256,rows:job.result.rows,sourceQueueId:job.queue_id??undefined,suggestions:job.result.suggestions});}}/>
  {preview&&<p>يوم العمل: {date} — {type==='financial'?'تقرير مالي':'تقرير أصناف'}</p>}
  {preview&&<section className="border rounded-xl p-3 space-y-3"><h2 className="font-bold">مراجعة {preview.name}</h2>
   {type==='financial'?<>
    <p className="operation-note">مبيعات اليوم تُقرأ تلقائيًا من قيمة Begun في ملف المبيعات.</p>
    {revenue===undefined?<p role="alert">لم يتأكد وجود قيمة Begun واحدة صحيحة لنفس يوم العمل؛ أعد معالجة الملف.</p>:<p className="text-lg font-bold">مبيعات اليوم — Begun: {revenue.toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})} ج.م</p>}
   </>:<><p>{parsed.length} صف أصناف؛ {parsed.filter(r=>r.error).length} تحتاج تصحيحًا.</p><p className="operation-note">{printed?'الكود والكمية والوحدة مقروءة من التقرير. استكمل المنتجات وأكواد الكاشير والوصفات في الكتالوج؛ البنود الناقصة تحتاج تقريرًا تفصيليًا قبل الاعتماد.':'اقتراحات تشابه الاسم للمساعدة فقط. اختيار الصنف ووحدة الكمية يحتاج تأكيدك؛ الكميات والأسعار الأصلية تظل تحت التحقق.'}</p>{sourceDateError&&<p role="alert">{sourceDateError}</p>}<RecordPagination {...matchPage}/>{matchPage.visible.map((r,n)=>{const i=matchPage.page*matchPage.pageSize+n,suggestions=preview.suggestions?.find(s=>s.row===i)?.candidates??[];return <article key={i} className="record-card"><p>{r.rawName||r.rawCode}: {r.quantity} {displayUnit(r.unitHint)}</p>{r.sourceFormat&&<p className="text-xs">{r.sourceRow!==undefined&&Number.isInteger(r.sourceRow)&&r.sourceRow>0&&<>السطر {r.sourceRow} · </>}كود الكاشير: {r.rawCode} · عدد مرات البيع: {r.saleCount} · الكمية أعلاه هي المعتمدة للخصم.</p>}<p>{r.matchedItem?.name} {r.error}</p>{!r.sourceFormat&&(r.error||choices[i])&&<CashierRowReview index={i} choice={choices[i]} items={items} suggestions={suggestions} busy={busy} onChange={change=>choose(i,change)}/>}</article>;})}</>}
   <button disabled={busy||(type==='financial'&&revenue===undefined)||!!sourceDateError||!!(printed&&parsed.some(row=>row.error||!row.matchedItem))} onClick={()=>void act(attach)} className="operation-primary">حفظ التقرير لهذا اليوم</button>
  </section>}
  {!approval&&error&&<p role="alert" className="text-red-700">{error}</p>}
  <h2 className="font-bold">الأيام المسجلة</h2>
  <label className="block">بحث بتاريخ اليوم<input className={input} placeholder="YYYY-MM-DD" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/></label><RecordPagination {...page}/>
  {page.visible.map(d=><article key={d.id} className="border rounded-xl bg-white p-3 space-y-2"><h3 className="font-bold">{d.date} — {d.status==='approved'?'معتمد':'بانتظار الاعتماد'}</h3><p>المالي: {d.financialReport?'مرفوع':'ناقص'} — الأصناف: {d.itemsReport?'مرفوع':'ناقص'}</p><p>الإيراد: {d.financialReport?.totalRevenue.toLocaleString('ar-EG')??'لم يحدد'}؛ التكلفة: {d.status==='approved'?d.totalCost?.toLocaleString('ar-EG'):'تُحدد عند الاعتماد'}</p>
   {d.status==='pending'&&<button disabled={busy||!d.financialReport||!d.itemsReport} className="operation-primary" onClick={()=>{setError('');setApprovalId(d.id);}}>مراجعة واعتماد اليوم</button>}
   {!!d.shortages?.length&&<div className="text-red-700"><p>عجز مخزون بعد الاعتماد:</p>{d.shortages.map(s=><p key={s.itemId}>{items.find(i=>i.id===s.itemId)?.name??s.itemId}: {s.shortage}</p>)}</div>}
  </article>)}
  {approval&&<CashierApprovalPreview day={approval} items={items} busy={busy} error={error} onClose={()=>{setError('');setApprovalId(undefined);}}
    onApprove={()=>void act(async()=>{await onApprove(approval.id);setApprovalId(undefined);})}/>}
 </main>;
}
