import React,{useMemo,useState} from 'react';
import type {CatalogNameDraft,InventoryItem} from '../types/erp';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {useRecordPage} from './RecordPagination';
import {Modal} from './Modal';
import {Pencil,Trash2} from 'lucide-react';
import {CatalogListControls,CatalogListNavigation} from './CatalogListControls';
import {browseCatalog,type CatalogSort} from '../lib/catalogBrowse';
export function CatalogNameDraftPanel({drafts,items,onComplete,onChange,onShowReady}:{drafts:CatalogNameDraft[];items:InventoryItem[];onComplete?:(id:string,item:Omit<InventoryItem,'id'>)=>Promise<void>;onChange?:(id:string,name:string|null)=>Promise<void>;onShowReady?:()=>void}){
 const [search,setSearch]=useState(''),[editing,setEditing]=useState<CatalogNameDraft|null>(null);
 const [sort,setSort]=useState<CatalogSort>('name'),[pageSize,setPageSize]=useState(50);
 const [action,setAction]=useState<{draft:CatalogNameDraft;kind:'rename'|'delete'}|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const open=(draft:CatalogNameDraft,kind:'rename'|'delete')=>{setAction({draft,kind});setName(draft.name);setError('');};
 const save=async()=>{if(!action||!onChange||busy)return;setBusy(true);setError('');try{await onChange(action.draft.id,action.kind==='delete'?null:name);setAction(null);}catch(e){setError(e instanceof Error?e.message:'تعذر تأكيد الحفظ');}finally{setBusy(false);}};
 const matches=useMemo(()=>browseCatalog(drafts,search,sort),[drafts,search,sort]);
 const page=useRecordPage(matches,search+'|'+sort+'|'+pageSize,pageSize);
 if(!drafts.length&&!action&&!editing)return <div className="catalog-empty"><p>لا توجد منتجات تحتاج استكمالًا.</p>{onShowReady&&<button onClick={onShowReady}>عرض المنتجات الجاهزة</button>}</div>;
 return <section className="space-y-3" aria-label="أسماء مستوردة تحتاج استكمال"><header className="record-heading"><div><h2>استكمال بيانات المنتجات ({drafts.length})</h2><p>كل اسم في سطر. اختر استكمال لتحديد النوع والوحدة والأسعار والرصيد والوصفة المطلوبة. الأسماء غير المكتملة لا تدخل البيع أو المخزون.</p></div></header>
 <CatalogListControls label="بحث في الأسماء المستوردة" search={search} onSearch={value=>{page.setPage(0);setSearch(value);}} sort={sort} onSort={value=>{page.setPage(0);setSort(value);}} pageSize={pageSize} onPageSize={value=>{page.setPage(0);setPageSize(value);}}/>
 <CatalogListNavigation page={page} label="انتقل إلى صفحة الأسماء المستوردة"/>
 <ul className="catalog-register" aria-label="سجل المنتجات التي تحتاج استكمالًا">{page.visible.map(d=><li className="catalog-register-row catalog-register-row--pending" key={d.id}><div className="catalog-register-identity"><h3>{d.name}</h3><span className="catalog-register-badge">تحتاج استكمال</span></div><p className="catalog-register-note">النوع والوحدة والأسعار والرصيد لم تُحدد</p><div className="catalog-register-actions">{onComplete&&<button className="catalog-complete" aria-label={`استكمال ${d.name}`} onClick={()=>setEditing(d)}>استكمال</button>}{onChange&&<><button aria-label={`تعديل اسم ${d.name}`} onClick={()=>open(d,'rename')}><Pencil size={15} aria-hidden="true"/>تعديل</button><button aria-label={`حذف ${d.name}`} onClick={()=>open(d,'delete')} className="catalog-remove"><Trash2 size={15} aria-hidden="true"/>حذف</button></>}</div></li>)}</ul>
 {!matches.length&&<p role="status" className="catalog-empty">لا توجد أسماء مطابقة.</p>}
 {editing&&onComplete&&<ItemDefinitionModal key={editing.id} items={items} initialName={editing.name} requireDetails onClose={()=>setEditing(null)} onSave={item=>onComplete(editing.id,item)}/>}
 {action&&onChange&&<Modal title={action.kind==='delete'?'حذف اسم المنتج':'تعديل اسم المنتج'} description={action.kind==='delete'?`هل تريد حذف (${action.draft.name}) من قائمة الاستكمال؟ الاسم غير معتمد ولا توجد له أرصدة أو حركات.`:'يمكنك تصحيح الاسم الآن، واستكمال بيانات المنتج لاحقًا.'} busy={busy} onClose={()=>setAction(null)} footer={<div className="record-actions"><button disabled={busy} onClick={()=>setAction(null)}>إلغاء</button><button disabled={busy} className={action.kind==='delete'?'text-red-700':''} onClick={()=>void save()}>{busy?'جارٍ تأكيد الحفظ…':action.kind==='delete'?'تأكيد الحذف':'حفظ الاسم'}</button></div>}>{action.kind==='rename'&&<label className="block">اسم المنتج<input className="operation-input" value={name} maxLength={200} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}{error&&<p role="alert">{error}</p>}</Modal>}
 </section>;
}
