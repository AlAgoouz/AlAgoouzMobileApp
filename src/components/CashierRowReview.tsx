import React,{useMemo,useState} from 'react';
import type {InventoryItem} from '../types/erp';
import type {CashierReview} from '../lib/cashierRows';
const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]/gu,'');
export function CashierRowReview({index,choice,items,suggestions,busy,onChange}:{index:number;choice?:CashierReview[number];items:InventoryItem[];suggestions:{itemId:string;name:string;code:string;score:number}[];busy:boolean;onChange:(change:Partial<CashierReview[number]>)=>void}){
 const [query,setQuery]=useState('');
 const options=useMemo(()=>{
  const q=normalize(query),found=q?items.filter(item=>normalize(item.name+' '+item.code).includes(q)).slice(0,30):[...suggestions.map(s=>items.find(item=>item.id===s.itemId)).filter((item):item is InventoryItem=>!!item),...items.slice(0,30)];
  const selected=items.find(item=>item.id===choice?.itemId);return [...new Map([...(selected?[selected]:[]),...found].map(item=>[item.id,item])).values()].slice(0,31);
 },[items,suggestions,query,choice?.itemId]);
 return <div className="space-y-2"><p>{suggestions.length?'اقتراحات تحتاج تأكيدك: '+suggestions.map(s=>`${s.name} (${s.score}%)`).join(' — '):'اختر الصنف الصحيح من الكتالوج.'}</p>
  <label>بحث لصنف الصف {index+1}<input className="operation-input" maxLength={150} disabled={busy} value={query} onChange={e=>setQuery(e.target.value)} placeholder="اسم الصنف أو الكود"/></label>
  <label>مطابقة الصف {index+1}<select disabled={busy} className="operation-input" value={choice?.itemId??''} onChange={e=>onChange({itemId:e.target.value,unit:''})}><option value="">اختر الصنف لتأكيد المطابقة</option>{options.map(item=><option value={item.id} key={item.id}>{item.name} — {item.code}</option>)}</select></label>
  <p className="text-xs">معروض حتى 30 نتيجة؛ اكتب الاسم أو الكود للوصول لباقي الأصناف.</p>
  <label>وحدة الصف {index+1}<select disabled={busy} className="operation-input" value={choice?.unit??''} onChange={e=>onChange({unit:e.target.value as CashierReview[number]['unit']})}><option value="">اختر وحدة الكمية الموجودة بالملف</option>{[['kg','كيلو'],['gram','جرام'],['piece','قطعة / كوب'],['liter','لتر'],['ml','مل']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 </div>;
}
