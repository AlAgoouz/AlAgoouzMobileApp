import {unitLabel as displayUnit} from '../lib/units';
import React,{useEffect,useState} from 'react';
import {Search,ChevronLeft} from 'lucide-react';
import {itemResultsSchema,readRpc,type ItemSearchResult} from '../lib/readModels';
import {money} from '../lib/reporting';
export function QuickItemSearch({onNavigate}:{onNavigate:(screen:string)=>void}){
 const [query,setQuery]=useState(''),[result,setResult]=useState<{query:string;rows:ItemSearchResult[];error:string}>({query:'',rows:[],error:''});
 useEffect(()=>{
  if(!query.trim())return;let alive=true;
  const timer=setTimeout(()=>{void readRpc('bon_erp_item_search',{p_query:query.trim(),p_limit:5}).then(value=>{const rows=itemResultsSchema.parse(value);if(alive)setResult({query,rows,error:''});}).catch(()=>{if(alive)setResult({query,rows:[],error:'تعذر البحث؛ تحقق من الاتصال.'});});},250);
  return()=>{alive=false;clearTimeout(timer);};
 },[query]);
 const pending=query!==result.query;
 return <div className="dashboard-search"><Search size={18}/><input aria-label="بحث سريع في منتجات المحل" maxLength={150} placeholder="اسم المنتج أو الكود…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" onClick={()=>setQuery('')}>مسح</button>}{query.trim()&&<div className="quick-results">{pending?<p role="status">جارٍ البحث…</p>:result.error?<p role="alert">{result.error}</p>:result.rows.length?result.rows.map(i=><button type="button" key={i.id} onClick={()=>onNavigate('inventory')}><span>{i.name}<small>{i.code} · الرصيد {money(i.stock)} {displayUnit(i.baseUnit)}</small></span><ChevronLeft size={16}/></button>):<p>لا يوجد منتج بهذا الاسم أو الكود.</p>}</div>}</div>;
}
