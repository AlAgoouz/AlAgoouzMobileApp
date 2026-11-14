import React,{useEffect,useState} from 'react';
import {z} from 'zod';
import {readRpc} from '../lib/readModels';
const schema=z.object({checkedAt:z.string(),imports:z.object({failed:z.number(),working:z.number(),delayed:z.number(),awaitingReview:z.number()}).nullable(),backup:z.object({state:z.enum(['running','success','failed']),run_id:z.string().regex(/^\d{1,20}$/),started_at:z.string(),last_verified_at:z.string().nullable()}).nullable()});
export function OperationalHealth({onCashier,showBackup=false}:{onCashier:()=>void;showBackup?:boolean}){
 const [data,setData]=useState<z.infer<typeof schema>|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let alive=true,busy=false;const load=async()=>{if(busy)return;busy=true;try{const next=schema.parse(await readRpc('bon_erp_operational_health',{}));if(alive){setData(next);setError(false);}}catch{if(alive)setError(true);}finally{busy=false;}};void load();const timer=setInterval(()=>{if(document.visibilityState!=='hidden')void load();},60000);window.addEventListener('online',load);return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',load);};},[revision]);
 const backup=data?.backup,late=backup?.last_verified_at?Date.now()-Date.parse(backup.last_verified_at)>36*3600000:false;
 return <section className="visual-card space-y-3" aria-label="متابعة التشغيل"><h2 className="font-bold">متابعة التشغيل</h2>
  {error&&<p role="alert">تعذر تحديث المتابعة؛ الحالة الحالية غير مؤكدة. <button onClick={()=>setRevision(n=>n+1)}>إعادة المحاولة</button></p>}
  {!data&&!error&&<p role="status">جارٍ التحقق من حالة التشغيل…</p>}
  {data&&<><p>آخر فحص: {new Date(data.checkedAt).toLocaleString('ar-EG')}</p>
   {data.imports&&<button className="record-action" onClick={onCashier}>ملفات الكاشير: {data.imports.working} قيد العمل · {data.imports.awaitingReview} للمراجعة · {data.imports.failed} تحتاج متابعة{data.imports.delayed>0?` · ${data.imports.delayed} متأخرة`:''}</button>}
   {showBackup&&<div className="operation-note"><b>النسخ الاحتياطي التلقائي</b><p>{!backup?'لم تصل حالة تشغيل موثقة بعد.':backup.state==='failed'?'آخر تشغيل لم يكتمل؛ النسخة السابقة محفوظة.':backup.state==='running'?Date.now()-Date.parse(backup.started_at)>2*3600000?'تشغيل النسخ متأخر ويحتاج مراجعة.':'جارٍ النسخ والتحقق من الاسترجاع.':'اكتمل آخر تشغيل مع التحقق من الاسترجاع.'}</p>
    <p>{backup?.last_verified_at?`آخر نسخة موثقة: ${new Date(backup.last_verified_at).toLocaleString('ar-EG')}`:'وقت آخر نسخة موثقة غير متاح في لوحة المتابعة.'}</p>{late&&<p role="alert">مرّ أكثر من 36 ساعة على آخر نسخة موثقة؛ راجع تشغيل النسخ.</p>}
    <a className="underline" href={`https://github.com/AlAgoouz/AlAgoouzMobileApp/actions${backup?`/runs/${backup.run_id}`:'/workflows/backup.yml'}`} target="_blank" rel="noreferrer">فتح سجل النسخ والتحقق</a>
   </div>}</>}
 </section>;
}
