import React,{useMemo,useState} from 'react';
import type {CatalogNameDraft,InventoryItem} from '../types/erp';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {Modal} from './Modal';
import {LegacyCatalogPricesNote} from './LegacyCatalogPricesNote';
import {Pencil,Trash2} from 'lucide-react';
export function CatalogNameDraftPanel({drafts,items,onComplete,onChange}:{drafts:CatalogNameDraft[];items:InventoryItem[];onComplete?:(id:string,item:Omit<InventoryItem,'id'>)=>Promise<void>;onChange?:(id:string,name:string|null)=>Promise<void>}){
 const [search,setSearch]=useState(''),[editing,setEditing]=useState<CatalogNameDraft|null>(null);
 const [action,setAction]=useState<{draft:CatalogNameDraft;kind:'rename'|'delete'}|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const open=(draft:CatalogNameDraft,kind:'rename'|'delete')=>{setAction({draft,kind});setName(draft.name);setError('');};
 const save=async()=>{if(!action||!onChange||busy)return;setBusy(true);setError('');try{await onChange(action.draft.id,action.kind==='delete'?null:name);setAction(null);}catch(e){setError(e instanceof Error?e.message:'تعذر تأكيد الحفظ');}finally{setBusy(false);}};
 const matches=useMemo(()=>drafts.filter(d=>d.name.includes(search.trim())),[drafts,search]);
 const page=useRecordPage(matches,search,12);
 if(!drafts.length&&!action&&!editing)return null;
 return <section className="visual-card space-y-4" aria-label="أسماء مستوردة تحتاج استكمال"><header className="record-heading"><div><h2>أسماء مستوردة تحتاج استكمال ({drafts.length})</h2><p>أسماء من كود المشروع القديم، وليست منتجات معتمدة. حدد النوع والوحدة والأسعار والرصيد والوصفة المطلوبة قبل الاستخدام. الأسماء المتشابهة تُراجع يدويًا.</p></div></header>
 <label className="block text-sm">بحث في الأسماء المستوردة<input className="operation-input" value={search} onChange={e=>setSearch(e.target.value)}/></label>
 <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{page.visible.map(d=><li className="record-card" key={d.id}><h3 className="font-bold break-words">{d.name}</h3><p className="operation-note">{d.legacyPrices?'النوع والوحدة الأساسية ورصيد المخزون لم تُحدد':'النوع والوحدة والأسعار والرصيد لم تُحدد'}</p>{d.legacyPrices&&<LegacyCatalogPricesNote prices={d.legacyPrices}/>}{onComplete&&<button className="record-action mt-3" onClick={()=>setEditing(d)}>استكمال {d.name}</button>}{onChange&&<div className="record-actions mt-2" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}><button aria-label={`تعديل اسم ${d.name}`} onClick={()=>open(d,'rename')} className="inline-flex items-center justify-center gap-2"><Pencil size={16} aria-hidden="true"/>تعديل</button><button aria-label={`حذف ${d.name}`} onClick={()=>open(d,'delete')} className="inline-flex items-center justify-center gap-2 text-red-700"><Trash2 size={16} aria-hidden="true"/>حذف</button></div>}</li>)}</ul>
 {!matches.length&&<p role="status">لا توجد أسماء مطابقة.</p>}<RecordPagination {...page}/>
 {editing&&onComplete&&<ItemDefinitionModal key={editing.id} items={items} initialName={editing.name} initialPrices={editing.legacyPrices} requireDetails onClose={()=>setEditing(null)} onSave={item=>onComplete(editing.id,item)}/>}
 {action&&onChange&&<Modal title={action.kind==='delete'?'حذف اسم المنتج':'تعديل اسم المنتج'} description={action.kind==='delete'?`هل تريد حذف (${action.draft.name}) من قائمة الاستكمال؟ الاسم غير معتمد ولا توجد له أرصدة أو حركات.`:'يمكنك تصحيح الاسم الآن، واستكمال بيانات المنتج لاحقًا.'} busy={busy} onClose={()=>setAction(null)} footer={<div className="record-actions"><button disabled={busy} onClick={()=>setAction(null)}>إلغاء</button><button disabled={busy} className={action.kind==='delete'?'text-red-700':''} onClick={()=>void save()}>{busy?'جارٍ تأكيد الحفظ…':action.kind==='delete'?'تأكيد الحذف':'حفظ الاسم'}</button></div>}>{action.kind==='rename'&&<label className="block">اسم المنتج<input className="operation-input" value={name} maxLength={200} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}{error&&<p role="alert">{error}</p>}</Modal>}
 </section>;
}
