import React,{useCallback,useEffect,useRef,useState} from 'react';
import {businessDate} from '../lib/dates';
import {inspectCashierFile} from '../lib/cashierReportHeader';
import {cancelImport,enqueueImport,importError,listImports,readImport,uploadImport,type ImportJob,type ImportKind} from '../lib/importJobs';
const labels:Record<ImportJob['status'],string>={uploading:'بانتظار اكتمال الرفع',queued:'في انتظار المعالجة',processing:'جارٍ قراءة الملف',ready:'جاهز للمراجعة',failed:'يحتاج متابعة',cancelled:'ملغى'};
export function ImportJobsPanel({onReview}:{onReview?:(job:ImportJob)=>void}){
 const [date,setDate]=useState(businessDate()),[kind,setKind]=useState<ImportKind>('financial'),[file,setFile]=useState<File|null>(null);
 const [jobs,setJobs]=useState<ImportJob[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [refreshError,setRefreshError]=useState('');
 const [inspecting,setInspecting]=useState(false),[sourceDate,setSourceDate]=useState<string|null>(null),[sourceKind,setSourceKind]=useState<ImportKind|null>(null);
 const selection=useRef(0);
 const input=useRef<HTMLInputElement>(null),mounted=useRef(true),reading=useRef(false);
 const refresh=useCallback(async()=>{if(reading.current)return;reading.current=true;try{const rows=await listImports();if(mounted.current){setJobs(rows);setRefreshError('');}}catch{if(mounted.current)setRefreshError('تعذر تحديث حالة الملفات؛ أعد المحاولة.');}finally{reading.current=false;}},[]);
 const hasActiveJobs=jobs?.some(j=>['uploading','queued','processing'].includes(j.status))??false;
 useEffect(()=>{mounted.current=true;void refresh();window.addEventListener('online',refresh);return()=>{mounted.current=false;window.removeEventListener('online',refresh);};},[refresh]);
 useEffect(()=>{const delay=hasActiveJobs?5000:30000;const timer=setInterval(()=>{if(document.visibilityState!=='hidden'&&navigator.onLine!==false)void refresh();},delay);return()=>clearInterval(timer);},[hasActiveJobs,refresh]);
 const act=async(fn:()=>Promise<void>)=>{
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{await fn();}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'تعذرت العملية؛ أعد المحاولة.');}
  finally{if(mounted.current){await refresh();if(mounted.current)setBusy(false);}}
 };
 const selectFile=async(next:File|null)=>{
  const token=++selection.current;setFile(null);setSourceDate(null);setSourceKind(null);setError('');setNotice('');setInspecting(!!next);
  if(!next)return;
  try{const header=await inspectCashierFile(next);if(!mounted.current||token!==selection.current)return;setFile(next);setSourceDate(header.date);setSourceKind(header.kind);if(header.date)setDate(header.date);if(header.kind)setKind(header.kind);}
  catch(e){if(mounted.current&&token===selection.current)setError(e instanceof Error?e.message:'تعذر قراءة تاريخ التقرير.');}
  finally{if(mounted.current&&token===selection.current)setInspecting(false);}
 };
 return <section className="record-workspace space-y-3" aria-label="رفع ومعالجة التقارير">
  <h2 className="font-bold">رفع تقرير جديد</h2><p className="operation-note">ارفع كل تقرير على حدة. بعد تأكيد بدء المعالجة، تقدر تقفل الصفحة وترجع تتابع النتيجة. الرفع وحده لا يعتمد المبيعات أو يخصم المخزون.</p>
  <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(file&&!inspecting)void act(async()=>{await uploadImport(file,kind,date);setFile(null);setSourceDate(null);setSourceKind(null);if(input.current)input.current.value='';setNotice('تم إرسال الملف للمعالجة؛ تابع حالته أدناه.');});}}>
   <label>يوم العمل<input required disabled={busy||inspecting} readOnly={!!sourceDate} type="date" className="operation-input w-full" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label>نوع التقرير<select disabled={busy||inspecting||!!sourceKind} className="operation-input w-full" value={kind} onChange={e=>setKind(e.target.value as ImportKind)}><option value="financial">المبيعات — قيمة Begun</option><option value="items">الأصناف المباعة — الكميات</option></select></label>
   <label className="min-w-0">ملف التقرير<input ref={input} disabled={busy} type="file" accept=".csv,.xls,.xlsx" className="block w-full min-w-0 max-w-full" onChange={e=>void selectFile(e.target.files?.[0]??null)}/></label>
   <button type="submit" disabled={busy||inspecting||!file} className="record-action">{busy?'جارٍ تنفيذ الطلب…':'رفع وبدء المعالجة'}</button>
  </form>
  {inspecting&&<p role="status">جارٍ قراءة تاريخ التقرير…</p>}
  {file&&<p className="operation-note">{sourceDate?`يوم البيع ${sourceDate} مقروء من داخل التقرير؛ تاريخ الطباعة واسم الملف لا يغيّرانه.`:'التقرير لا يحمل تاريخًا داخليًا واضحًا؛ راجع يوم العمل ونوع التقرير قبل الرفع.'}</p>}
  {notice&&<p role="status">{notice}</p>}{(error||refreshError)&&<div role="alert" className="record-state"><p>{error||refreshError}</p><button disabled={busy} onClick={()=>void refresh()}>تحديث الحالة</button></div>}
  <h3 className="font-bold">آخر الملفات</h3>{jobs===null&&!error&&!refreshError&&<p role="status">جارٍ تحميل حالة الملفات…</p>}{jobs?.length===0&&<p className="record-state">لا توجد ملفات مرفوعة بعد.</p>}
  <div className="record-grid">{jobs?.map(job=><article key={job.id} className="record-card"><div className="record-heading"><h4 className="break-words">{job.file_name}</h4><span className="record-badge">{job.reviewed&&job.status==='ready'?'مرتبط بيوم مسجل':labels[job.status]}</span></div><p>{job.sale_date} · {job.kind==='financial'?'تقرير مالي':'تقرير أصناف'}</p>
   {job.status==='failed'&&<p>{job.error_code==='UPLOAD_EXPIRED'?'لم يكتمل الرفع؛ ارفع الملف مجددًا.':importError(job.error_code??'')}</p>}
   {(['queued','processing'] as string[]).includes(job.status)&&Date.now()-Date.parse(job.updated_at)>10*60*1000&&<p>المعالجة متأخرة؛ أعد إرسال الطلب.</p>}
   <div className="record-actions">{job.status==='ready'&&!job.reviewed&&onReview&&<button disabled={busy} className="record-action" onClick={()=>void act(async()=>onReview(await readImport(job.id)))}>مراجعة التقرير</button>}
   {(['uploading','queued','processing','failed'] as string[]).includes(job.status)&&job.error_code!=='UPLOAD_EXPIRED'&&<button disabled={busy} className="record-action" onClick={()=>void act(()=>enqueueImport(job.id))}>إعادة المحاولة</button>}
   {job.status!=='cancelled'&&!job.reviewed&&<button disabled={busy} onClick={()=>void act(()=>cancelImport(job.id))}>إلغاء الملف الخطأ</button>}</div>
  </article>)}</div>
 </section>;
}
