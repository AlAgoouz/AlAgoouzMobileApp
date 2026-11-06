import {Modal} from './Modal';
import React,{useRef,useState} from 'react';
import type {InventoryItem,ItemCategory,RecipeProductDefinition} from '../types/erp';
import {itemCategories,requiresRecipe,isRecipeOnUse} from '../lib/itemPolicy';
import {nextItemCode} from '../lib/operationChecks';

export function ItemDefinitionModal({items,onSave,onClose,allowedCategories,initialName='',requireDetails=false,reservedCodes=[],draftId,onSaveRecipeDefinition,initialDefinition}:{
 items:InventoryItem[];onSave:(item:Omit<InventoryItem,'id'>)=>void|boolean|Promise<void|boolean>;onClose:()=>void;allowedCategories?:ItemCategory[];initialName?:string;requireDetails?:boolean;reservedCodes?:string[];draftId?:string;
 onSaveRecipeDefinition?:(id:string,name:string,definition:RecipeProductDefinition)=>Promise<void>;initialDefinition?:RecipeProductDefinition;
}){
 const options=itemCategories.filter(c=>!allowedCategories||allowedCategories.includes(c.id));
 const [category,setCategory]=useState<ItemCategory|''>(initialDefinition?.category??(requireDetails?'':options[0]?.id??'raw_bean'));
 const [name,setName]=useState(initialName),[code,setCode]=useState(initialDefinition?.code??''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const [baseUnit,setBaseUnit]=useState<InventoryItem['baseUnit']|''>(initialDefinition?.baseUnit??(requireDetails?'':'kg'));
 const [stock,setStock]=useState(initialDefinition?String(initialDefinition.openingStock):requireDetails?'':'0'),[minimum,setMinimum]=useState(initialDefinition?String(initialDefinition.minStock):requireDetails?'':'0'),[cost,setCost]=useState(requireDetails?'':'0'),[retail,setRetail]=useState(initialDefinition?String(initialDefinition.retailPrice):requireDetails?'':'0');
 const newDraftId=useRef(crypto.randomUUID());
 const submittedCode=useRef<string>();
 const needsRecipe=!!category&&requiresRecipe(category),onUse=!!category&&isRecipeOnUse({category});
 const actualUnit=category==='drink_recipe'?'piece':category==='manufactured_blend'?'kg':baseUnit;
 const inputClass='operation-input';
 const save=async()=>{
  if(saving)return;setError('');
  try{
   if(!name.trim())throw Error('اسم الصنف مطلوب');
   if(!category||!actualUnit)throw Error('اختر نوع الصنف ووحدته الأساسية');
   if(![retail,...(!onUse?[stock,minimum]:[]),...(!needsRecipe?[cost]:[])].every(v=>v.trim()&&Number.isFinite(Number(v))&&Number(v)>=0))throw Error('أكمل الأرقام بقيم صحيحة غير سالبة؛ أدخل صفرًا فقط عند تأكيده');
   const finalCode=code.trim()||nextItemCode([...items,...reservedCodes.map(code=>({code}))],'IT',1);
   if(items.some(i=>i.code.trim().toUpperCase()===finalCode.toUpperCase())||submittedCode.current!==finalCode&&reservedCodes.some(c=>c.toUpperCase()===finalCode.toUpperCase()))throw Error('كود الصنف مستخدم أو محجوز لمنتج تحت الاستكمال');
   setCode(finalCode);setSaving(true);
   if(needsRecipe){
    if(!onSaveRecipeDefinition)throw Error('عرّف المنتج من قسم المنتجات ثم أكمل مكونات الوصفة من قسم الوصفات');
    submittedCode.current=finalCode;
    await onSaveRecipeDefinition(draftId??newDraftId.current,name.trim(),{code:finalCode,category:category as RecipeProductDefinition['category'],baseUnit:actualUnit,retailPrice:Number(retail),openingStock:onUse?0:Number(stock),minStock:onUse?0:Number(minimum)});
   }else{
    const costPrice=Number(cost),accepted=await onSave({code:finalCode,name:name.trim(),category,baseUnit:actualUnit,stock:Number(stock),openingStock:Number(stock),minStock:Number(minimum),costPrice,lastPurchasePrice:costPrice,retailPrice:Number(retail),wholesalePrice:0,canSellDirectly:true,hasRecipe:false,recipe:[],supplierPrices:[]});
    if(accepted===false)throw Error('لم يتم حفظ الصنف؛ راجع البيانات والتنبيه');
   }
   onClose();
  }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ تعريف المنتج');}finally{setSaving(false);}
 };
 return <Modal title={requireDetails?'استكمال بيانات المنتج':'تعريف منتج جديد'} description="حدد النوع والكود والأسعار. المنتجات التي لها وصفة تنتقل إلى قسم الوصفات لاستكمال المقادير وحساب التكلفة." busy={saving} onClose={onClose} footer={<div className="record-actions"><button disabled={saving} className="record-action" onClick={()=>void save()}>{saving?'جارٍ تأكيد الحفظ…':needsRecipe?'حفظ والانتقال إلى الوصفات':'حفظ الصنف'}</button><button disabled={saving} onClick={onClose}>إلغاء</button></div>}><fieldset disabled={saving} className="space-y-4">
  <label className="block">نوع الصنف<select className={inputClass} value={category} onChange={e=>{const kind=e.target.value as ItemCategory;setCategory(kind);setBaseUnit(requireDetails&&!['manufactured_blend','drink_recipe'].includes(kind)?'':['raw_bean','manufactured_blend','seasoning_recipe'].includes(kind)?'kg':'piece');setError('');}}>{requireDetails&&<option value="">اختر نوع الصنف</option>}{options.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
  <label className="block">اسم الصنف<input className={inputClass} value={name} onChange={e=>setName(e.target.value)}/></label>
  <label className="block">كود الصنف (اختياري)<input className={inputClass} value={code} onChange={e=>setCode(e.target.value)}/></label>
  {category!=='drink_recipe'&&category!=='manufactured_blend'&&<label className="block">الوحدة الأساسية<select className={inputClass} value={baseUnit} onChange={e=>setBaseUnit(e.target.value as InventoryItem['baseUnit'])}>{requireDetails&&<option value="">اختر الوحدة</option>}<option value="kg">كيلو</option><option value="piece">قطعة</option><option value="count">عدد</option><option value="liter">لتر</option></select></label>}
  {needsRecipe&&<p className="record-state">{category==='drink_recipe'?'وصفة لكل كوب؛ مكوناتها تُخصم عند البيع، دون إنتاج.':category==='manufactured_blend'?'وصفة لكل كيلو توليفة؛ مكوناتها تُخصم عند تنفيذ الإنتاج.':'وصفة لكل وحدة تحويجة؛ تُخصم المكونات عند استخدامها أو بيعها.'} ستُدخل المكونات وتحسب تكلفتها في قسم الوصفات، ويظل المنتج غير جاهز للاستخدام حتى اعتمادها.</p>}
  {!onUse&&<><label className="block">الرصيد الافتتاحي<input className={inputClass} type="number" min="0" step="any" value={stock} onChange={e=>setStock(e.target.value)}/></label><label className="block">حد النواقص<input className={inputClass} type="number" min="0" step="any" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label></>}
  {!needsRecipe&&<label className="block">تكلفة الوحدة قبل الضريبة<input className={inputClass} type="number" min="0" step="any" value={cost} onChange={e=>setCost(e.target.value)}/></label>}
  <label className="block">سعر البيع المباشر<input className={inputClass} type="number" min="0" step="any" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
  {category==='manufactured_blend'&&<p className="operation-note">سعر الجملة يُكتب يدويًا في كل فاتورة. الرصيد الافتتاحي يُضاف عند استكمال الوصفة فقط.</p>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
 </fieldset></Modal>;
}
