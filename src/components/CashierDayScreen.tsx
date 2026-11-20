import {unitLabel as displayUnit} from '../lib/units';
import React,{useState,useMemo,useRef} from 'react';
import {FileSpreadsheet, FolderSync, Receipt} from 'lucide-react';
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
const needsItems=(day:CashierDay)=>day.status==='pending'&&!!day.financialReport&&!day.itemsReport;
export function CashierDayScreen({items,days,queued=[],onAttach,onApprove,onBack,canManage=true}: {items:InventoryItem[];days:CashierDay[];queued?:QueuedCashierReport[];onAttach:(date:string,report:Report)=>Promise<void>;onApprove:(id:string)=>Promise<void>;onBack:()=>void;canManage?:boolean}){
 const [date,setDate]=useState(businessDate()),[type,setType]=useState<'financial'|'items'>('financial');
 const [preview,setPreview]=useState<{name:string;sha256:string;rows:Record<string,unknown>[];sourceQueueId?:string;businessDate?:string;suggestions?:NonNullable<ImportJob['result']>['suggestions']} | null>(null);
 const [confirmedFile,setConfirmedFile]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [review,setReview]=useState<{hash:string;choices:CashierReview}>({hash:'',choices:{}});
 const choices=review.hash===preview?.sha256?review.choices:{};
 const parsed=useMemo(()=>preview&&type==='items'?reviewedCashierRows(preview.rows,items,choices):[],[preview,type,items,review]);
 const matchPage=useRecordPage(parsed,preview?.sha256);
 const choose=(row:number,change:Partial<CashierReview[number]>)=>{if(!preview)return;setReview({hash:preview.sha256,choices:{...choices,[row]:{itemId:choices[row]?.itemId??'',unit:choices[row]?.unit??'',...change}}});};
 const [historySearch,setHistorySearch]=useState('');
 const [missingItemsOnly,setMissingItemsOnly]=useState(false);
 const [uploadTarget,setUploadTarget]=useState<{date:string;kind:'financial'|'items';key:number}>();
 const uploadSection=useRef<HTMLDivElement>(null);
 function openUpload(day:string,kind:'financial'|'items'){
  setUploadTarget(current=>({date:day,kind,key:(current?.key??0)+1}));
  uploadSection.current?.focus({preventScroll:true});
  uploadSection.current?.scrollIntoView?.({block:'start'});
 }
 const [approvalId,setApprovalId]=useState<string>();
 const approval=days.find(day=>day.id===approvalId);
 const missingItems=days.filter(needsItems).length;
 const history=useMemo(()=>days.filter(d=>d.date.includes(historySearch)&&(!missingItemsOnly||needsItems(d))).sort((a,b)=>b.date.localeCompare(a.date)),[days,historySearch,missingItemsOnly]);
 const page=useRecordPage(history,`${historySearch}:${missingItemsOnly}`);
 const revenue=preview?begunRevenue(preview.rows,date):undefined;
 const printed=type==='items'&&preview?.rows.some(row=>row.sourceFormat==='uws-items-v1');
 const sourceDateError=(printed&&preview?.rows.some(row=>row.businessDate!==date)||preview?.businessDate&&preview.businessDate!==date)?'تاريخ تقرير الأصناف لا يطابق يوم العمل؛ أعد معالجة الملف بالتاريخ الصحيح.':'';
 const act=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const dateConfirmation=preview&&type==='items'&&!printed&&!preview.businessDate;
 const dateKey=(preview?.sha256??'')+':'+date;
 const attach=async()=>{
  if(!preview)throw Error('اختر ملف التقرير');
  const file={fileName:preview.name,sha256:preview.sha256,uploadedAt:new Date().toISOString(),...(preview.sourceQueueId?{sourceQueueId:preview.sourceQueueId}:{})};
  if(type==='financial'){
   if(revenue===undefined)throw Error('تعذر التأكد من قيمة Begun وتاريخها؛ أعد معالجة ملف المبيعات ليوم العمل الصحيح.');
   await onAttach(date,{type,file,totalRevenue:revenue});
  }else{
   if(sourceDateError)throw Error(sourceDateError);
   if(dateConfirmation&&confirmedFile!==dateKey)throw Error('أكّد أن يوم البيع الصحيح هو اليوم المعروض.');
   const bad=parsed.find(r=>r.error||!r.matchedItem);if(bad)throw Error(`${bad.rawName||bad.rawCode}: ${bad.error}`);
   await onAttach(date,{type,file,lines:parsed.map(r=>({itemId:r.matchedItem!.id,quantity:r.quantity,unitLabel:r.unitHint,normalizedQtyInBaseUnit:convertToBaseUnit(r.quantity,r.unitHint,r.matchedItem!.baseUnit)}))});
  }
  setPreview(null);
 };
 const input='operation-input';
 return <div dir="rtl" className="operation-screen min-h-screen pb-28">
  <OperationHeader title="تقارير يوم الكاشير" description="راجع ملفَي كل يوم عمل وحالة اعتماده." icon={FolderSync} onBack={onBack} busy={busy}/>
  <div className="record-workspace">
   {canManage && <section className="cashier-workflow" aria-labelledby="cashier-reports-heading">
    <h2 id="cashier-reports-heading">ملفّا يوم العمل</h2>
    <div className="cashier-workflow-grid">
     <div>
      <Receipt size={20} aria-hidden="true" />
      <div><h3>التقرير المالي</h3><p>يثبت الإيراد والرصيد عند الحفظ.</p>
       <button type="button" className="record-action" disabled={busy} onClick={()=>openUpload(businessDate(),'financial')}>اختيار الملف المالي</button></div>
     </div>
     <div>
      <FileSpreadsheet size={20} aria-hidden="true" />
      <div><h3>تقرير الأصناف</h3><p>يكمل التكلفة والربح ويخصم المخزون عند الاعتماد.</p>
       <button type="button" className="record-action" disabled={busy} onClick={()=>openUpload(businessDate(),'items')}>اختيار ملف الأصناف</button></div>
     </div>
    </div>
   </section>}
   {canManage && !!queued.length&&<section className="operation-surface space-y-2"><h2 className="font-bold">ملفات وصلت من جهاز الكاشير وتنتظر المراجعة</h2><p className="operation-caption">افتح الملف لمراجعته.</p>{queued.some(q=>!q.report_kind)&&<label className="block">نوع الملف القديم<select className={input} value={type} onChange={e=>{setType(e.target.value as typeof type);setPreview(null);}}><option value="financial">تقرير مالي</option><option value="items">تقرير أصناف</option></select></label>}<div className="flex flex-wrap gap-2">{queued.map(q=><button type="button" key={q.id} disabled={busy} className="action-button underline" onClick={()=>void act(async()=>{const rows=q.raw_rows??await queuedRows(q.id);setDate(q.sale_date);if(q.report_kind)setType(q.report_kind);setPreview({name:q.file_name,sha256:q.content_hash,rows,sourceQueueId:q.id});})}>{q.sale_date} — {q.file_name}</button>)}</div></section>}
   {canManage && <div className="cashier-upload-anchor" ref={uploadSection} tabIndex={-1} role="region" aria-label="رفع ملف ليوم العمل"><ImportJobsPanel key={uploadTarget?.key} defaultDate={uploadTarget?.date} defaultKind={uploadTarget?.kind} onReview={job=>{if(!job.result)return;setDate(job.sale_date);setType(job.kind);setPreview({name:job.file_name,sha256:job.result.sha256,rows:job.result.rows,sourceQueueId:job.queue_id??undefined,suggestions:job.result.suggestions,businessDate:job.result.businessDate});}}/></div>}
   {canManage&&preview&&<section className="operation-surface space-y-3"><h2 className="font-bold">مراجعة {preview.name}</h2>
    <p className="font-bold text-ink-strong">يوم العمل <bdi>{date}</bdi> · {type==='financial'?'تقرير مالي':'تقرير أصناف'}</p>
    {type==='financial'?<>
     <p className="operation-note">مبيعات اليوم تُقرأ تلقائيًا من قيمة Begun في ملف المبيعات.</p>
     {revenue===undefined?<p role="alert" className="field-error">لم يتأكد وجود قيمة Begun واحدة صحيحة لنفس يوم العمل؛ أعد معالجة الملف.</p>:<p className="text-lg font-bold text-ink-strong">مبيعات اليوم — Begun: {revenue.toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})} ج.م</p>}
    </>:<><p>{parsed.length} صف أصناف؛ {parsed.filter(r=>r.error).length} تحتاج تصحيحًا.</p><p className="operation-note">{printed?'الكود والكمية والوحدة مقروءة من التقرير. استكمل المنتجات وأكواد الكاشير والوصفات في الكتالوج؛ البنود الناقصة تحتاج تقريرًا تفصيليًا قبل الاعتماد.':'اقتراحات تشابه الاسم للمساعدة فقط. اختيار الصنف ووحدة الكمية يحتاج تأكيدك؛ الكميات والأسعار الأصلية تظل تحت التحقق.'}</p>{sourceDateError&&<p role="alert" className="field-error">{sourceDateError}</p>}<RecordPagination {...matchPage}/><div className="record-grid">{matchPage.visible.map((r,n)=>{const i=matchPage.page*matchPage.pageSize+n,suggestions=preview.suggestions?.find(s=>s.row===i)?.candidates??[];return <article key={i} className="record-card space-y-2"><p className="font-bold">{r.rawName||r.rawCode}: {r.quantity} {displayUnit(r.unitHint)}</p>{r.packFactor!==undefined&&<p className="text-xs">وزن العبوة الواحدة {r.packFactor} كجم حسب وحدة الملف.</p>}{r.sourceFormat&&<p className="text-xs">{r.sourceRow!==undefined&&Number.isInteger(r.sourceRow)&&r.sourceRow>0&&<>السطر {r.sourceRow} · </>}كود الكاشير: {r.rawCode} · عدد مرات البيع: {r.saleCount} · الكمية أعلاه هي المعتمدة للخصم.</p>}<p>{r.matchedItem?.name} {r.error}</p>{!r.sourceFormat&&(r.error||choices[i])&&<CashierRowReview index={i} choice={choices[i]} items={items} suggestions={suggestions} busy={busy} onChange={change=>choose(i,change)}/>}</article>;})}</div></>}
    {dateConfirmation&&<label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={confirmedFile===dateKey} onChange={e=>setConfirmedFile(e.target.checked?dateKey:'')}/>الملف لا يتضمن تاريخًا مقروءًا. أؤكد أن يوم البيع هو {date}.</label>}
    <button type="button" disabled={busy||!!(dateConfirmation&&confirmedFile!==dateKey)||(type==='financial'&&revenue===undefined)||!!sourceDateError||!!(printed&&parsed.some(row=>row.error||!row.matchedItem))} onClick={()=>void act(attach)} className="operation-primary">حفظ التقرير لهذا اليوم</button>
   </section>}
   {!approval&&error&&<p role="alert" className="field-error">{error}</p>}
   <h2 className="font-bold">الأيام المسجلة</h2>
   {(missingItems>0||missingItemsOnly)&&<div className="operation-note flex flex-wrap items-center justify-between gap-2">
    <span>أيام اتسجّل إيرادها وتنتظر تقرير الأصناف: {missingItems.toLocaleString('ar-EG')}</span>
    <button type="button" className="action-button" aria-pressed={missingItemsOnly} onClick={()=>{setHistorySearch('');setMissingItemsOnly(active=>!active);}}>
     {missingItemsOnly?'عرض كل الأيام':'عرض الأيام التي تنتظر تقرير الأصناف'}
    </button>
   </div>}
   <label className="record-search">بحث بتاريخ اليوم<input placeholder="YYYY-MM-DD" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/></label><RecordPagination {...page}/>
   {!history.length&&<p className="record-state" role="status">{missingItemsOnly?'لا توجد أيام مطابقة تنتظر تقرير الأصناف.':historySearch?'لا يوجد يوم مطابق للبحث.':'لا توجد أيام مسجلة بعد.'}</p>}
   <div className="record-grid">
    {page.visible.map(d=><article key={d.id} className="record-card space-y-3"><h3 className="font-bold text-ink-strong">{d.date} — {d.status==='approved'?'معتمد':'بانتظار الاعتماد'}</h3><div className="cashier-report-pair">
       {(['financial','items'] as const).map(kind=>{
         const report=kind==='financial'?d.financialReport:d.itemsReport;
         const label=kind==='financial'?'التقرير المالي':'تقرير الأصناف';
         return <div key={kind} className="cashier-report-slot" data-ready={!!report}>
           <b>{label}</b>
           {report?<bdi>{report.fileName}</bdi>:canManage?<button type="button" className="record-action" disabled={busy} onClick={()=>openUpload(d.date,kind)}>رفع {label}</button>:<span>لم يُرفع</span>}
         </div>;
       })}
     </div><p className="text-xs text-ink">الإيراد: {d.financialReport?.totalRevenue.toLocaleString('ar-EG')??'لم يحدد'}؛ التكلفة: {d.status==='approved'?(d.correctedTotalCost??d.totalCost)?.toLocaleString('ar-EG'):'تُحدد عند الاعتماد'}</p>
     {canManage&&d.status==='pending'&&<button type="button" disabled={busy||!d.financialReport||!d.itemsReport} className="operation-primary w-full" onClick={()=>{setError('');setApprovalId(d.id);}}>مراجعة واعتماد اليوم</button>}
     {!!d.shortages?.length&&<div className="text-status-danger text-xs"><p className="font-bold">عجز مخزون بعد الاعتماد:</p>{d.shortages.map(s=><p key={s.itemId}>{items.find(i=>i.id===s.itemId)?.name??s.itemId}: {s.shortage}</p>)}</div>}
    </article>)}
   </div>
  </div>
  {canManage&&approval&&<CashierApprovalPreview day={approval} items={items} busy={busy} error={error} onClose={()=>{setError('');setApprovalId(undefined);}}
    onApprove={()=>void act(async()=>{await onApprove(approval.id);setApprovalId(undefined);})}/>}
 </div>;
}
