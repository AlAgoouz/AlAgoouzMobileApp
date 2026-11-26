import { useEffect, useId, useMemo, useState } from 'react';
import {Package,Plus,Trash2} from 'lucide-react';
import type {InventoryItem,ItemCategory,RecipeIngredient,UnitType} from '../types/erp';
import {quantityUnits,unitLabel} from '../lib/units';
import {calculateRecipeTotalCost,getIngredientCostContribution,convertToBaseUnit} from '../lib/itemCosts';
import {parseDecimalInput} from '../lib/cashierRows';
import {RecordPickerField} from './RecordPickerField';
import {Money} from './Money';

export function RecipeEditor({items,category,baseUnit,targetId,value,onChange,disabled=false,readOnly=false,onValidityChange}:{items:InventoryItem[];category:ItemCategory;baseUnit:InventoryItem['baseUnit'];targetId?:string;value:RecipeIngredient[];onChange:(recipe:RecipeIngredient[])=>void;disabled?:boolean;readOnly?:boolean;onValidityChange?:(valid:boolean)=>void}){
 const [ingredientId,setIngredientId]=useState(''),[quantity,setQuantity]=useState(''),[unit,setUnit]=useState<UnitType>('gram');
 const [error,setError]=useState<{message:string;location:'add'|'edit'}>();
 const [quantityDrafts,setQuantityDrafts]=useState<Record<string,string>>({});
 const headingId=useId();
 const invalidQuantity=(quantity:string|number)=>{const q=parseDecimalInput(quantity);return q===undefined||q<=0;};
 const invalidQuantities=value.some(line=>invalidQuantity(quantityDrafts[line.ingredientId]??line.quantity));
 const validInputs=!invalidQuantities&&!ingredientId&&!quantity.trim();
 useEffect(()=>onValidityChange?.(validInputs),[validInputs,onValidityChange]);
 const available=useMemo(()=>items.filter(i=>i.category!=='drink_recipe'&&i.id!==targetId),[items,targetId]);
 const raw=available.find(i=>i.id===ingredientId),units=quantityUnits(raw?.baseUnit??'kg');
 const basis=category==='drink_recipe'?'كوب واحد':category==='manufactured_blend'?'كيلو واحد من التوليفة':`1 ${unitLabel(baseUnit)} من التحويجة`;
 const total=useMemo(()=>{try{const cost=value.length&&!invalidQuantities?calculateRecipeTotalCost(value,items):null;return cost!==null&&Number.isFinite(cost)?cost:null;}catch{return null;}},[value,items,invalidQuantities]);
 const change=(id:string,q:string,u:UnitType,location:'add'|'edit'='edit')=>{
  const amount=parseDecimalInput(q);
  const item=available.find(i=>i.id===id);
  if(!item){setError({message:'اختر مكونًا موجودًا بالمخزن',location});return;}
  if(amount===undefined||amount<=0){setError({message:'كمية المكون يجب أن تكون أكبر من صفر',location});return;}
  try{convertToBaseUnit(amount,u,item.baseUnit);}catch{setError({message:'وحدة الكمية لا تطابق وحدة المكون',location});return;}
  setError(undefined);
  return {ingredientId:id,ingredientName:item.name,quantity:amount,unit:u};
 };
 const add=()=>{const line=change(ingredientId,quantity,unit,'add');if(!line)return;if(value.some(i=>i.ingredientId===ingredientId)){setError({message:'المكون موجود بالفعل؛ عدّل كميته من القائمة',location:'add'});return;}onChange([...value,line]);setIngredientId('');setQuantity('');};
 return (
  <section className="recipe-editor" aria-label="مكونات الوصفة وحساب التكلفة">
   <div className="recipe-cost">
    <span>تكلفة الوصفة لكل {basis}</span>
    <output aria-label="إجمالي تكلفة الوصفة">{total===null?'غير محددة':<Money value={total}/>}</output>
   </div>
   <section className="recipe-ingredients" aria-labelledby={headingId}>
    <header className="recipe-ingredients-heading">
     <h3 id={headingId}>المقادير لكل {basis}</h3>
     <p className="operation-caption">{category==='manufactured_blend'?'تُخصم المكونات عند إنتاج التوليفة.':'تُخصم المكونات عند البيع أو الاستخدام، ولا تدخل أوامر الإنتاج.'}</p>
     {error?.location==='edit'&&<p role="alert" className="recipe-message recipe-message-error">{error.message}</p>}
    </header>
    {value.length>0 ? <ul className="recipe-ingredient-list" role="list">
     {value.map(line=>{
      const source=items.find(item=>item.id===line.ingredientId);
      const displayedQuantity=quantityDrafts[line.ingredientId]??String(line.quantity);
      const quantityInvalid=invalidQuantity(displayedQuantity);
      let contribution:number|null=null;
      try { if(!quantityInvalid) contribution=getIngredientCostContribution(line,items); } catch {}
      return (
       <li key={line.ingredientId}>
        <article className="record-card recipe-ingredient">
         <div className="recipe-ingredient-name">
          <h4>{source?.name??line.ingredientName}</h4>
          <p>{source?<><Money value={source.costPrice}/> / {unitLabel(source.baseUnit)}</>:'المكون غير موجود في المخزون'}</p>
         </div>
         <div className="recipe-ingredient-fields">
          <label>الكمية<input className="operation-input" aria-label={`كمية ${line.ingredientName}`} aria-invalid={quantityInvalid} disabled={disabled||readOnly} inputMode="decimal" value={displayedQuantity} onChange={event=>{
           const text=event.target.value;
           setQuantityDrafts(previous=>({...previous,[line.ingredientId]:text}));
           const next=change(line.ingredientId,text,line.unit);
           if(next)onChange(value.map(current=>current.ingredientId===line.ingredientId?next:current));
          }}/></label>
          <label>الوحدة<select className="operation-input" aria-label={`وحدة ${line.ingredientName}`} value={line.unit} disabled={disabled||readOnly} onChange={event=>{
           const next=change(line.ingredientId,String(line.quantity),event.target.value as UnitType);
           if(next)onChange(value.map(current=>current.ingredientId===line.ingredientId?next:current));
          }}>{quantityUnits(source?.baseUnit??'kg').map(unit=><option value={unit} key={unit}>{unitLabel(unit)}</option>)}</select></label>
         </div>
         <dl className="recipe-ingredient-cost">
          <div><dt>تكلفة المكون</dt><dd>{contribution===null?'غير متاحة':<Money value={contribution}/>}</dd></div>
         </dl>
         {!readOnly&&<button type="button" className="recipe-remove" disabled={disabled} aria-label={`حذف مكون ${line.ingredientName}`} onClick={()=>{
          setQuantityDrafts(previous=>{const next={...previous};delete next[line.ingredientId];return next;});
          setError(undefined);
          onChange(value.filter(current=>current.ingredientId!==line.ingredientId));
         }}><Trash2 size={17} aria-hidden="true"/></button>}
        </article>
       </li>
      );
     })}
    </ul> : <p className="recipe-empty"><Package size={20} aria-hidden="true"/>لم تُحدد مكونات الوصفة بعد.</p>}
   </section>
   {!readOnly&&<fieldset className="recipe-add" disabled={disabled}>
    <legend>إضافة مكون</legend>
    <div className="recipe-add-fields">
     <RecordPickerField label="المكون" searchLabel="ابحث باسم المكون أو الكود" value={ingredientId}
      options={available.map(item=>({id:item.id,title:item.name,detail:item.code}))}
      onChange={id=>{setIngredientId(id);setUnit(quantityUnits(available.find(item=>item.id===id)?.baseUnit??'kg')[0]);setError(undefined);}}/>
     <div className="recipe-ingredient-fields">
      <label>كمية المكون<input inputMode="decimal" className="operation-input" value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
      <label>وحدة المكون<select className="operation-input" value={unit} onChange={event=>setUnit(event.target.value as UnitType)}>{units.map(unit=><option value={unit} key={unit}>{unitLabel(unit)}</option>)}</select></label>
     </div>
     {raw&&<p className="operation-caption">تكلفة المخزون: <Money value={raw.costPrice}/> / {unitLabel(raw.baseUnit)}</p>}
     {error?.location==='add'&&<p role="alert" className="recipe-message recipe-message-error">{error.message}</p>}
     <button type="button" className="recipe-secondary" onClick={add} disabled={!available.length}><Plus size={16} aria-hidden="true"/>إضافة المكون</button>
     {!available.length&&<p className="operation-caption">عرّف الخامات والمستلزمات من قسم المنتجات لتظهر هنا.</p>}
    </div>
   </fieldset>}
  </section>
 );
}
