import React,{useRef,useState} from 'react';
import {FolderSync} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {businessDate} from '../lib/dates';
import {getSupabaseClient} from '../lib/supabaseSync';

export function CashierUploadScreen({name,onLogout}:{name:string;onLogout:()=>void}){
 const [date,setDate]=useState(businessDate()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [file,setFile]=useState<File|null>(null);const input=useRef<HTMLInputElement>(null);
 const upload=async()=>{
  if(busy)return;setError('');setNotice('');
  if(!file){setError('اختر ملف التقرير');return;}
  setBusy(true);
  try{
   if(file.size>10*1024*1024)throw Error('الحد الأقصى للملف 10 ميجابايت');
   const bytes=await file.arrayBuffer();const XLSX=await import('xlsx');const workbook=XLSX.read(bytes,{type:'array'});
   const rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:''});
   if(!rows.length||rows.length>10000)throw Error('التقرير فارغ أو يزيد على 10000 صف');
   const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
   const sb=getSupabaseClient();if(!sb)throw Error('إعداد الاتصال غير صالح');
   const result=await sb.rpc('bon_erp_enqueue_export',{p_file_name:file.name,p_sale_date:date,p_raw_rows:rows,p_content_hash:hash});
   if(result.error||!result.data)throw Error('تعذر تأكيد رفع التقرير؛ تحقق من الاتصال وصلاحية الحساب، ثم أعد المحاولة بنفس الملف');
   setNotice('تم استلام التقرير أو كان مرفوعًا بالفعل؛ المالك يراجعه قبل الاعتماد.');setFile(null);if(input.current)input.current.value='';
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <main dir="rtl" className="operation-screen max-w-md mx-auto p-4 space-y-4 min-h-screen bg-[#FAF8F4]">
  <OperationHeader title="رفع تقارير الكاشير" description={`أهلًا ${name} — حساب رفع ملفات فقط`} icon={FolderSync} onBack={onLogout} backLabel="خروج" busy={busy}/>
  <p className="operation-note">ارفع التقرير المالي وتقرير الأصناف كل ملف على حدة لنفس يوم العمل. يراجع المالك الملفات ويعتمدها؛ هذا الحساب لا يطّلع على بيانات المحل أو الحسابات.</p>
  <form onSubmit={e=>{e.preventDefault();void upload();}} className="space-y-4">
   <label className="block">يوم العمل<input type="date" required disabled={busy} value={date} onChange={e=>setDate(e.target.value)} className="w-full min-w-0 block border rounded-xl p-3"/></label>
   <label className="block">ملف التقرير<input ref={input} disabled={busy} type="file" accept=".xlsx,.xls,.csv" className="block w-full min-w-0 max-w-full p-2 border rounded-xl" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
   <button type="submit" disabled={busy||!file} className="login-submit w-full">{busy?'جارٍ رفع التقرير…':'رفع التقرير للمراجعة'}</button>
  </form>
  {notice&&<p role="status" className="login-notice">{notice}</p>}{error&&<p role="alert" className="login-error">{error}</p>}
  <button type="button" disabled={busy} onClick={onLogout} className="login-back w-full">تسجيل الخروج</button>
 </main>;
}
