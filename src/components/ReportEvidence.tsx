import React,{useMemo,useState} from 'react';
import {Modal} from './Modal';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {buildReport,money,previousReportRange,type ReportRange} from '../lib/reporting';
import type {SalesInvoice,Expense} from '../types/erp';
type Metric='sales'|'cost'|'expenses'|'net';
const labels:Record<Metric,string>={sales:'المبيعات',cost:'تكلفة البضاعة',expenses:'المصروفات',net:'صافي الربح'};
export function ReportEvidence({sales,expenses,range}:{sales:SalesInvoice[];expenses:Expense[];range:ReportRange}){
 const [metric,setMetric]=useState<Metric|null>(null),[query,setQuery]=useState('');
 const current=useMemo(()=>buildReport(sales,expenses,range),[sales,expenses,range.from,range.to,range.valid]);
 const previousRange=previousReportRange(range),previous=useMemo(()=>previousRange?buildReport(sales,expenses,previousRange):null,[sales,expenses,previousRange?.from,previousRange?.to]);
 const records=useMemo(()=>{
  const result:{id:string;date:string;name:string;amount:number}[]=[];
  if(metric!=='expenses')for(const invoice of current.active)result.push({id:'sale-'+invoice.id,date:invoice.date,name:`${invoice.saleType==='cashier_sync'?'يوم كاشير معتمد':'فاتورة'} ${invoice.invoiceNumber} — ${invoice.customerName}`,amount:metric==='cost'?invoice.totalCost:metric==='net'?invoice.netProfit:invoice.totalAmount});
  if(metric==='expenses'||metric==='net')for(const expense of current.expenses)if(!expense.isCancelled&&expense.category!=='مسحوبات شركاء')result.push({id:'expense-'+expense.id,date:expense.date,name:`مصروف: ${expense.title} — ${expense.category}`,amount:(metric==='net'?-1:1)*expense.amount});
  return result.filter(row=>`${row.name} ${row.date}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 },[current,metric,query]);
 const page=useRecordPage(records,metric+'|'+query+'|'+range.from+'|'+range.to),value=metric==='sales'?current.revenue:metric==='cost'?current.cost:metric==='expenses'?current.spent:current.net;
 return <section className="visual-card space-y-3"><h2 className="font-bold">مصادر الأرقام ومقارنة الفترات</h2>
  <p className="operation-note">المبيعات تستبعد المرتجعات وتضم أيام الكاشير المعتمدة مرة واحدة. الصافي = المبيعات − تكلفة البضاعة − مصروفات التشغيل؛ المسحوبات الشخصية مستبعدة.</p>
  <div className="record-actions">{(Object.keys(labels) as Metric[]).map(key=><button className="record-action" key={key} onClick={()=>{setMetric(key);setQuery('');}}>مصادر {labels[key]}</button>)}</div>
  {previous&&previousRange?<><p>مقارنة مع الفترة السابقة بنفس عدد الأيام: {previousRange.from} — {previousRange.to}</p><dl className="record-facts">{([{label:'المبيعات',current:current.revenue,previous:previous.revenue},{label:'المصروفات',current:current.spent,previous:previous.spent},{label:'الصافي',current:current.net,previous:previous.net}]).map(row=><div key={row.label}><dt>{row.label}</dt><dd>السابق: {money(row.previous)} ج.م<br/>الفرق: {money(row.current-row.previous)} ج.م{row.previous>0?` (${money((row.current-row.previous)/row.previous*100)}%)`:' · النسبة غير متاحة'}</dd></div>)}</dl><p className="text-xs">المقارنة حسب المستندات المسجلة في الفترتين؛ لا تثبت اكتمال رفع جميع أيام البيع.</p></>:<p>اختر فترة محددة لا تزيد على سنتين لعرض مقارنتها بالفترة السابقة.</p>}
  {metric&&<Modal wide title={`مصادر ${labels[metric]}`} description={`${range.label} · إجمالي الرقم ${money(value)} ج.م`} onClose={()=>setMetric(null)}>
   <label className="record-search">بحث في المستندات<input value={query} onChange={e=>setQuery(e.target.value)}/></label><RecordPagination {...page}/><p>{query?'مجموع النتائج المطابقة':'مجموع المستندات'}: {money(records.reduce((sum,row)=>sum+row.amount,0))} ج.م</p>
   {!records.length&&<p className="record-state">لا توجد مستندات مطابقة.</p>}
   <div className="record-grid">{page.visible.map(row=><article key={row.id} className="record-card"><time>{row.date}</time><h3>{row.name}</h3><strong>{money(row.amount)} ج.م</strong></article>)}</div>
  </Modal>}
 </section>;
}
