import React,{useState} from 'react';
import {Pencil,Trash2,ChevronDown} from 'lucide-react';
import type {InventoryItem} from '../types/erp';
import {categoryLabel,isRecipeOnUse,requiresRecipe} from '../lib/itemPolicy';
import {money} from '../lib/reporting';
import {unitLabel} from '../lib/units';
const quantity=new Intl.NumberFormat('ar-EG',{maximumFractionDigits:6});
export function CatalogProductRows({items,canManage,onEdit,onDelete,onRecipe}:{items:readonly InventoryItem[];canManage:boolean;onEdit:(item:InventoryItem)=>void;onDelete:(item:InventoryItem)=>void;onRecipe:()=>void}){
 const [expanded,setExpanded]=useState<string|null>(null);
 return <ul className="catalog-register" aria-label="سجل المنتجات الجاهزة">{items.map(item=>{
  const unit=item.category==='drink_recipe'?'كوب':unitLabel(item.baseUnit),profit=item.retailPrice-item.costPrice,open=expanded===item.id,detailsId='catalog-details-'+encodeURIComponent(item.id);
  return <li key={item.id} className="catalog-register-row"><div className="catalog-register-identity"><h3>{item.name}</h3><div className="catalog-register-meta"><span>{item.code}</span><span>{categoryLabel(item.category)}</span>{item.roastLevel&&item.roastLevel!=='بدون'&&<span>{item.roastLevel}</span>}</div></div>
   <dl className="catalog-register-facts"><div><dt>الرصيد</dt><dd>{isRecipeOnUse(item)?'حسب الوصفة':quantity.format(item.stock)+' '+unit}</dd></div><div><dt>التكلفة / {unit}</dt><dd>{money(item.costPrice)} ج.م</dd></div><div><dt>البيع / {unit}</dt><dd>{money(item.retailPrice)} ج.م</dd></div></dl>
   <div className="catalog-register-actions"><button aria-expanded={open} aria-controls={detailsId} onClick={()=>setExpanded(open?null:item.id)}><ChevronDown size={15} aria-hidden="true"/>تفاصيل</button>{canManage&&<><button aria-label={`تعديل المنتج ${item.name}`} onClick={()=>onEdit(item)}><Pencil size={15} aria-hidden="true"/>تعديل</button><button className="catalog-remove" aria-label={`حذف المنتج ${item.name}`} onClick={()=>onDelete(item)}><Trash2 size={15} aria-hidden="true"/>حذف</button></>}</div>
   {open&&<div id={detailsId} className="catalog-register-details"><dl><div><dt>آخر سعر شراء</dt><dd>{money(item.lastPurchasePrice)} ج.م / {unit}</dd></div><div><dt>حد تنبيه المخزون</dt><dd>{isRecipeOnUse(item)?'حسب الوصفة':quantity.format(item.minStock)+' '+unit}</dd></div><div><dt>ربح الوحدة الإرشادي</dt><dd>{money(profit)} ج.م</dd></div><div><dt>هامش الربح الإرشادي</dt><dd>{item.retailPrice>0?money(profit/item.retailPrice*100)+'%':'غير متاح'}</dd></div></dl>{item.baseUnit==='kg'&&<p>أسعار الأوزان حسب سعر الكيلو: 100 جم: {money(item.retailPrice/10)} ج.م · 125 جم: {money(item.retailPrice/8)} ج.م · 250 جم: {money(item.retailPrice/4)} ج.م</p>}{requiresRecipe(item.category)&&<button onClick={onRecipe}>فتح الوصفة ({item.recipe?.length??0} مكونات)</button>}{item.category==='manufactured_blend'&&<p>سعر الجملة يُحدد داخل كل فاتورة.</p>}</div>}
  </li>;
 })}</ul>;
}
