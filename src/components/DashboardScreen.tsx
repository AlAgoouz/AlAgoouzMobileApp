import React,{useMemo,useState} from 'react';
import {ArrowUpLeft,ArrowDownLeft,Wallet,Package,Receipt,Eye,EyeOff,AlertTriangle,FolderSync,Users,Clock3,Search,ChevronLeft,CheckCircle2} from 'lucide-react';
import type {StoreState} from '../lib/storeState';
import type {SalesInvoice} from '../types/erp';
import {businessDate} from '../lib/dates';
import {isStockItem} from '../lib/itemPolicy';
import {buildReport,inReportRange,money,reportRange,type PeriodSelection} from '../lib/reporting';
import {PeriodSelector} from './PeriodSelector';
import {ComparisonChart,TrendChart,EmptyChart} from './FinancialCharts';

interface Props {state:StoreState;sales:SalesInvoice[];period:PeriodSelection;onPeriod:(p:PeriodSelection)=>void;name:string;queued:number;onNavigate:(screen:string)=>void;}
export function DashboardScreen({state,sales,period,onPeriod,name,queued,onNavigate}:Props){
 const [hide,setHide]=useState(false),[search,setSearch]=useState('');
 const range=reportRange(period);
 const report=useMemo(()=>buildReport(sales,state.expenses,range),[sales,state.expenses,range.from,range.to,range.valid]);
 const balances=useMemo(()=>({inventory:state.items.filter(isStockItem).reduce((s,i)=>s+i.stock*i.costPrice,0),debts:state.customers.reduce((s,c)=>s+c.balance,0),shortages:state.items.filter(i=>isStockItem(i)&&i.stock<=i.minStock).length}),[state.items,state.customers]);
 const pending=state.cashierDays.filter(d=>d.status==='pending').length;
 const approved=state.cashierDays.filter(d=>d.status==='approved'&&inReportRange(d.date,range)).length+report.active.filter(i=>i.saleType==='cashier_sync'&&!i.invoiceNumber.startsWith('DAY-')).length;
 const channels=useMemo(()=>[['wholesale','الجملة'],['cashier_sync','يوم الكاشير'],['retail','بيع المحل السابق']].map(([id,label])=>({id,label,value:report.active.filter(i=>i.saleType===id).reduce((s,i)=>s+i.totalAmount,0)})),[report.active]);
 const products=useMemo(()=>{
  const rows=new Map<string,{name:string;revenue:number}>();
  for(const invoice of report.active)for(const line of invoice.items){const row=rows.get(line.itemId)??{name:line.itemName,revenue:0};row.revenue+=line.totalPrice;rows.set(line.itemId,row);}
  return [...rows.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,5);
 },[report.active]);
 const results=useMemo(()=>search.trim()?state.items.filter(i=>[i.name,i.code].some(v=>v.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).slice(0,5):[],[search,state.items]);
 const display=(v:number,privateValue=false)=>hide&&privateValue?'••••':money(v);
 const metrics=[{label:'المبيعات المسجلة',value:report.revenue,icon:Receipt,detail:`${report.active.length} مستند بيع · ${range.label}`,tone:'gold'},
 {label:'صافي الربح بعد المصروفات',value:report.net,icon:report.net<0?ArrowDownLeft:ArrowUpLeft,detail:hide?'القيمة مخفية':report.revenue>0?`هامش الصافي ${money(report.margin)}%`:'الهامش غير متاح دون مبيعات',tone:report.net<0?'negative':'positive',private:true},
 {label:'مصروفات الفترة',value:report.spent,icon:Wallet,detail:'دون المسحوبات الشخصية',tone:'amber'},
 {label:'قيمة المخزون الحالية',value:balances.inventory,icon:Package,detail:'رصيد الآن · لا يتغير بفلتر الفترة',tone:'neutral'}];
 return <main className="dashboard-screen" dir="rtl">
  <header className="dashboard-heading"><div><p className="eyebrow">بُن العجوز / مساحة العمل</p><h1>أهلًا {name}<span>، نظرة أوضح على محلك.</span></h1><p>المبيعات والنتائج وما يحتاج انتباهك في مكان واحد.</p></div><time dateTime={businessDate()}>{new Date(businessDate()+'T12:00:00').toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'})}</time></header>
  <div className="dashboard-tools"><PeriodSelector value={period} onChange={onPeriod}/><div className="dashboard-search"><Search size={18}/><input aria-label="بحث سريع في منتجات المحل" placeholder="اسم المنتج أو الكود…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" onClick={()=>setSearch('')}>مسح</button>}{search.trim()&&<div className="quick-results">{results.length?results.map(i=><button type="button" key={i.id} onClick={()=>onNavigate('inventory')}><span>{i.name}<small>{i.code} · الرصيد {money(i.stock)} {i.baseUnit==='kg'?'كجم':'وحدة'}</small></span><ChevronLeft size={16}/></button>):<p>لا يوجد منتج بهذا الاسم أو الكود.</p>}</div>}</div></div>
  <div className="dashboard-section-heading"><div><h2>ملخص الإحصائيات والأرباح المباشر</h2><p>{range.label} · حسب المستندات المسجلة وحالة المرتجعات والإلغاءات الحالية</p></div><button type="button" className="quiet-button" onClick={()=>setHide(v=>!v)} aria-pressed={hide} aria-label={hide?'إظهار الأرباح':'إخفاء الأرباح'}>{hide?<Eye size={18}/>:<EyeOff size={18}/>}<span>{hide?'إظهار':'إخفاء'} الأرباح</span></button></div>
  <section className="metric-grid" aria-label="مؤشرات المحل">{metrics.map(m=><article className={`metric-card metric-${hide&&m.private?'neutral':m.tone}`} key={m.label}><span className="metric-icon"><m.icon size={21}/></span><p>{m.label}</p><strong className={m.value<0&&!(hide&&m.private)?'value-negative':''}>{display(m.value,m.private)}<small>ج.م</small></strong><span className="metric-detail">{m.detail}</span></article>)}</section>
  <div className={`coverage-note ${approved?'coverage-confirmed':''}`}><CheckCircle2 size={18}/><p>{approved?`${approved} يوم كاشير معتمد داخل الفترة.`:'لا يوجد تقرير كاشير معتمد داخل الفترة.'} الأرقام تعكس المسجل حتى الآن؛ اكتمال بيع المحل يتطلب اعتماد تقاريره.</p></div>
  <section className="attention-grid" aria-label="ما يحتاج انتباهك">
   <button type="button" className="attention-card" onClick={()=>onNavigate('cashier_sync')}><span className="attention-icon"><FolderSync size={21}/></span><span><b>مراجعة الكاشير</b><small>{queued} ملفات واردة · {pending} أيام غير معتمدة</small></span><strong>{queued+pending}</strong><ChevronLeft size={17}/></button>
   <button type="button" className={`attention-card ${balances.shortages?'attention-warning':''}`} onClick={()=>onNavigate('shortages')}><span className="attention-icon"><AlertTriangle size={21}/></span><span><b>مراجعة المخزون</b><small>عجز أو رصيد وصل للحد الأدنى</small></span><strong>{balances.shortages}</strong><ChevronLeft size={17}/></button>
   <button type="button" className="attention-card" onClick={()=>onNavigate('customers')}><span className="attention-icon"><Users size={21}/></span><span><b>مديونيات العملاء الحالية</b><small>رصيد الآن · فتح كشف الحساب والتحصيل</small></span><strong>{money(balances.debts)}<small> ج.م</small></strong><ChevronLeft size={17}/></button>
  </section>
  <div className="dashboard-panels"><div className="dashboard-column">
   <TrendChart points={report.points} hide={hide}/>
   <ComparisonChart hide={hide} values={[{label:'المبيعات',value:report.revenue,tone:'fill-gold'},{label:'تكلفة البضاعة',value:report.cost,private:true,tone:'fill-brown'},{label:'المصروفات',value:report.spent,tone:'fill-amber'},{label:'الصافي',value:report.net,private:true,tone:'fill-green'}]}/>
  </div><div className="dashboard-column">
   <section className="visual-card"><div className="card-heading"><span className="card-icon"><Receipt size={20}/></span><div><h2>مصادر المبيعات</h2><p>قنوات البيع المسجلة خلال الفترة</p></div></div>{report.revenue===0?<EmptyChart>تظهر نسب القنوات بعد تسجيل مبيعات في الفترة.</EmptyChart>:<><div className="channel-track" aria-hidden="true">{channels.map(c=><span key={c.id} className={'channel-'+c.id} style={{width:`${c.value/report.revenue*100}%`}}/>)}</div><div className="channel-list">{channels.map(c=><div key={c.id}><span><i className={'channel-dot channel-'+c.id}/>{c.label}</span><b>{money(c.value)} ج.م <small>{money(c.value/report.revenue*100)}%</small></b></div>)}</div></>}</section>
   <section className="visual-card"><div className="card-heading"><span className="card-icon"><Package size={20}/></span><div><h2>أعلى الأصناف بإيراد السطور</h2><p>الفواتير المفصلة فقط · قبل خصم الفاتورة</p></div></div>{!products.length?<EmptyChart>لا توجد سطور بيع مفصلة للفترة المختارة.</EmptyChart>:<ol className="product-ranking">{products.map((p,index)=><li key={p.name+index}><div><span><em>{index+1}</em>{p.name}</span><b>{money(p.revenue)} ج.م</b></div><div className="ranking-track"><span style={{width:`${products[0].revenue>0?p.revenue/products[0].revenue*100:0}%`}}/></div></li>)}</ol>}<p className="visual-footnote">إيراد يوم الكاشير المجمع لا يُوزّع تخمينيًا على الأصناف.</p></section>
   <section className="visual-card"><div className="card-heading"><span className="card-icon"><Clock3 size={20}/></span><div><h2>آخر حركات المحل</h2><p>آخر العمليات عبر كل الفترات</p></div></div>{!state.auditLogs.length?<EmptyChart>ستظهر هنا عمليات المحل بعد تسجيلها.</EmptyChart>:<ul className="activity-list">{state.auditLogs.slice(0,4).map(log=><li key={log.id}><span><b>{log.description}</b><small>{log.partnerName} · {log.timestamp}</small></span>{log.amount!==undefined&&<strong>{money(log.amount)} ج.م</strong>}</li>)}</ul>}</section>
  </div></div>
 </main>;
}
