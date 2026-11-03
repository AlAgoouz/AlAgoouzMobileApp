import React,{useState} from 'react';
import {CalendarDays,Check} from 'lucide-react';
import {reportRange,type PeriodKind,type PeriodSelection} from '../lib/reporting';

export function PeriodSelector({value,onChange}:{value:PeriodSelection;onChange:(next:PeriodSelection)=>void}){
 const [from,setFrom]=useState(value.from),[to,setTo]=useState(value.to);
 const valid=reportRange({kind:'custom',from,to}).valid;
 return <section className="period-picker" aria-label="فترة عرض البيانات">
  <div className="period-heading"><CalendarDays size={17}/><span>فترة العرض</span><small>{reportRange(value).label}</small></div>
  <div className="period-options">{([['today','اليوم'],['week','7 أيام'],['month','الشهر'],['all','كل السجل'],['custom','فترة محددة']] as [PeriodKind,string][]).map(([kind,label])=><button key={kind} type="button" aria-pressed={value.kind===kind} onClick={()=>{if(kind==='custom'){setFrom(value.from);setTo(value.to);}onChange({...value,kind});}}>{label}</button>)}</div>
  {value.kind==='custom'&&<form className="period-custom" onSubmit={e=>{e.preventDefault();if(valid)onChange({kind:'custom',from,to});}}><label>من<input aria-label="بداية الفترة" type="date" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label>إلى<input aria-label="نهاية الفترة" type="date" value={to} onChange={e=>setTo(e.target.value)} required/></label><button type="submit" disabled={!valid}><Check size={17}/>تطبيق</button>{!valid&&<p role="alert">أدخل تاريخين صحيحين؛ البداية تسبق النهاية. يظل آخر نطاق مطبّق ظاهرًا حتى التطبيق.</p>}</form>}
 </section>;
}
