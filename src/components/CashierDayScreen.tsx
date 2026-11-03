import React,{useState,useMemo} from 'react';
import {RecordPagination,useRecordPage} from './RecordPagination';
import type {CashierDay,InventoryItem} from '../types/erp';
import {businessDate} from '../lib/dates';
import {mapRawCashierRows,parseLocalizedNumber} from '../lib/cashierRows';
import {convertToBaseUnit} from '../lib/itemCosts';
import type {attachCashierReport} from '../lib/cashierDays';
type Report=Parameters<typeof attachCashierReport>[2];
export type QueuedCashierReport={id:string;file_name:string;sale_date:string;content_hash:string;raw_rows:Record<string,unknown>[]};
export function CashierDayScreen({items,days,queued=[],onAttach,onApprove,onBack}: {items:InventoryItem[];days:CashierDay[];queued?:QueuedCashierReport[];onAttach:(date:string,report:Report)=>Promise<void>;onApprove:(id:string)=>Promise<void>;onBack:()=>void}){
 const [date,setDate]=useState(businessDate()),[type,setType]=useState<'financial'|'items'>('financial');
 const [preview,setPreview]=useState<{name:string;sha256:string;rows:Record<string,unknown>[];sourceQueueId?:string} | null>(null);
 const [rowIndex,setRowIndex]=useState('0'),[column,setColumn]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const parsed=useMemo(()=>preview&&type==='items'?mapRawCashierRows(preview.rows,items):[],[preview,type,items]);
 const [historySearch,setHistorySearch]=useState('');
 const history=useMemo(()=>[...days].filter(d=>d.date.includes(historySearch)).sort((a,b)=>b.date.localeCompare(a.date)),[days,historySearch]);
 const page=useRecordPage(history,historySearch);
 const revenue=preview?parseLocalizedNumber(preview.rows[Number(rowIndex)]?.[column]):undefined;
 const act=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const readFile=async(file:File)=>{
  if(file.size>10*1024*1024)throw Error('الحد الأقصى للملف 10 ميجابايت');
  const bytes=await file.arrayBuffer();const XLSX=await import('xlsx');const wb=XLSX.read(bytes,{type:'array'});
  const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:''});
  if(!rows.length||rows.length>10000)throw Error('الملف فارغ أو يزيد على 10000 صف');
  const digest=await crypto.subtle.digest('SHA-256',bytes);const sha256=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  setPreview({name:file.name,sha256,rows});setColumn('');setRowIndex('0');
 };
 const attach=async()=>{
  if(!preview)throw Error('اختر ملف التقرير');
  const file={fileName:preview.name,sha256:preview.sha256,uploadedAt:new Date().toISOString(),...(preview.sourceQueueId?{sourceQueueId:preview.sourceQueueId}:{})};
  if(type==='financial'){
   if(!column||revenue===undefined||revenue<0)throw Error('اختر خانة إجمالي إيراد اليوم الصحيح من التقرير');
   await onAttach(date,{type,file,totalRevenue:revenue});
  }else{
   const bad=parsed.find(r=>r.error||!r.matchedItem);if(bad)throw Error(`${bad.rawName||bad.rawCode}: ${bad.error}`);
   await onAttach(date,{type,file,lines:parsed.map(r=>({itemId:r.matchedItem!.id,quantity:r.quantity,unitLabel:r.unitHint,normalizedQtyInBaseUnit:convertToBaseUnit(r.quantity,r.unitHint,r.matchedItem!.baseUnit)}))});
  }
  setPreview(null);
 };
 const input='w-full min-w-0 max-w-full border rounded-xl p-3 bg-white';
 return <main dir="rtl" className="min-h-screen bg-[#FAF8F4] p-4 pb-28 space-y-4">
  <button onClick={onBack}>رجوع</button><h1 className="font-black text-xl">تقارير يوم الكاشير</h1>
  <p>ارفع تقرير الأرقام المالية وتقرير الأصناف لنفس اليوم. يتسجل الإيراد مرة واحدة، وتُخصم المكونات عند اعتماد اليوم بعد اكتمال التقريرين.</p>
  {!!queued.length&&<section className="border rounded-xl p-3"><h2 className="font-bold">ملفات وصلت من جهاز الكاشير وتنتظر المراجعة</h2><p>حدد نوع التقرير ثم افتح الملف لمراجعته.</p>{queued.map(q=><button key={q.id} disabled={busy} className="block p-2 underline" onClick={()=>{setDate(q.sale_date);setPreview({name:q.file_name,sha256:q.content_hash,rows:q.raw_rows,sourceQueueId:q.id});setColumn('');setRowIndex('0');}}>{q.sale_date} — {q.file_name}</button>)}</section>}
  <label className="block">يوم العمل<input className={input} type="date" value={date} onChange={e=>{setDate(e.target.value);setPreview(null);}}/></label>
  <label className="block">نوع التقرير<select className={input} value={type} onChange={e=>{setType(e.target.value as typeof type);setPreview(null);}}><option value="financial">الأرقام المالية — إيراد اليوم</option><option value="items">الأصناف المباعة — الكميات</option></select></label>
  <label className="block min-w-0">ملف التقرير<input className="block w-full min-w-0 max-w-full rounded-xl border border-[#E6DEC8] bg-white p-2 text-xs file:me-2 file:rounded-lg file:border-0 file:bg-[#F5EDDD] file:p-2 file:text-[#795D25]" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void act(()=>readFile(file));e.target.value='';}}/></label>
  {preview&&<section className="border rounded-xl p-3 space-y-3"><h2 className="font-bold">مراجعة {preview.name}</h2>
   {type==='financial'?<>
    <label className="block">رقم صف إجمالي اليوم (من {preview.rows.length} صف)<input className={input} type="number" min="1" max={preview.rows.length} value={Number(rowIndex)+1} onChange={e=>setRowIndex(String(Number(e.target.value)-1))}/></label>
    <p className="text-sm break-words">الصف المختار: {Object.entries(preview.rows[Number(rowIndex)]??{}).map(([key,value])=>`${key}: ${String(value)}`).join(' — ')||'اختر صفًا داخل الملف'}</p>
    <label className="block">عمود إيراد اليوم<select className={input} value={column} onChange={e=>setColumn(e.target.value)}><option value="">اختر العمود</option>{Object.keys(preview.rows[Number(rowIndex)]??{}).map(c=><option key={c}>{c}</option>)}</select></label>
    <p>إيراد اليوم المختار: {revenue===undefined?'غير محدد':revenue.toLocaleString('ar-EG')+' ج.م'}</p><p className="text-sm">اختر إجمالي المبيعات النهائي لليوم؛ لا تجمع صف الإجمالي مع تفاصيله.</p>
   </>:<><p>{parsed.length} صف أصناف؛ {parsed.filter(r=>r.error).length} أخطاء مطابقة.</p>{parsed.slice(0,30).map((r,i)=><p key={i} className={r.error?'text-red-700':''}>{r.matchedItem?.name||r.rawName}: {r.quantity} {r.unitHint} {r.error}</p>)}{parsed.length>30&&<p>معروض أول 30 صفًا؛ تُراجع جميع الصفوف قبل الحفظ.</p>}</>}
   <button disabled={busy} onClick={()=>void act(attach)} className="bg-[#1E1612] text-white rounded-xl p-3">حفظ التقرير لهذا اليوم</button>
  </section>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  <h2 className="font-bold">الأيام المسجلة</h2>
  <label className="block">بحث بتاريخ اليوم<input className={input} placeholder="YYYY-MM-DD" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/></label><RecordPagination {...page}/>
  {page.visible.map(d=><article key={d.id} className="border rounded-xl bg-white p-3 space-y-2"><h3 className="font-bold">{d.date} — {d.status==='approved'?'معتمد':'بانتظار الاعتماد'}</h3><p>المالي: {d.financialReport?'مرفوع':'ناقص'} — الأصناف: {d.itemsReport?'مرفوع':'ناقص'}</p><p>الإيراد: {d.financialReport?.totalRevenue.toLocaleString('ar-EG')??'لم يحدد'}؛ التكلفة: {d.status==='approved'?d.totalCost?.toLocaleString('ar-EG'):'تُحدد عند الاعتماد'}</p>
   {d.status==='pending'&&<button disabled={busy||!d.financialReport||!d.itemsReport} className="bg-[#1E1612] text-white rounded-xl p-2 disabled:opacity-40" onClick={()=>void act(()=>onApprove(d.id))}>اعتماد اليوم وخصم الأصناف</button>}
   {!!d.shortages?.length&&<div className="text-red-700"><p>عجز مخزون بعد الاعتماد:</p>{d.shortages.map(s=><p key={s.itemId}>{items.find(i=>i.id===s.itemId)?.name??s.itemId}: {s.shortage}</p>)}</div>}
  </article>)}
 </main>;
}
