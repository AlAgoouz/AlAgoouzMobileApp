import React,{useState} from 'react';
import {Users} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import type {Partner} from '../types/erp';

export function FinancialPartnersScreen({partners,canEdit,onSave,onBack,onReports}:{partners:Partner[];canEdit:boolean;onSave:(next:Partner[])=>boolean;onBack:()=>void;onReports:()=>void}){
 const [draft,setDraft]=useState<Partner[]|null>(null),[shares,setShares]=useState<Record<string,string>>({}),[error,setError]=useState('');
 const edit=()=>{setDraft(partners.map(p=>({...p})));setShares(Object.fromEntries(partners.map(p=>[p.id,String(p.sharePercent)])));setError('');};
 const save=()=>{
  if(!draft)return;
  const next=draft.map(p=>({...p,name:p.name.trim(),sharePercent:Number(shares[p.id]),avatarLetter:partners.find(live=>live.id===p.id)?.name===p.name.trim()?p.avatarLetter:p.name.trim().charAt(0)}));
  if(next.some(p=>!p.name||!shares[p.id]?.trim()||!Number.isFinite(p.sharePercent)||p.sharePercent<0||p.sharePercent>100)||Math.abs(next.reduce((s,p)=>s+p.sharePercent,0)-100)>0.001){setError('أدخل أسماء صحيحة ونسبًا من صفر إلى 100، ومجموع الحصص يجب أن يساوي 100%');return;}
  // Rebase only the explicitly edited metadata. Financial totals may have moved
  // while this form was open and must never be replaced by the draft snapshot.
  if(partners.some(p=>!draft.some(d=>d.id===p.id))){setError('تغيرت قائمة الشركاء؛ أعد فتح التعديل');return;}
  const result=next.map(p=>{const live=partners.find(row=>row.id===p.id);return live?{...live,name:p.name,avatarLetter:p.avatarLetter,sharePercent:p.sharePercent}:p;});
  if(onSave(result))setDraft(null);else setError('لم تُحفظ الحصص؛ راجع الصلاحيات وحالة الحفظ');
 };
 return <main dir="rtl" className="operation-screen p-4 pb-28 space-y-4">
  <OperationHeader title="الشركاء والحصص المالية" description="الملكية والمساهمات والمسحوبات — منفصلة عن حسابات الدخول." icon={Users} onBack={onBack}/>
  <div className="grid grid-cols-2 gap-3">{partners.map(p=><article key={p.id} className="bg-white border border-[#E6DEC8] rounded-2xl p-4 space-y-3 min-w-0"><h2 className="font-black break-words">{p.name}</h2><p className="text-[#896327] font-black text-lg">{p.sharePercent}%</p><p className="text-xs">مساهمات من جيبه:<br/><b>{p.totalPaidFromPocket.toLocaleString('ar-EG')} ج.م</b></p><p className="text-xs">مسحوبات:<br/><b>{p.totalWithdrawals.toLocaleString('ar-EG')} ج.م</b></p></article>)}</div>
  <p className="operation-note">تعريف شريك مالي أو تعديل حصته لا ينشئ مستخدمًا ولا يمنحه صلاحية الدخول. الأرباح والحركات المالية تظل مرتبطة بسجلاتها الأصلية.</p>
  <button type="button" className="border rounded-xl p-3" onClick={onReports}>التقارير والأرباح وحسابات الشركاء</button>
  {canEdit&&!draft&&<button type="button" className="login-submit w-full" onClick={edit}>إدارة الشركاء والنسب</button>}
  {draft&&<section className="bg-white rounded-2xl border p-4 space-y-4" aria-label="تعديل الشركاء والنسب">
   {draft.map(p=><div key={p.id} className="grid grid-cols-2 gap-3"><label>اسم الشريك<input aria-label={`اسم الشريك ${p.id}`} className="w-full block border rounded-xl p-2" value={p.name} onChange={e=>setDraft(draft.map(d=>d.id===p.id?{...d,name:e.target.value}:d))}/></label><label>نسبة الملكية %<input aria-label={`نسبة الشريك ${p.id}`} type="number" min="0" max="100" step="any" className="w-full block border rounded-xl p-2" value={shares[p.id]??''} onChange={e=>setShares({...shares,[p.id]:e.target.value})}/></label></div>)}
   <button type="button" className="border rounded-xl p-2" onClick={()=>{const id=crypto.randomUUID();setDraft([...draft,{id,name:'',username:'financial-'+id,role:'شريك',avatarLetter:'',phone:'',sharePercent:0,totalPaidFromPocket:0,totalWithdrawals:0}]);setShares({...shares,[id]:'0'});}}>إضافة شريك مالي</button>
   {error&&<p role="alert" className="login-error">{error}</p>}
   <div className="flex gap-3"><button type="button" className="login-submit px-4" onClick={save}>حفظ الشركاء والحصص</button><button type="button" className="border rounded-xl px-4" onClick={()=>setDraft(null)}>إلغاء</button></div>
  </section>}
 </main>;
}
