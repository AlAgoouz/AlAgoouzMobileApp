import {validateStore,type StoreState} from './storeState';
import type {InventoryItem} from '../types/erp';
import type {StoreEngine} from './storeEngine';
export const normalizeCatalogName=(name:string)=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export function completeCatalogNameDraft(state:StoreState,id:string,input:Omit<InventoryItem,'id'>,actor:{name:string;id?:string}={name:'مستخدم النظام'}){
 if(!state.catalogNameDrafts.some(d=>d.id===id))throw Error('الصنف المستورد لم يعد في قائمة الاستكمال؛ حدّث البيانات');
 if(state.items.some(i=>normalizeCatalogName(i.name)===normalizeCatalogName(input.name)))throw Error('يوجد صنف بنفس الاسم بالفعل؛ راجعه قبل إضافة نسخة أخرى');
 if(state.items.some(i=>i.code.toUpperCase()===input.code.toUpperCase()))throw Error('كود الصنف مستخدم');
 return validateStore({...state,items:[{...input,id:crypto.randomUUID(),openingStock:input.stock},...state.items],catalogNameDrafts:state.catalogNameDrafts.filter(d=>d.id!==id),auditLogs:[{id:crypto.randomUUID(),timestamp:new Date().toISOString(),partnerName:actor.name,actorId:actor.id,actionType:'تعديل وصفة/صنف',description:`استكمال واعتماد الصنف المستورد: ${input.name}`},...state.auditLogs]});
}
export async function saveCatalogNameDraft(engine:StoreEngine,id:string,input:Omit<InventoryItem,'id'>,actor?:{name:string;id?:string}){
 const confirm=async()=>{await engine.flush();if(engine.snapshot.status!=='ready')throw Error(engine.snapshot.error||'لم يصل تأكيد حفظ الصنف');};
 if(engine.hasPending){await confirm();if(!engine.state.catalogNameDrafts.some(d=>d.id===id)&&engine.state.items.some(i=>i.code===input.code&&normalizeCatalogName(i.name)===normalizeCatalogName(input.name)))return;}
 engine.replace(completeCatalogNameDraft(engine.state,id,input,actor));await confirm();
}
