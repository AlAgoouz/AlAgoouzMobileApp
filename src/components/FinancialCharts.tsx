import React,{useMemo,useState,useId} from 'react';
import {BarChart3,TrendingUp} from 'lucide-react';
import {chartDomain,money,type TrendPoint} from '../lib/reporting';

export function EmptyChart({children}:{children:React.ReactNode}){return <div className="chart-empty"><BarChart3 size={30}/><p>{children}</p></div>;}
export function TrendChart({points,hide=false}:{points:TrendPoint[];hide?:boolean}){
 const [selected,setSelected]=useState<string|null>(null);
 const clip=useId().replace(/:/g,'');
 const current=points.find(p=>p.date===selected)??points[points.length-1];
 const domain=useMemo(()=>chartDomain(points.filter(p=>p.recorded).flatMap(p=>hide||p.profit===null?[p.sales]:[p.sales,p.profit])),[points,hide]);
 const y=(v:number)=>180-(v-domain.min)/(domain.max-domain.min)*160;
 const x=(i:number)=>points.length===1?300:20+i/(points.length-1)*560;
 const path=(key:'sales'|'profit')=>{let drawing=false;return points.map((p,i)=>{const value=p[key];if(!p.recorded||value===null){drawing=false;return '';}if(i&&p.date.length===4&&Number(p.date)-Number(points[i-1].date)>1)drawing=false;const command=drawing?'L':'M';drawing=true;return `${command}${x(i)},${y(value)}`;}).join(' ');};
 return <section className="visual-card trend-card" aria-label="اتجاه المبيعات وصافي الربح"><div className="card-heading"><span className="card-icon"><TrendingUp size={20}/></span><div><h2>اتجاه المبيعات وصافي الربح</h2><p>الصافي بعد المصروفات · ج.م</p></div></div>
  {!points.length?<EmptyChart>لا توجد مستندات مسجلة خلال الفترة المختارة.</EmptyChart>:<>
   <div className="chart-legend"><span><i className="legend-sales"/>المبيعات</span><span><i className="legend-profit"/>{hide?'الربح مخفي':'صافي الربح'}</span></div>
   <div className="trend-plot"><div className="chart-axis" aria-hidden="true"><span>{money(domain.max)}</span><span>{money(domain.min)}</span></div><svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="الرسم يعرض المستندات المسجلة؛ الفراغ بين النقاط يعني عدم وجود قيد مسجل. التفاصيل متاحة أسفل الرسم.">
    <defs><clipPath id={clip+'positive'}><rect x="0" y="0" width="600" height={y(0)}/></clipPath><clipPath id={clip+'negative'}><rect x="0" y={y(0)} width="600" height={200-y(0)}/></clipPath></defs>
    {[20,60,100,140,180].map(v=><line key={v} x1="0" x2="600" y1={v} y2={v} className="chart-grid-line"/>)}
    <line x1="0" x2="600" y1={y(0)} y2={y(0)} className="chart-zero"/>
    <path d={path('sales')} className="trend-line trend-sales"/>{!hide&&<><path d={path('profit')} className="trend-line trend-profit" clipPath={`url(#${clip}positive)`}/><path d={path('profit')} className="trend-line trend-profit trend-loss" clipPath={`url(#${clip}negative)`}/></>}
    {points.map((p,i)=>p.recorded?<g key={p.date} onClick={()=>setSelected(p.date)}><circle cx={x(i)} cy={y(p.sales)} r="5" className="point-sales"><title>{p.date}: المبيعات {money(p.sales)} ج.م</title></circle>{!hide&&p.profit!==null&&<circle cx={x(i)} cy={y(p.profit)} r="4" className={p.profit<0?'point-negative':'point-profit'}><title>{p.date}: الصافي {money(p.profit)} ج.م</title></circle>}</g>:null)}
   </svg></div>
   <div className="chart-dates" dir="ltr"><span>{points[0].date}</span><span>{points[points.length-1].date}</span></div>
   <label className="chart-detail-select">تفاصيل التاريخ<select aria-label="تفاصيل تاريخ الرسم" value={current?.date} onChange={e=>setSelected(e.target.value)}>{points.map(p=><option key={p.date} value={p.date}>{p.date}{p.recorded?'':' — لا يوجد قيد'}</option>)}</select></label>
   {current&&<div className="chart-detail" aria-live="polite">{current.recorded?<><span>المبيعات <b>{money(current.sales)} ج.م</b></span><span>الصافي <b className={current.profit!==null&&current.profit<0?'value-negative':'value-positive'}>{hide?'••••':current.profit===null?'بانتظار تكلفة الأصناف':money(current.profit)+' ج.م'}</b></span></>:<p>لا يوجد قيد مسجل لهذا التاريخ؛ لا يعني ذلك أن مبيعات المحل الفعلية صفر.</p>}</div>}
   <p className="visual-footnote">{points[0].date.length===4?'تجميع سنوي':points[0].date.length===7?'تجميع شهري':'تجميع يومي'} · الفراغات تعني عدم وجود مستندات مسجلة.</p>
  </>}
 </section>;
}

export function ComparisonChart({values,hide=false}:{values:{label:string;value:number|null;private?:boolean;tone:string}[];hide?:boolean}){
 const domain=chartDomain(values.flatMap(v=>v.value===null?[]:[v.value])),span=domain.max-domain.min,zero=(0-domain.min)/span*100;
 return <section className="visual-card" aria-label="مقارنة الإيرادات والمصروفات"><div className="card-heading"><span className="card-icon"><BarChart3 size={20}/></span><div><h2>من الإيراد إلى صافي الربح</h2><p>مقارنة قيم الفترة · ج.م</p></div></div><div className="comparison-chart">{values.map(v=>{
  const position=((v.value??0)-domain.min)/span*100,concealed=hide&&v.private;
  return <div className="comparison-row" key={v.label}><div><span>{v.label}</span><b className={v.value!==null&&v.value<0&&!concealed?'value-negative':''}>{concealed?'••••':v.value===null?'بانتظار تكلفة الأصناف':money(v.value)+' ج.م'}</b></div><div className="comparison-track" dir="ltr"><i className="comparison-zero" style={{left:`${zero}%`}}/>{!concealed&&v.value!==null&&v.value!==0&&<span className={`comparison-fill ${v.value<0?'fill-negative':v.tone}`} style={{left:`${Math.min(zero,position)}%`,width:`${Math.abs(position-zero)}%`}}/>}</div></div>;
 })}</div><p className="visual-footnote">القيم السالبة تمتد يسار خط الصفر. الصفر لا يُرسم كعمود موجب.</p></section>;
}
