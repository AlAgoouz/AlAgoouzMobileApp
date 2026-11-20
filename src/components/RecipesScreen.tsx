import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,Pencil,Plus,Save} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {RecipeEditor} from './RecipeEditor';
import {RecordPickerField} from './RecordPickerField';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {requiresRecipe,categoryLabel} from '../lib/itemPolicy';
import {money} from '../lib/reporting';
import type {CatalogNameDraft,InventoryItem,RecipeIngredient,RecipeProductDefinition} from '../types/erp';
import './recipes.css';

export type RecipeTarget={draft:CatalogNameDraft}|{item:InventoryItem};
export function RecipesScreen({items,drafts,initialTargetId,canManage,onSave,onDefine,onBack}:{items:InventoryItem[];drafts:CatalogNameDraft[];initialTargetId?:string;canManage:boolean;onSave:(target:RecipeTarget,recipe:RecipeIngredient[])=>Promise<void>;onDefine:(id:string,name:string,definition:RecipeProductDefinition,original?:CatalogNameDraft)=>Promise<void>;onBack:()=>void}){
 const targets=useMemo(()=>[...drafts.filter(d=>d.definition).map(d=>({key:'draft:'+d.id,target:{draft:d} as RecipeTarget,name:d.name,category:d.definition!.category})),...items.filter(i=>requiresRecipe(i.category)).map(i=>({key:'item:'+i.id,target:{item:i} as RecipeTarget,name:i.name,category:i.category}))],[items,drafts]);
 const [selected,setSelected]=useState<{key:string;target:RecipeTarget}|null>(null),[recipe,setRecipe]=useState<RecipeIngredient[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[create,setCreate]=useState(false);
 const [recipeValid,setRecipeValid]=useState(true),[editingDefinition,setEditingDefinition]=useState<CatalogNameDraft|null>(null);
 const [definitionSavedId,setDefinitionSavedId]=useState<string>();
 const appliedInitial=useRef<string>(undefined);
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
 return (
  <div className="min-h-screen pb-24" dir="rtl">
   <OperationHeader title="الوصفات" description="تحديد مقادير المشروبات والتحويجات والتوليفات وحساب تكلفتها." icon={BookOpen} onBack={onBack}>
    {canManage&&<button type="button" onClick={()=>setCreate(true)} disabled={busy}><Plus size={17} aria-hidden="true"/>تعريف منتج بوصفة</button>}
   </OperationHeader>
   <div className="record-workspace recipe-workspace">
    {targets.length>0&&<div className="operation-surface recipe-selection">
     <RecordPickerField label="المنتج صاحب الوصفة" searchLabel="ابحث باسم المنتج أو الكود"
      options={targets.map(t=>({id:t.key,title:t.name,detail:categoryLabel(t.category)+('draft'in t.target?' · بانتظار الوصفة':''),keywords:'draft'in t.target?t.target.draft.definition?.code:t.target.item.code}))}
      value={selected?.key??''} disabled={busy} onChange={select}/>
    </div>}
    {!targets.length&&<p className="recipe-empty"><BookOpen size={20} aria-hidden="true"/>عرّف توليفة أو مشروبًا له وصفة أو تحويجة لاستكمال مكوناتها هنا.</p>}
    {target&&definition&&<section className="recipe-detail" aria-labelledby="recipe-product-name">
     <header className="operation-surface recipe-detail-heading">
      <div>
       <h2 id="recipe-product-name">{'draft'in target?target.draft.name:target.item.name}</h2>
       <p className="recipe-product-meta"><span className="recipe-category">{categoryLabel(definition.category)}</span><span>كود الكاشير <bdi>{definition.code}</bdi></span></p>
      </div>
      {'draft'in target&&canManage&&<button type="button" className="recipe-secondary" disabled={busy} onClick={()=>setEditingDefinition(target.draft)}><Pencil size={16} aria-hidden="true"/>تعديل بيانات المنتج قبل اعتماد وصفته</button>}
      {'draft'in target?<p className="recipe-message recipe-message-pending">بانتظار اعتماد الوصفة. يبدأ استخدام المنتج وإضافة رصيده الافتتاحي بعد الاعتماد.</p>:target.item.category==='manufactured_blend'&&<p className="recipe-message">متوسط تكلفة الرصيد الجاهز {money(target.item.costPrice)} ج.م / كجم. تكلفة الوصفة تخص الإنتاج الجديد.</p>}
     </header>
     <RecipeEditor key={selected!.key+definition.category+definition.baseUnit} items={items} category={definition.category} baseUnit={definition.baseUnit} targetId={'item'in target?target.item.id:undefined} value={recipe} onChange={next=>{setRecipe(next);setSaved(false);}} onValidityChange={setRecipeValid} disabled={busy} readOnly={!canManage}/>
     {canManage&&<footer className="operation-surface recipe-footer">
      <div>
       {error?<p role="alert" className="recipe-message recipe-message-error">{error}</p>:saved?<p role="status" className="recipe-message recipe-message-success">تم تأكيد حفظ الوصفة وتحديث تكلفتها دون تنفيذ إنتاج أو بيع.</p>:!recipeValid?<p role="status" className="recipe-message recipe-message-pending">راجع كمية المكون أو أكمل إضافته للقائمة قبل الحفظ.</p>:<p className="operation-caption">حفظ الوصفة لا يخصم من المخزون.</p>}
      </div>
      <button type="button" className="operation-primary" disabled={busy||!recipe.length||!recipeValid} onClick={()=>void save()}><Save size={17} aria-hidden="true"/>{busy?'جارٍ تأكيد الحفظ…':'draft'in target?'اعتماد الوصفة وتجهيز المنتج':'حفظ الوصفة وتحديث التكلفة'}</button>
     </footer>}
    </section>}
   </div>
   {(create||editingDefinition)&&<ItemDefinitionModal items={items} initialName={editingDefinition?.name} initialDefinition={editingDefinition?.definition} draftId={editingDefinition?.id} allowedCategories={['manufactured_blend','drink_recipe','seasoning_recipe']} reservedCodes={drafts.filter(d=>d.id!==editingDefinition?.id).flatMap(d=>d.definition?[d.definition.code]:[])} onSave={()=>false} onSaveRecipeDefinition={async(id,name,definition)=>{await onDefine(id,name,definition,editingDefinition??undefined);setDefinitionSavedId(id);setCreate(false);setEditingDefinition(null);}} onClose={()=>{setCreate(false);setEditingDefinition(null);}}/>}
  </div>
 );
}
