import {Modal} from './Modal';
import React,{useState} from 'react';
import type {InventoryItem,ItemCategory,RecipeIngredient,UnitType} from '../types/erp';
import {itemCategories,requiresRecipe,isRecipeOnUse} from '../lib/itemPolicy';
import {calculateRecipeTotalCost} from '../lib/itemCosts';
import {quantityUnits,unitLabel} from '../lib/units';
import {nextItemCode} from '../lib/operationChecks';

export function ItemDefinitionModal({items,onSave,onClose,allowedCategories,initialName='',requireDetails=false}: {
 items:InventoryItem[]; onSave:(item:Omit<InventoryItem,'id'>)=>void|boolean|Promise<void|boolean>;
 onClose:()=>void; allowedCategories?:ItemCategory[];initialName?:string;requireDetails?:boolean;
}){
 const options=itemCategories.filter(c=>!allowedCategories||allowedCategories.includes(c.id));
 const [category,setCategory]=useState<ItemCategory|''>(requireDetails?'':options[0]?.id??'raw_bean');
 const [name,setName]=useState(initialName),[code,setCode]=useState(''),[saving,setSaving]=useState(false);
 const [baseUnit,setBaseUnit]=useState<InventoryItem['baseUnit']|''>(requireDetails?'':'kg');
 const [stock,setStock]=useState(requireDetails?'':'0'),[minimum,setMinimum]=useState(requireDetails?'':'0');
 const [cost,setCost]=useState(requireDetails?'':'0'),[retail,setRetail]=useState(requireDetails?'':'0');
 const [recipe,setRecipe]=useState<RecipeIngredient[]>([]),[error,setError]=useState('');
 const [ingredientId,setIngredientId]=useState(''),[quantity,setQuantity]=useState('');
 const [unit,setUnit]=useState<UnitType>('gram');
 const needsRecipe=!!category&&requiresRecipe(category);
 const onUse=!!category&&isRecipeOnUse({category});
 const actualUnit=category==='drink_recipe'?'piece':category==='manufactured_blend'?'kg':baseUnit;
 const available=items.filter(i=>i.category!=='drink_recipe');
 const ingredient=available.find(i=>i.id===ingredientId);
 const units=quantityUnits(ingredient?.baseUnit??'kg');
 const inputClass='w-full border rounded-xl px-3 py-2 bg-white';
 const addIngredient=()=>{
  if(!ingredient||!quantity.trim()||!Number.isFinite(Number(quantity))||Number(quantity)<=0||!units.includes(unit)){setError('اختر المكون والكمية ووحدتها الصحيحة');return;}
  if(recipe.some(i=>i.ingredientId===ingredientId)){setError('المكون موجود؛ احذفه لإعادة تحديد مقداره');return;}
  setRecipe([...recipe,{ingredientId,ingredientName:ingredient.name,quantity:Number(quantity),unit}]);setQuantity('');setError('');
 };
 const save=async()=>{
  if(saving)return;
  try{
   if(!name.trim())throw Error('اسم الصنف مطلوب');
   if(!category||!actualUnit)throw Error('اختر نوع الصنف ووحدته الأساسية');
   if(![retail,...(!onUse?[stock,minimum]:[]),...(!needsRecipe?[cost]:[])].every(v=>v.trim()&&Number.isFinite(Number(v))&&Number(v)>=0))throw Error('أكمل الأرقام بقيم صحيحة غير سالبة؛ أدخل صفرًا فقط عند تأكيده');
   if(needsRecipe&&!recipe.length)throw Error('حدد مكونات الوصفة قبل حفظ الصنف');
   const finalCode=code.trim()||nextItemCode(items,'IT',1);
   if(items.some(i=>i.code.trim().toUpperCase()===finalCode.toUpperCase()))throw Error('كود الصنف مستخدم');
   const costPrice=needsRecipe?calculateRecipeTotalCost(recipe,items):Number(cost);
   setSaving(true);
   const accepted=await onSave({code:finalCode,name:name.trim(),category,baseUnit:actualUnit,stock:onUse?0:Number(stock),openingStock:onUse?0:Number(stock),minStock:onUse?0:Number(minimum),costPrice,costingVersion:category==='manufactured_blend'?2:undefined,lastPurchasePrice:needsRecipe?0:costPrice,retailPrice:Number(retail),wholesalePrice:0,canSellDirectly:true,hasRecipe:needsRecipe,recipe:needsRecipe?recipe:[],recipeYield:needsRecipe?1:undefined,supplierPrices:[]});
   if(accepted===false)throw Error('لم يتم حفظ الصنف؛ راجع البيانات والتنبيه');
   onClose();
  }catch(e){setError((e as Error).message);}finally{setSaving(false);}
 };
 return <Modal title={requireDetails?"استكمال الصنف المستورد":"تعريف صنف جديد"} busy={saving} onClose={onClose} footer={<div className="flex gap-3"><button disabled={saving} onClick={()=>void save()} className="bg-[#1E1612] text-white rounded-xl px-4 py-2">حفظ الصنف والوصفة</button><button disabled={saving} onClick={onClose} className="border rounded-xl px-4 py-2">إلغاء</button></div>}><fieldset disabled={saving} className="space-y-4"><label className="block">نوع الصنف<select className={inputClass} value={category} onChange={e=>{const kind=e.target.value as ItemCategory;setCategory(kind);setBaseUnit(requireDetails&&!['manufactured_blend','drink_recipe'].includes(kind)?'':['raw_bean','manufactured_blend','seasoning_recipe'].includes(kind)?'kg':'piece');setRecipe([]);}}>{requireDetails&&<option value="">اختر نوع الصنف</option>}{options.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
<label className="block">اسم الصنف<input className={inputClass} value={name} onChange={e=>setName(e.target.value)}/></label>
<label className="block">كود الصنف (اختياري)<input className={inputClass} value={code} onChange={e=>setCode(e.target.value)}/></label>
{category!=='drink_recipe'&&category!=='manufactured_blend'&&<label className="block">الوحدة الأساسية<select className={inputClass} value={baseUnit} onChange={e=>setBaseUnit(e.target.value as InventoryItem['baseUnit'])}>{requireDetails&&<option value="">اختر الوحدة</option>}<option value="kg">كيلو</option><option value="piece">قطعة</option><option value="count">عدد</option><option value="liter">لتر</option></select></label>}
{needsRecipe&&<fieldset className="border rounded-xl p-3 space-y-2"><legend>مكونات {category==='manufactured_blend'?'إنتاج كيلو من التوليفة':category==='drink_recipe'?'المشروب الواحد':`وحدة التحويجة (${actualUnit?unitLabel(actualUnit):'اختر الوحدة'})`}</legend>
    <p className="text-sm">{category==='manufactured_blend'?'تُخصم عند الإنتاج، ثم يباع رصيد التوليفة الجاهز.':'تُخصم المكونات عند الاستخدام أو البيع، دون عملية إنتاج.'}</p>
    <label className="block">المكون<select className={inputClass} value={ingredientId} onChange={e=>{setIngredientId(e.target.value);const raw=items.find(i=>i.id===e.target.value);setUnit(quantityUnits(raw?.baseUnit??'kg')[0]);}}><option value="">اختر مكونًا</option>{available.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
    <label className="block">كمية المكون<input className={inputClass} type="number" min="0" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
    <label className="block">وحدة المكون<select className={inputClass} value={unit} onChange={e=>setUnit(e.target.value as UnitType)}>{units.map(u=><option key={u} value={u}>{unitLabel(u)}</option>)}</select></label>
    <button type="button" onClick={addIngredient} className="border rounded-xl p-2">إضافة المكون</button>
    {recipe.map(i=><div key={i.ingredientId} className="flex justify-between gap-2"><span>{i.ingredientName}: {i.quantity} {unitLabel(i.unit)}</span><button aria-label={`حذف مكون ${i.ingredientName}`} onClick={()=>setRecipe(recipe.filter(r=>r.ingredientId!==i.ingredientId))}>حذف</button></div>)}
   </fieldset>}
{!onUse&&<><label className="block">الرصيد الافتتاحي<input className={inputClass} type="number" min="0" step="any" value={stock} onChange={e=>setStock(e.target.value)}/></label><label className="block">حد النواقص<input className={inputClass} type="number" min="0" step="any" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label></>}
{!needsRecipe&&<label className="block">تكلفة الوحدة قبل الضريبة<input className={inputClass} type="number" min="0" step="any" value={cost} onChange={e=>setCost(e.target.value)}/></label>}
<label className="block">سعر البيع المباشر<input className={inputClass} type="number" min="0" step="any" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
{category==='manufactured_blend'&&<p className="text-sm">سعر الجملة يُكتب يدويًا في كل فاتورة.</p>}
{error&&<p role="alert" className="text-red-700">{error}</p>}</fieldset></Modal>;
}
