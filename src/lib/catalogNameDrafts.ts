import {validateStore,type StoreState} from './storeState';
import type {InventoryItem} from '../types/erp';
import type {StoreEngine} from './storeEngine';
export const normalizeCatalogName=(name:string)=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export function changeCatalogNameDraft(state:StoreState,id:string,name:string|null,actor:{name:string;id?:string}={name:'مستخدم النظام'}){
 const before=state.catalogNameDrafts.find(d=>d.id===id);
 if(!before){if(name===null)return state;throw Error('الاسم لم يعد في قائمة الاستكمال؛ حدّث البيانات');}
 const nextName=name===null?null:name.normalize('NFC').trim().replace(/\s+/g,' ');
 if(nextName!==null){
  if(!nextName||nextName.length>200)throw Error('اسم المنتج مطلوب وبحد أقصى 200 حرف');
  if(nextName===before.name)return state;
  if(state.items.some(i=>normalizeCatalogName(i.name)===normalizeCatalogName(nextName)))throw Error('يوجد منتج معتمد بنفس الاسم');
 }
 return validateStore({...state,catalogNameDrafts:state.catalogNameDrafts.flatMap(d=>d.id!==id?[d]:nextName===null?[]:[{...d,name:nextName}]),auditLogs:[{id:crypto.randomUUID(),timestamp:new Date().toISOString(),partnerName:actor.name,actorId:actor.id,actionType:'تعديل وصفة/صنف',description:nextName===null?`حذف اسم مستورد من قائمة الاستكمال: ${before.name}`:`تعديل اسم مستورد من (${before.name}) إلى (${nextName})`},...state.auditLogs]});
}
export async function saveCatalogNameDraftChange(engine:StoreEngine,id:string,name:string|null,actor?:{name:string;id?:string}){
 const confirm=async()=>{await engine.flush();if(engine.snapshot.status!=='ready')throw Error(engine.snapshot.error||'لم يصل تأكيد حفظ التعديل');};
 if(engine.hasPending)await confirm();
 const next=changeCatalogNameDraft(engine.state,id,name,actor);if(next===engine.state)return;
 engine.replace(next);await confirm();
}
export function completeCatalogNameDraft(state:StoreState,id:string,input:Omit<InventoryItem,'id'>,actor:{name:string;id?:string}={name:'مستخدم النظام'}){
 if(!state.catalogNameDrafts.some(d=>d.id===id))throw Error('الصنف المستورد لم يعد في قائمة الاستكمال؛ حدّث البيانات');
 if(state.items.some(i=>normalizeCatalogName(i.name)===normalizeCatalogName(input.name)))throw Error('يوجد صنف بنفس الاسم بالفعل؛ راجعه قبل إضافة نسخة أخرى');
 if(state.items.some(i=>i.code.toUpperCase()===input.code.toUpperCase())||state.catalogNameDrafts.some(d=>d.id!==id&&d.definition?.code.toUpperCase()===input.code.toUpperCase()))throw Error('كود الصنف مستخدم أو محجوز');
 return validateStore({...state,items:[{...input,id:crypto.randomUUID(),openingStock:input.stock},...state.items],catalogNameDrafts:state.catalogNameDrafts.filter(d=>d.id!==id),auditLogs:[{id:crypto.randomUUID(),timestamp:new Date().toISOString(),partnerName:actor.name,actorId:actor.id,actionType:'تعديل وصفة/صنف',description:`استكمال واعتماد الصنف المستورد: ${input.name}`},...state.auditLogs]});
}
export async function saveCatalogNameDraft(engine:StoreEngine,id:string,input:Omit<InventoryItem,'id'>,actor?:{name:string;id?:string}){
 const confirm=async()=>{await engine.flush();if(engine.snapshot.status!=='ready')throw Error(engine.snapshot.error||'لم يصل تأكيد حفظ الصنف');};
 if(engine.hasPending){await confirm();if(!engine.state.catalogNameDrafts.some(d=>d.id===id)&&engine.state.items.some(i=>i.code===input.code&&normalizeCatalogName(i.name)===normalizeCatalogName(input.name)))return;}
 engine.replace(completeCatalogNameDraft(engine.state,id,input,actor));await confirm();
}
