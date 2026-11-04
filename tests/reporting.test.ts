import {it,expect} from 'vitest';
import {buildReport,previousReportRange,chartDomain,reportRange,validCalendarDate,type PeriodSelection} from '../src/lib/reporting';
import type {SalesInvoice,Expense} from '../src/types/erp';
const invoice=(date:string,netProfit=30,extra:Partial<SalesInvoice>={}):SalesInvoice=>({id:date,invoiceNumber:date,date,saleType:'wholesale',customerName:'Test',items:[],subtotal:100,discount:0,totalAmount:100,totalCost:100-netProfit,netProfit,paidAmount:100,remainingAmount:0,paymentMethod:'نقدي',partnerName:'Test',...extra});
const expense=(date:string,amount=50,extra:Partial<Expense>={}):Expense=>({id:date,date,title:'Test',category:'نثريات أخرى',amount,partnerName:'Test',paidFrom:'درج المحل',...extra});
const selection=(kind:PeriodSelection['kind']):PeriodSelection=>({kind,from:'2026-11-01',to:'2026-11-03'});
it('uses inclusive calendar boundaries for today, week and month and rejects invalid ranges',()=>{
 expect(reportRange(selection('month'),'2026-11-03')).toMatchObject({from:'2026-11-01',to:'2026-11-03',valid:true});
 expect(reportRange(selection('week'),'2026-11-03').from).toBe('2026-10-28');
 expect(reportRange(selection('today'),'2026-11-03').from).toBe('2026-11-03');
 expect(validCalendarDate('2026-02-29')).toBe(false);expect(validCalendarDate('2028-02-29')).toBe(true);
 expect(reportRange({...selection('custom'),from:'2026-11-04'}).valid).toBe(false);
});
it('keeps the all-records totals consistent and distinguishes negative profit from zero',()=>{
 const report=buildReport([invoice('2026-11-01'),invoice('2026-10-31',20),invoice('2026-11-01',30,{isReturned:true})],[expense('2026-11-01',70),expense('2026-11-01',500,{isCancelled:true}),expense('2026-11-01',100,{category:'مسحوبات شركاء'})],reportRange(selection('all')));
 expect(report.revenue).toBe(200);expect(report.gross).toBe(50);expect(report.spent).toBe(70);expect(report.net).toBe(-20);
 expect(report.points.reduce((s,p)=>s+p.profit,0)).toBe(report.net);
 expect(chartDomain([0,-20,200])).toEqual({min:-20,max:200});expect(chartDomain([0,0])).toEqual({min:0,max:1});
});
it('filters invoices and expenses together and excludes current snapshots from period aggregation',()=>{
 const report=buildReport([invoice('2026-11-01'),invoice('2026-10-31')],[expense('2026-11-03'),expense('2026-10-31')],reportRange(selection('custom')));
 expect(report.active).toHaveLength(1);expect(report.invoices).toHaveLength(1);expect(report.spent).toBe(50);expect(report.net).toBe(-20);expect(report.margin).toBe(-20);
});
it('marks absent dates separately from a recorded zero and includes expense-only losses',()=>{
 const report=buildReport([invoice('2026-11-01',0,{totalAmount:0,totalCost:0})],[expense('2026-11-03',40)],reportRange(selection('custom')));
 expect(report.points).toEqual([{date:'2026-11-01',sales:0,profit:0,recorded:true},{date:'2026-11-02',sales:0,profit:0,recorded:false},{date:'2026-11-03',sales:0,profit:-40,recorded:true}]);
});
it('uses bounded aggregation for a long history without rounding away money or creating invented days',()=>{
 const report=buildReport([invoice('2020-01-02',0.25),invoice('2026-11-03',0.5)],[],reportRange(selection('all')));
 expect(report.points).toHaveLength(7);expect(report.points.filter(p=>p.recorded).map(p=>p.date)).toEqual(['2020','2026']);expect(report.points[1].recorded).toBe(false);expect(report.net).toBe(.75);
 expect(buildReport([],[],reportRange(selection('month'))).points).toEqual([]);
});

it('compares equal inclusive day counts across month and leap-year boundaries without inventing a baseline for all history',()=>{
 expect(previousReportRange({from:'2028-03-01',to:'2028-03-03',valid:true,label:''})).toMatchObject({from:'2028-02-27',to:'2028-02-29'});
 expect(previousReportRange({from:'2026-11-01',to:'2026-11-01',valid:true,label:''})).toMatchObject({from:'2026-10-31',to:'2026-10-31'});
 expect(previousReportRange(reportRange(selection('all')))).toBeNull();
 expect(previousReportRange({from:'0001-01-02',to:'0001-01-10',valid:true,label:''})).toBeNull();
});
