import {businessDate} from './dates';
import {operatingExpenses} from './ledger';
import type {SalesInvoice,Expense} from '../types/erp';

export type PeriodKind='today'|'week'|'month'|'custom'|'all';
export interface PeriodSelection {kind:PeriodKind;from:string;to:string;}
export interface ReportRange {from:string;to:string;label:string;valid:boolean;}
export const initialPeriod=():PeriodSelection=>({kind:'month',from:businessDate().slice(0,7)+'-01',to:businessDate()});
export function validCalendarDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function reportRange(period:PeriodSelection,today=businessDate()):ReportRange{
 let from=today,to=today,label='اليوم';
 if(period.kind==='week'){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6);from=d.toISOString().slice(0,10);label='آخر 7 أيام';}
 if(period.kind==='month'){from=today.slice(0,7)+'-01';label='الشهر الحالي';}
 if(period.kind==='all'){from='0001-01-01';to='9999-12-31';label='كل السجل';}
 if(period.kind==='custom'){from=period.from;to=period.to;label=`${from} — ${to}`;}
 return {from,to,label,valid:validCalendarDate(from)&&validCalendarDate(to)&&from<=to};
}
export const inReportRange=(date:string,range:ReportRange)=>range.valid&&date>=range.from&&date<=range.to;
export function previousReportRange(range:ReportRange):ReportRange|null{
 if(!range.valid||range.from==='0001-01-01'||range.to==='9999-12-31')return null;
 const start=Date.parse(range.from+'T12:00:00Z'),end=Date.parse(range.to+'T12:00:00Z'),days=(end-start)/86400000+1;
 if(days<1||days>731)return null;
 const previousStart=new Date(start-days*86400000),previousEnd=new Date(start-86400000);
 if(previousStart.getUTCFullYear()<1)return null;
 return {from:previousStart.toISOString().slice(0,10),to:previousEnd.toISOString().slice(0,10),valid:true,label:'الفترة السابقة'};
}
export function chartDomain(values:number[]){const min=Math.min(0,...values),max=Math.max(0,...values);return min===max?{min:0,max:1}:{min,max};}
export interface TrendPoint {date:string;sales:number;profit:number;recorded:boolean;}
export function buildReport(sales:SalesInvoice[],expenses:Expense[],range:ReportRange){
 const invoices=sales.filter(i=>inReportRange(i.date,range)),active=invoices.filter(i=>!i.isReturned);
 const periodExpenses=expenses.filter(e=>inReportRange(e.date,range));
 const revenue=active.reduce((s,i)=>s+i.totalAmount,0),cost=active.reduce((s,i)=>s+i.totalCost,0),gross=active.reduce((s,i)=>s+i.netProfit,0),spent=operatingExpenses(periodExpenses);
 const entries=new Map<string,{sales:number;profit:number}>();
 const add=(date:string,sales:number,profit:number)=>{const row=entries.get(date)??{sales:0,profit:0};entries.set(date,{sales:row.sales+sales,profit:row.profit+profit});};
 for(const i of active)add(i.date,i.totalAmount,i.netProfit);
 for(const e of periodExpenses)if(!e.isCancelled&&e.category!=='مسحوبات شركاء')add(e.date,0,-e.amount);
 const points=reportPoints([...entries].map(([date,value])=>({date,...value})),range);
 return {invoices,active,expenses:periodExpenses,revenue,cost,gross,spent,net:gross-spent,margin:revenue?((gross-spent)/revenue)*100:0,points};
}
export const money=(value:number)=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Object.is(value,-0)?0:value);

export function reportPoints(rows:{date:string;sales:number;profit:number}[],range:ReportRange,firstDate?:string|null,lastDate?:string|null){
 const entries=new Map(rows.map(row=>[row.date,{sales:row.sales,profit:row.profit}]));
 const dates=[...entries.keys()].sort();let points:TrendPoint[]=[];
 if(dates.length){
  const first=range.from==='0001-01-01'?(firstDate??dates[0]):range.from,last=range.to==='9999-12-31'?(lastDate??dates[dates.length-1]):range.to;
  const days=(Date.parse(last)-Date.parse(first))/86400000;
  if(days<=62){
   for(let d=new Date(first+'T12:00:00Z');d.toISOString().slice(0,10)<=last;d.setUTCDate(d.getUTCDate()+1)){
    const date=d.toISOString().slice(0,10),entry=entries.get(date);points.push({date,sales:entry?.sales??0,profit:entry?.profit??0,recorded:!!entry});
   }
  }else{
   const buckets=new Map<string,TrendPoint>();const length=days>730?4:7;
   for(const [date,row]of entries){const key=date.slice(0,length),p=buckets.get(key)??{date:key,sales:0,profit:0,recorded:true};p.sales+=row.sales;p.profit+=row.profit;buckets.set(key,p);}
   const cursor=new Date(first.slice(0,4)+(length===4?'-01-01':first.slice(4,7)+'-01')+'T12:00:00Z');
   const stop=last.slice(0,length),filled:TrendPoint[]=[];
   // Keep missing periods explicit, without creating an unbounded chart for
   // extreme custom dates. Normal shop histories remain calendar-spaced.
   while(cursor.toISOString().slice(0,length)<=stop&&filled.length<120){
    const date=cursor.toISOString().slice(0,length);filled.push(buckets.get(date)??{date,sales:0,profit:0,recorded:false});
    if(length===4)cursor.setUTCFullYear(cursor.getUTCFullYear()+1);else cursor.setUTCMonth(cursor.getUTCMonth()+1);
   }
   points=cursor.toISOString().slice(0,length)>stop?filled:[...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
 }
 return points;
}
