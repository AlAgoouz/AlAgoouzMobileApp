import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {RecipeEditor} from './RecipeEditor';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {requiresRecipe,categoryLabel} from '../lib/itemPolicy';
import {money} from '../lib/reporting';
import type {CatalogNameDraft,InventoryItem,RecipeIngredient,RecipeProductDefinition} from '../types/erp';

export type RecipeTarget={draft:CatalogNameDraft}|{item:InventoryItem};
export function RecipesScreen({items,drafts,initialTargetId,canManage,onSave,onDefine,onBack}:{items:InventoryItem[];drafts:CatalogNameDraft[];initialTargetId?:string;canManage:boolean;onSave:(target:RecipeTarget,recipe:RecipeIngredient[])=>Promise<void>;onDefine:(id:string,name:string,definition:RecipeProductDefinition,original?:CatalogNameDraft)=>Promise<void>;onBack:()=>void}){
 const targets=useMemo(()=>[...drafts.filter(d=>d.definition).map(d=>({key:'draft:'+d.id,target:{draft:d} as RecipeTarget,name:d.name,category:d.definition!.category})),...items.filter(i=>requiresRecipe(i.category)).map(i=>({key:'item:'+i.id,target:{item:i} as RecipeTarget,name:i.name,category:i.category}))],[items,drafts]);
 const [selected,setSelected]=useState<{key:string;target:RecipeTarget}|null>(null),[recipe,setRecipe]=useState<RecipeIngredient[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[create,setCreate]=useState(false);
 const [recipeValid,setRecipeValid]=useState(true),[editingDefinition,setEditingDefinition]=useState<CatalogNameDraft|null>(null);
 const [definitionSavedId,setDefinitionSavedId]=useState<string>();
 const appliedInitial=useRef<string>();
 const select=(key:string)=>{const found=targets.find(t=>t.key===key);setSelected(found?{key,target:found.target}:null);setRecipe(found&&'item'in found.target?structuredClone(found.target.item.recipe??[]):[]);setError('');setSaved(false);};
 useEffect(()=>{
  if(definitionSavedId){
   const found=targets.find(t=>t.key==='draft:'+definitionSavedId);
   if(found){
    if(selected?.key===found.key&&'draft'in selected.target&&'draft'in found.target){const before=selected.target.draft.definition!,after=found.target.draft.definition!;if(before.category!==after.category||before.baseUnit!==after.baseUnit)setRecipe([]);setSelected({key:found.key,target:found.target});}
    else select(found.key);
    appliedInitial.current=found.key;setDefinitionSavedId(undefined);return;
   }
  }
  if(initialTargetId!==appliedInitial.current&&targets.some(t=>t.key===initialTargetId)){appliedInitial.current=initialTargetId;select(initialTargetId!);return;}
  if(selected&&targets.some(t=>t.key===selected.key))return;
  const completedCode=selected&&'draft'in selected.target?selected.target.draft.definition?.code:undefined;
  const activated=completedCode?targets.find(t=>'item'in t.target&&t.target.item.code===completedCode):undefined;
  const first=activated??targets.find(t=>t.key===initialTargetId)??targets[0];
  if(first)select(first.key);else if(selected)setSelected(null);
 },[targets,selected?.key,initialTargetId,definitionSavedId]);
 const target=selected?.target,definition=target?('draft'in target?target.draft.definition!:target.item):null;
 const save=async()=>{if(!target||busy||!canManage||!recipeValid)return;setBusy(true);setError('');setSaved(false);try{await onSave(target,recipe);if('item'in target)setSelected(current=>current?.key===selected?.key?{...current,target:{item:{...target.item,recipe:structuredClone(recipe)}}}:current);setSaved(true);}catch(e){setError(e instanceof Error?e.message:'لم يتأكد حفظ الوصفة');}finally{setBusy(false);}};
 return <main className="min-h-screen pb-24" dir="rtl"><OperationHeader title={<>الوصفات</>} description={<>تحديد المقادير وحساب تكلفة المشروبات والتحويجات والتوليفات.</>} icon={BookOpen} onBack={onBack}>{canManage&&<button className="record-action" onClick={()=>setCreate(true)}>تعريف منتج بوصفة</button>}</OperationHeader><div className="p-4 space-y-4">
  <p className="operation-note">الوصفات لا تنفذ إنتاجًا أو بيعًا. المشروبات والتحويجات تستهلك مكوناتها عند البيع، والتوليفات تُنتج من قسم إنتاج التوليفات.</p>
  <label className="block">المنتج صاحب الوصفة<select className="operation-input" value={selected?.key??''} disabled={busy} onChange={e=>select(e.target.value)}><option value="">اختر منتجًا</option>{targets.map(t=><option key={t.key} value={t.key}>{t.name} — {categoryLabel(t.category)}{'draft'in t.target?' — بانتظار الوصفة':''}</option>)}</select></label>
  {!targets.length&&<p className="record-state">عرّف منتجًا من نوع توليفة أو مشروب له وصفة أو تحويجة؛ سيظهر هنا لاستكمال مكوناته.</p>}
  {target&&definition&&<section className="visual-card space-y-4"><h2 className="text-xl font-bold">{'draft'in target?target.draft.name:target.item.name}</h2><p>كود الكاشير: {definition.code} · {categoryLabel(definition.category)}</p>{'draft'in target?<p className="record-state">البيانات محفوظة تحت الاستكمال. اعتماد وصفة صحيحة يجهّز المنتج للاستخدام؛ الرصيد الافتتاحي المخطط لا يدخل المخزون قبل ذلك.</p>:target.item.category==='manufactured_blend'&&<p className="operation-note">متوسط تكلفة الرصيد الجاهز: {money(target.item.costPrice)} ج.م / كجم. تكلفة الوصفة أدناه مرجع للإنتاج الجديد، وحفظ المقادير لا يعيد تسعير الرصيد أو المستندات السابقة.</p>}
   {'draft'in target&&canManage&&<button className="record-action" disabled={busy} onClick={()=>setEditingDefinition(target.draft)}>تعديل بيانات المنتج قبل اعتماد وصفته</button>}
   <RecipeEditor key={selected!.key+definition.category+definition.baseUnit} items={items} category={definition.category} baseUnit={definition.baseUnit} targetId={'item'in target?target.item.id:undefined} value={recipe} onChange={next=>{setRecipe(next);setSaved(false);}} onValidityChange={setRecipeValid} disabled={busy||!canManage}/>
   {error&&<p role="alert">{error}</p>}{saved&&<p role="status">تم تأكيد حفظ الوصفة وتحديث تكلفتها دون تنفيذ إنتاج أو بيع.</p>}{!recipeValid&&<p role="status">راجع كمية المكون أو أكمل إضافته للقائمة قبل الحفظ.</p>}{canManage&&<button type="button" className="record-action" disabled={busy||!recipe.length||!recipeValid} onClick={()=>void save()}>{busy?'جارٍ تأكيد الحفظ…':'draft'in target?'اعتماد الوصفة وتجهيز المنتج':'حفظ الوصفة وتحديث التكلفة'}</button>}
  </section>}
 </div>{(create||editingDefinition)&&<ItemDefinitionModal items={items} initialName={editingDefinition?.name} initialDefinition={editingDefinition?.definition} draftId={editingDefinition?.id} allowedCategories={['manufactured_blend','drink_recipe','seasoning_recipe']} reservedCodes={drafts.filter(d=>d.id!==editingDefinition?.id).flatMap(d=>d.definition?[d.definition.code]:[])} onSave={()=>false} onSaveRecipeDefinition={async(id,name,definition)=>{await onDefine(id,name,definition,editingDefinition??undefined);setDefinitionSavedId(id);setCreate(false);setEditingDefinition(null);}} onClose={()=>{setCreate(false);setEditingDefinition(null);}}/>}</main>;
}
