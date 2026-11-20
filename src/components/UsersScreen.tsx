import {Modal} from './Modal';
import React,{useEffect,useState} from 'react';
import {ShieldCheck,UserPlus,Users} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {listUserAccounts,saveUserAccount,type UserInput} from '../lib/userAccounts';
import {writePermissions,type ManagedUser,type UserAccess} from '../lib/userAccess';
import type {Partner} from '../types/erp';

const fresh=():UserInput=>({email:'',password:'',username:'',displayName:'',role:'cashier',partnerId:null,permissions:{}});
export function UsersScreen({access,partners,onBack}:{access:UserAccess;partners:Partner[];onBack:()=>void}){
 const [users,setUsers]=useState<ManagedUser[]>([]),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[showDeleted,setShowDeleted]=useState(false);
 const [query,setQuery]=useState('');
 const [form,setForm]=useState<UserInput|null>(null);
 useEffect(()=>{
  if(!access.isOwner){setLoading(false);return;}
  let alive=true;setLoading(true);
  void listUserAccounts().then(rows=>{if(alive)setUsers(rows);}).catch(e=>{if(alive)setError((e as Error).message);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[revision,access.isOwner]);
 const refresh=()=>setRevision(n=>n+1);
 const commit=async(input:UserInput)=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{await saveUserAccount(input);setForm(null);setNotice(input.id?'تم حفظ حساب المستخدم وصلاحياته':'تم إنشاء المستخدم دون إضافة شريك أو تغيير الحصص');refresh();}
  catch(e){setError((e as Error).message);refresh();}
  finally{setBusy(false);}
 };
 const edit=(u:ManagedUser)=>setForm({id:u.userId,username:u.username,displayName:u.displayName,role:u.role,partnerId:u.partnerId,permissions:{...u.permissions},disabled:u.disabled,deleted:u.deleted});
 const changeStatus=(u:ManagedUser,deleted:boolean,disabled:boolean)=>{
  if(u.isOwner)return;
  if(deleted&&!window.confirm(`إزالة المستخدم ${u.displayName} ومنع دخوله مع الاحتفاظ بسجله؟`))return;
  void commit({id:u.userId,username:u.username,displayName:u.displayName,role:u.role,partnerId:u.partnerId,permissions:u.permissions,disabled,deleted});
 };
 const term=query.trim().toLocaleLowerCase('ar-EG');
 const page=useRecordPage(users.filter(user=>(showDeleted||!user.deleted)&&
   [user.displayName,user.username,user.email].some(value=>value?.toLocaleLowerCase('ar-EG').includes(term))),query+'|'+showDeleted,20);
 const editingMaster=!!form?.id&&users.some(u=>u.userId===form.id&&u.isOwner);
 return <div className="operation-screen min-h-screen pb-28 space-y-4" dir="rtl">
  <OperationHeader title="المستخدمين وصلاحيات الدخول" description="حسابات الدخول مستقلة عن حسابات الشركاء وحصصهم." icon={Users} onBack={onBack} busy={busy}/>
  <div className="record-workspace">
   {!access.isOwner?<section className="operation-surface space-y-2"><h2 className="font-bold">حسابك</h2><p>{access.displayName}</p><p className="operation-note">إضافة المستخدمين وتعديل الصلاحيات متاحان لحساب المالك الرئيسي فقط.</p></section>:<>
    <div className="operation-note flex items-start gap-2"><ShieldCheck size={20} className="shrink-0" aria-hidden="true"/><p>المالك الرئيسي هو الحساب الماستر؛ لا يُحذف ولا يُعطّل. حذف المستخدمين الآخرين يمنع الدخول ويحتفظ بالسجل، ويمكن للمالك استرجاعهم.</p></div>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||loading} className="operation-primary" onClick={()=>{setError('');setForm(fresh());}}><UserPlus size={18} aria-hidden="true"/>إضافة مستخدم</button><button type="button" disabled={busy||loading} className="action-button" onClick={()=>{setError('');refresh();}}>تحديث القائمة</button></div>
    <label className="inline-flex gap-2 items-center min-h-[44px]"><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/>عرض المستخدمين المحذوفين</label>
    {loading&&<p role="status">جارٍ تحميل حسابات الدخول…</p>}
    <label className="record-search">بحث في المستخدمين<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="الاسم أو البريد الإلكتروني"/></label>
    {!loading&&!error&&!page.total&&<p className="record-state" role="status">مفيش حسابات مطابقة للبحث.</p>}
    {page.total>page.pageSize&&<RecordPagination {...page}/>}
    <div className="record-grid">
     {page.visible.map(u=><article key={u.userId} className="record-card flex flex-col justify-between gap-3">
      <div className="space-y-1.5">
       <div className="record-heading mb-0"><h2 className="font-black text-ink-strong">{u.displayName}</h2><span className="record-badge">{u.isOwner?'المالك الرئيسي — محمي':u.deleted?'محذوف':u.disabled?'معطّل':'نشط'}</span></div>
       <p dir="ltr" className="break-all text-right text-xs text-ink">{u.email}</p><p className="text-xs text-ink">اسم المستخدم: {u.username}</p>
       <p className="text-xs text-ink-strong">{u.role==='cashier'?'رفع ملفات الكاشير فقط':u.isOwner?'صلاحيات النظام الكاملة':u.permissions.view?'الاطلاع على جميع بيانات المحل، مع أذونات التعديل المحددة':'لا يوجد تصريح للاطلاع على بيانات المحل'}</p>
       <p className="text-xs text-ink-faint">الحساب المالي المرتبط: {partners.find(p=>p.id===u.partnerId)?.name??'بدون ربط بشريك'}</p>
      </div>
      <div className="register-actions"><button type="button" disabled={busy} className="action-button flex-1" onClick={()=>edit(u)}>{u.isOwner?'تعديل بيانات الحساب':'تعديل المستخدم والصلاحيات'}</button>
       {!u.isOwner&&<><button type="button" disabled={busy} className="action-button" onClick={()=>changeStatus(u,false,u.deleted?false:!u.disabled)}>{u.deleted?'استرجاع المستخدم':u.disabled?'تفعيل المستخدم':'تعطيل المستخدم'}</button>{!u.deleted&&<button type="button" disabled={busy} className="action-button text-status-danger border-status-danger-line" onClick={()=>changeStatus(u,true,true)}>حذف المستخدم</button>}</>}
      </div>
     </article>)}
    </div>
   </>}
   {notice&&<p role="status" className="login-notice">{notice}</p>}
   {!form&&error&&<p role="alert" className="login-error">{error}</p>}
  </div>
  {form&&<Modal title={<>{form.id?'تعديل حساب المستخدم':'إضافة حساب مستخدم'}</>}  onClose={()=>setForm(null)} busy={busy} footer={<><button disabled={busy} className="operation-primary" type="submit" form="managed-user-form">{busy?'جارٍ حفظ المستخدم…':'حفظ المستخدم'}</button><button disabled={busy} className="action-button" type="button" onClick={()=>setForm(null)}>إلغاء</button></>}><form id="managed-user-form" onSubmit={e=>{e.preventDefault();void commit(form);}} className="space-y-3">
    <fieldset disabled={busy} className="space-y-3 min-w-0">
     <label className="block">الاسم<input className="operation-input mt-1" required maxLength={80} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})}/></label>
     <label className="block">اسم المستخدم<input dir="ltr" className="operation-input mt-1" required minLength={3} maxLength={40} pattern={"[A-Za-z0-9_.\\-]+"} value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label>
     {!form.id&&<><label className="block">البريد الإلكتروني<input type="email" dir="ltr" autoComplete="off" required className="operation-input mt-1" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
      <label className="block">كلمة المرور<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required className="operation-input mt-1" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><p className="operation-caption">ينشئ المالك الحساب بهذه البيانات؛ لا تُرسل رسالة بريد تلقائيًا ولا تُحفظ كلمة المرور في بيانات المحل.</p></>}
     {!editingMaster&&<label className="block">نوع الحساب<select className="operation-input mt-1" value={form.role} onChange={e=>setForm({...form,role:e.target.value as 'partner'|'cashier',permissions:{}})}><option value="cashier">كاشير — رفع التقارير فقط</option><option value="partner">مستخدم لوحة الإدارة</option></select></label>}
     {form.role==='partner'&&!editingMaster&&<div className="border border-line rounded-md p-3 space-y-3 bg-surface-sunken"><label className="flex gap-2 items-start"><input type="checkbox" checked={form.permissions.view===true} onChange={e=>setForm({...form,permissions:e.target.checked?{view:true}:{}})}/>الاطلاع على جميع بيانات المحل، بما فيها الحسابات والتقارير</label><p className="operation-caption">تفعيل الاطلاع وحده يجعل الحساب للعرض فقط. حدّد أذونات التعديل المطلوبة أدناه.</p>{writePermissions.map(p=><label key={p.id} className="flex gap-2 items-start"><input type="checkbox" disabled={!form.permissions.view} checked={form.permissions[p.id]===true} onChange={e=>setForm({...form,permissions:{...form.permissions,[p.id]:e.target.checked}})}/>{p.label}</label>)}</div>}
     <label className="block">ربط بحساب شريك مالي (اختياري)<select className="operation-input mt-1" value={form.partnerId??''} onChange={e=>setForm({...form,partnerId:e.target.value||null})}><option value="">بدون ربط بشريك</option>{partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <p className="operation-caption">الربط لا ينشئ شريكًا ولا يغيّر نسب الملكية أو الأرصدة.</p>
    </fieldset>
    {error&&<p role="alert" className="login-error">{error}</p>}

   </form></Modal>}
 </div>;
}
