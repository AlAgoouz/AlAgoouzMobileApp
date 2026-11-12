import {OperationalHealth} from './OperationalHealth';
import {ScreenLoading} from './ScreenLoading';
import React,{useMemo,useState} from 'react';
import {ArrowUpLeft,ArrowDownLeft,Wallet,Package,Receipt,Eye,EyeOff,AlertTriangle,FolderSync,Users,Clock3,ChevronLeft,CheckCircle2} from 'lucide-react';
import {businessDate} from '../lib/dates';
import {reportPoints,money,reportRange,type PeriodSelection} from '../lib/reporting';
import type {DashboardModel} from '../lib/readModels';
import {QuickItemSearch} from './QuickItemSearch';
import {PeriodSelector} from './PeriodSelector';
import {ComparisonChart,TrendChart,EmptyChart} from './FinancialCharts';

interface Props {model:DashboardModel|null;error?:string;onRetry?:()=>void;period:PeriodSelection;onPeriod:(p:PeriodSelection)=>void;name:string;onNavigate:(screen:string)=>void;}
export function DashboardScreen({model,error,onRetry,period,onPeriod,name,onNavigate}:Props){
 const [hide,setHide]=useState(false);
 const range=reportRange(period);
 const report=useMemo(()=>model?({...model.report,points:reportPoints(model.report.entries,range,model.report.firstDate,model.report.lastDate)}):null,[model,range.from,range.to]);
 const intro=<>  <header className="dashboard-heading"><div><p className="eyebrow">بُن العجوز / مساحة العمل</p><h1>أهلًا {name}<span>، نظرة أوضح على محلك.</span></h1><p>المبيعات والنتائج وما يحتاج انتباهك في مكان واحد.</p></div><time dateTime={businessDate()}>{new Date(businessDate()+'T12:00:00').toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'})}</time></header>
</>;
 if(!model||!report)return <main className="dashboard-screen" dir="rtl">{intro}  <div key="dashboard-tools" className="dashboard-tools"><PeriodSelector value={period} onChange={onPeriod}/><QuickItemSearch onNavigate={onNavigate}/></div>{error?<div role="alert" className="record-state"><p>{error}</p><button onClick={onRetry}>إعادة المحاولة</button></div>:<ScreenLoading label="جارٍ تحميل ملخص المحل…"/>}</main>;
 const {balances,pending,approved,channels,products,queued}=model;
 const display=(v:number|null,privateValue=false)=>hide&&privateValue?'••••':v===null?'غير مكتمل':money(v);
 const metrics=[{label:'المبيعات المسجلة',value:report.revenue,icon:Receipt,detail:`${report.count} مستند بيع · ${range.label}`,tone:'gold'},
 {label:'صافي الربح بعد المصروفات',value:report.net,icon:report.net!==null&&report.net<0?ArrowDownLeft:ArrowUpLeft,detail:hide?'القيمة مخفية':report.net===null?'بانتظار استكمال تكلفة الأصناف':report.revenue>0?`هامش الصافي ${money(report.margin)}%`:'الهامش غير متاح دون مبيعات',tone:report.net===null?'neutral':report.net<0?'negative':'positive',private:true},
 {label:'مصروفات الفترة',value:report.spent,icon:Wallet,detail:'دون المسحوبات الشخصية',tone:'amber'},
 {label:'قيمة المخزون الحالية',value:balances.inventory,icon:Package,detail:'رصيد الآن · لا يتغير بفلتر الفترة',tone:'neutral'}];
 return <main className="dashboard-screen" dir="rtl">
  {intro}
  {error&&<p role="alert" className="record-state">{error} <button onClick={onRetry}>إعادة المحاولة</button></p>}
  <section className="dashboard-attention" aria-labelledby="dashboard-attention-title"><h2 id="dashboard-attention-title">محتاج متابعة</h2><div className="attention-grid">
   <button type="button" className="attention-card" onClick={()=>onNavigate('cashier_sync')}><span className="attention-icon"><FolderSync size={21}/></span><span><b>مراجعة الكاشير</b><small>{queued} ملفات واردة · {pending} أيام غير معتمدة</small></span><strong>{queued+pending}</strong><ChevronLeft size={17}/></button>
   <button type="button" className={`attention-card ${balances.shortages?'attention-warning':''}`} onClick={()=>onNavigate('shortages')}><span className="attention-icon"><AlertTriangle size={21}/></span><span><b>مراجعة المخزون</b><small>عجز أو رصيد وصل للحد الأدنى</small></span><strong>{balances.shortages}</strong><ChevronLeft size={17}/></button>
   <button type="button" className="attention-card" onClick={()=>onNavigate('customers')}><span className="attention-icon"><Users size={21}/></span><span><b>مديونيات العملاء الحالية</b><small>رصيد الآن · فتح كشف الحساب والتحصيل</small></span><strong>{money(balances.debts)}<small> ج.م</small></strong><ChevronLeft size={17}/></button>
  </div></section>
  <div key="dashboard-tools" className="dashboard-tools"><PeriodSelector value={period} onChange={onPeriod}/><QuickItemSearch onNavigate={onNavigate}/></div>
  <div className="dashboard-section-heading"><div><h2>ملخص الإحصائيات والأرباح المباشر</h2><p>{range.label} · حسب المستندات المسجلة وحالة المرتجعات والإلغاءات الحالية</p></div><button type="button" className="quiet-button" onClick={()=>setHide(v=>!v)} aria-pressed={hide} aria-label={hide?'إظهار الأرباح':'إخفاء الأرباح'}>{hide?<Eye size={18}/>:<EyeOff size={18}/>}<span>{hide?'إظهار':'إخفاء'} الأرباح</span></button></div>
  <section className="metric-grid" aria-label="مؤشرات المحل">{metrics.map(m=><article className={`metric-card metric-${hide&&m.private?'neutral':m.tone}`} key={m.label}><span className="metric-icon"><m.icon size={21}/></span><p>{m.label}</p><strong className={m.value!==null&&m.value<0&&!(hide&&m.private)?'value-negative':''}>{display(m.value,m.private)}{m.value!==null&&<small>ج.م</small>}</strong><span className="metric-detail">{m.detail}</span><button className="quiet-button" onClick={()=>onNavigate(m.label==='قيمة المخزون الحالية'?'inventory':'reports')}>عرض التفاصيل</button></article>)}</section>
  <section className="visual-card" aria-label="رصيد أموال النشاط"><h2>رصيد أموال النشاط</h2>{model.cash?<><dl className="record-facts"><div><dt>رصيد بداية الفترة</dt><dd>{display(model.cash.opening)} ج.م</dd></div><div><dt>المتحصلات المسجلة</dt><dd>{display(model.cash.inflow)} ج.م</dd></div><div><dt>بداية الفترة + المتحصلات</dt><dd>{display(model.cash.resources)} ج.م</dd></div><div><dt>المدفوعات والمسحوبات</dt><dd>{display(model.cash.outflow)} ج.م</dd></div><div><dt>الرصيد الدفتري حتى {model.cash.to}</dt><dd>{display(model.cash.closing)} ج.م</dd></div></dl>{!!model.cash.issues.length&&<p role="alert">{model.cash.issues.join('، ')}</p>}</>:<p>حدّد رصيد بداية المدة من التقارير لعرض أموال النشاط.</p>}<p className="operation-note">رصيد البداية مستقل عن المبيعات والأرباح. يشمل الرصيد المتحصلات والمدفوعات المسجلة فقط، ولا يتطلب اكتمال تكلفة الأصناف.</p></section>
  <div className={`coverage-note ${approved?'coverage-confirmed':''}`}><CheckCircle2 size={18}/><p>{report.pendingCostDays?`${report.pendingCostDays} أيام مبيعات مسجلة ماليًا وتنتظر تكلفة الأصناف؛ الإيراد ظاهر والربح غير مكتمل.`:`${approved} يوم كاشير مكتمل التكلفة داخل الفترة.`} خصم المخزون ينتظر اعتماد تقرير الأصناف؛ لا يُسجّل الإيراد مرة ثانية.</p></div>
  <div className="dashboard-main-panels">
   <TrendChart points={report.points} hide={hide}/>
   <OperationalHealth onCashier={()=>onNavigate('cashier_sync')}/>
  </div>
  <details className="dashboard-extra">
   <summary>تفاصيل المبيعات وآخر الحركات</summary>
   <div className="dashboard-panels"><div className="dashboard-column">
   <ComparisonChart hide={hide} values={[{label:'المبيعات',value:report.revenue,tone:'fill-gold'},{label:'تكلفة البضاعة',value:report.cost,private:true,tone:'fill-brown'},{label:'المصروفات',value:report.spent,tone:'fill-amber'},{label:'الصافي',value:report.net,private:true,tone:'fill-green'}]}/>
  </div><div className="dashboard-column">
   <section className="visual-card"><div className="card-heading"><span className="card-icon"><Receipt size={20}/></span><div><h2>مصادر المبيعات</h2><p>قنوات البيع المسجلة خلال الفترة</p></div></div>{report.revenue===0?<EmptyChart>تظهر نسب القنوات بعد تسجيل مبيعات في الفترة.</EmptyChart>:<><div className="channel-track" aria-hidden="true">{channels.map(c=><span key={c.id} className={'channel-'+c.id} style={{width:`${c.value/report.revenue*100}%`}}/>)}</div><div className="channel-list">{channels.map(c=><div key={c.id}><span><i className={'channel-dot channel-'+c.id}/>{c.label}</span><b>{money(c.value)} ج.م <small>{money(c.value/report.revenue*100)}%</small></b></div>)}</div></>}</section>
   <section className="visual-card"><div className="card-heading"><span className="card-icon"><Package size={20}/></span><div><h2>أعلى الأصناف بإيراد السطور</h2><p>الفواتير المفصلة فقط · قبل خصم الفاتورة</p></div></div>{!products.length?<EmptyChart>لا توجد سطور بيع مفصلة للفترة المختارة.</EmptyChart>:<ol className="product-ranking">{products.map((p,index)=><li key={p.name+index}><div><span><em>{index+1}</em>{p.name}</span><b>{money(p.revenue)} ج.م</b></div><div className="ranking-track"><span style={{width:`${products[0].revenue>0?p.revenue/products[0].revenue*100:0}%`}}/></div></li>)}</ol>}<p className="visual-footnote">إيراد يوم الكاشير المجمع لا يُوزّع تخمينيًا على الأصناف.</p></section>
   <section className="visual-card"><div className="card-heading"><span className="card-icon"><Clock3 size={20}/></span><div><h2>آخر حركات المحل</h2><p>آخر العمليات عبر كل الفترات</p></div></div>{!model.activity.length?<EmptyChart>ستظهر هنا عمليات المحل بعد تسجيلها.</EmptyChart>:<ul className="activity-list">{model.activity.slice(0,4).map(log=><li key={log.id}><span><b>{log.description}</b><small>{log.partnerName} · {log.timestamp}</small></span>{log.amount!==undefined&&<strong>{money(log.amount)} ج.م</strong>}</li>)}</ul>}</section>
  </div></div></details>
 </main>;
}
