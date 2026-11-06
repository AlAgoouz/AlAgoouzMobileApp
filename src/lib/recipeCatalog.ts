import type {CatalogNameDraft,InventoryItem,RecipeIngredient,RecipeProductDefinition} from '../types/erp';
import {validateStore,recipeProductDefinitionSchema,type StoreState} from './storeState';
import type {StoreEngine} from './storeEngine';
import {completeCatalogNameDraft,normalizeCatalogName} from './catalogNameDrafts';
import {calculateRecipeTotalCost} from './itemCosts';
import {adjustCatalogItem} from './catalogAdjustments';

type Actor={name:string;id?:string};
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])):v;
const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function checkDefinition(state:StoreState,id:string,name:string,input:RecipeProductDefinition){
 const definition=recipeProductDefinitionSchema.parse({...input,code:input.code.trim()});
 if(!name.trim()||name.trim().length>200)throw Error('اسم المنتج مطلوب وبحد أقصى 200 حرف');
 if(definition.category==='manufactured_blend'&&definition.baseUnit!=='kg')throw Error('وصفة التوليفة لكل كيلو');
 if(definition.category==='drink_recipe'&&definition.baseUnit!=='piece')throw Error('وصفة المشروب لكل كوب');
 if(definition.category!=='manufactured_blend'&&(definition.openingStock!==0||definition.minStock!==0))throw Error('المشروبات والتحويجات لا تملك رصيدًا جاهزًا');
 if(state.items.some(i=>i.code.toUpperCase()===definition.code.toUpperCase()||normalizeCatalogName(i.name)===normalizeCatalogName(name)))throw Error('يوجد منتج معتمد بنفس الكود أو الاسم');
 if(state.catalogNameDrafts.some(d=>d.id!==id&&(normalizeCatalogName(d.name)===normalizeCatalogName(name)||d.definition?.code.toUpperCase()===definition.code.toUpperCase())))throw Error('الكود أو الاسم محجوز لمنتج آخر تحت الاستكمال');
 return definition;
}
export function recordRecipeDefinition(state:StoreState,id:string,name:string,input:RecipeProductDefinition,actor:Actor):StoreState{
 const definition=checkDefinition(state,id,name,input),before=state.catalogNameDrafts.find(d=>d.id===id);
 const next:CatalogNameDraft=before?{...before,name:name.trim(),definition}:{id,name:name.trim(),origin:'manual',createdAt:new Date().toISOString(),definition};
 return validateStore({...state,catalogNameDrafts:[next,...state.catalogNameDrafts.filter(d=>d.id!==id)],auditLogs:[{id:crypto.randomUUID(),timestamp:new Date().toISOString(),partnerName:actor.name,actorId:actor.id,actionType:'تعديل وصفة/صنف',description:`تعريف منتج بانتظار وصفته: ${name.trim()}`},...state.auditLogs]});
}
export function validateRecipe(recipe:RecipeIngredient[],items:InventoryItem[],targetId?:string){
 if(!recipe.length)throw Error('أضف مكونات الوصفة قبل الاعتماد');
 const seen=new Set<string>();
 for(const line of recipe){
  const raw=items.find(i=>i.id===line.ingredientId);
  if(!raw||raw.category==='drink_recipe'||raw.id===targetId||seen.has(raw.id)||!Number.isFinite(line.quantity)||line.quantity<=0)throw Error('مكون مفقود أو مكرر أو كمية غير صالحة');
  seen.add(raw.id);
 }
 const cost=calculateRecipeTotalCost(recipe,items);if(!Number.isFinite(cost)||cost<0)throw Error('تكلفة الوصفة خارج حد الأرقام الصالحة');return cost;
}
export function activateRecipeDraft(state:StoreState,id:string,recipe:RecipeIngredient[],actor:Actor){
 const draft=state.catalogNameDrafts.find(d=>d.id===id);if(!draft?.definition)throw Error('تعريف المنتج لم يعد موجودًا؛ حدّث قسم الوصفات');
 const d=checkDefinition(state,id,draft.name,draft.definition),cost=validateRecipe(recipe,state.items);
 return completeCatalogNameDraft(state,id,{...d,name:draft.name,stock:d.openingStock,costPrice:cost,lastPurchasePrice:0,wholesalePrice:0,canSellDirectly:true,hasRecipe:true,recipe,recipeYield:1,costingVersion:d.category==='manufactured_blend'?2:undefined,supplierPrices:[]},actor);
}
export function updateCatalogRecipe(state:StoreState,original:InventoryItem,recipe:RecipeIngredient[],actor:Actor){
 const live=state.items.find(i=>i.id===original.id);
 if(!live||live.category!==original.category||live.baseUnit!==original.baseUnit||!equal(live.recipe,original.recipe))throw Error('تغيرت الوصفة أثناء التعديل؛ أعد فتحها وراجع المكونات');
 validateRecipe(recipe,state.items,live.id);
 const next=adjustCatalogItem(state,live.id,{hasRecipe:true,recipe},actor.name);
 return validateStore({...next,auditLogs:[{id:crypto.randomUUID(),timestamp:new Date().toISOString(),partnerName:actor.name,actorId:actor.id,actionType:'تعديل وصفة/صنف',description:`تحديث وصفة ${live.name} دون حركة مخزون`},...next.auditLogs]});
}
async function confirm(engine:StoreEngine){await engine.flush();if(engine.snapshot.status!=='ready')throw Error(engine.snapshot.error||'لم يصل تأكيد حفظ الوصفة');}
export async function saveRecipeDefinition(engine:StoreEngine,id:string,name:string,definition:RecipeProductDefinition,actor:Actor,original?:CatalogNameDraft){
 if(engine.hasPending)await confirm(engine);
 const current=engine.state.catalogNameDrafts.find(d=>d.id===id);
 if(current?.name===name.trim()&&equal(current.definition,definition))return;
 if(original&&!equal(current,original))throw Error('تغير تعريف المنتج أثناء التعديل؛ حدّث البيانات قبل الحفظ');
 engine.replace(recordRecipeDefinition(engine.state,id,name,definition,actor));await confirm(engine);
}
export async function saveRecipe(engine:StoreEngine,target:{draft:CatalogNameDraft}|{item:InventoryItem},recipe:RecipeIngredient[],actor:Actor){
 if(engine.hasPending){
  await confirm(engine);
  if('draft'in target){const d=target.draft;if(!engine.state.catalogNameDrafts.some(x=>x.id===d.id)&&engine.state.items.some(i=>i.code===d.definition?.code&&equal(i.recipe,recipe)))return;}
  else if(engine.state.items.some(i=>i.id===target.item.id&&equal(i.recipe,recipe)))return;
 }
 if('draft'in target){const live=engine.state.catalogNameDrafts.find(d=>d.id===target.draft.id);if(!equal(live,target.draft))throw Error('تغير تعريف المنتج؛ أعد فتح الوصفة');engine.replace(activateRecipeDraft(engine.state,live!.id,recipe,actor));}
 else engine.replace(updateCatalogRecipe(engine.state,target.item,recipe,actor));
 await confirm(engine);
}
