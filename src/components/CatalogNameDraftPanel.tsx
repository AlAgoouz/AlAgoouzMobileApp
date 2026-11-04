import React,{useMemo,useState} from 'react';
import type {CatalogNameDraft,InventoryItem} from '../types/erp';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {RecordPagination,useRecordPage} from './RecordPagination';
export function CatalogNameDraftPanel({drafts,items,onComplete}:{drafts:CatalogNameDraft[];items:InventoryItem[];onComplete?:(id:string,item:Omit<InventoryItem,'id'>)=>Promise<void>}){
 const [search,setSearch]=useState(''),[editing,setEditing]=useState<CatalogNameDraft|null>(null);
 const matches=useMemo(()=>drafts.filter(d=>d.name.includes(search.trim())),[drafts,search]);
 const page=useRecordPage(matches,search,12);
 if(!drafts.length)return null;
 return <section className="visual-card space-y-4" aria-label="أسماء مستوردة تحتاج استكمال"><header className="record-heading"><div><h2>أسماء مستوردة تحتاج استكمال ({drafts.length})</h2><p>أسماء من كود المشروع القديم، وليست منتجات معتمدة. حدد النوع والوحدة والأسعار والرصيد والوصفة المطلوبة قبل الاستخدام. الأسماء المتشابهة تُراجع يدويًا.</p></div></header>
 <label className="block text-sm">بحث في الأسماء المستوردة<input className="operation-input" value={search} onChange={e=>setSearch(e.target.value)}/></label>
 <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{page.visible.map(d=><li className="record-card" key={d.id}><h3 className="font-bold break-words">{d.name}</h3><p className="operation-note">النوع والوحدة والأسعار والرصيد لم تُحدد</p>{onComplete&&<button className="record-action mt-3" onClick={()=>setEditing(d)}>استكمال {d.name}</button>}</li>)}</ul>
 {!matches.length&&<p role="status">لا توجد أسماء مطابقة.</p>}<RecordPagination {...page}/>
 {editing&&onComplete&&<ItemDefinitionModal key={editing.id} items={items} initialName={editing.name} requireDetails onClose={()=>setEditing(null)} onSave={item=>onComplete(editing.id,item)}/>}
 </section>;
}
