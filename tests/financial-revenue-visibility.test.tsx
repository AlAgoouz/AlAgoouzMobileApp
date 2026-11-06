// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {emptyStore} from '../src/lib/storeState';
import {attachCashierReport,approveCashierDay,salesForReports} from '../src/lib/cashierDays';
import {recordFinancialOpening,financialPosition} from '../src/lib/financialOpening';
import {buildReport,reportPoints,money} from '../src/lib/reporting';
import {dashboardSchema} from '../src/lib/readModels';
import {DashboardScreen} from '../src/components/DashboardScreen';
import {ProfitReportsScreen} from '../src/components/ReportsAndInsightsScreens';
import {INITIAL_ITEMS,INITIAL_PARTNERS} from '../src/data/initialData';
vi.mock('../src/components/OperationalHealth',()=>({OperationalHealth:()=>null}));
afterEach(cleanup);
const range={from:'2026-11-01',to:'2026-11-04',valid:true,label:'First four days'};
const period={kind:'custom' as const,from:range.from,to:range.to};
function source(){
 let s=recordFinancialOpening({...emptyStore,items:[{...INITIAL_ITEMS[0],stock:10,costPrice:20}]},'2026-11-01',1000,'Settled opening balance',{id:'owner',name:'Owner'});
 for(let n=1;n<=4;n++)s=attachCashierReport(s,`2026-11-0${n}`,{type:'financial',file:{fileName:`f${n}.csv`,sha256:String(n).repeat(64),uploadedAt:'2026-11-05T10:00:00Z'},totalRevenue:n*100});
 return s;
}
it('shows four financial reports immediately while cost and profit remain unknown and inventory is unchanged',()=>{
 const s=source(),before=structuredClone(s.items),report=buildReport(salesForReports(s),[],range);
 expect(report).toMatchObject({revenue:1000,cost:null,gross:null,net:null,margin:null,pendingCostDays:4});
 expect(report.points.filter(p=>p.recorded).map(p=>p.profit)).toEqual([null,null,null,null]);
 expect(financialPosition(s,range.from,range.to)).toMatchObject({opening:1000,inflow:1000,resources:2000,closing:2000});
 expect(s.items).toEqual(before);expect(s.salesInvoices).toHaveLength(0);
 expect(financialPosition(s,'2026-12-01','2026-12-31')).toMatchObject({opening:2000,inflow:0,closing:2000});
});
it('adds cost and inventory consumption later without double counting revenue or cash',()=>{
 let s=source();const id=s.cashierDays[0].id,item=s.items[0];
 s=attachCashierReport(s,'2026-11-04',{type:'items',file:{fileName:'i.csv',sha256:'a'.repeat(64),uploadedAt:'2026-11-05T10:00:00Z'},lines:[{itemId:item.id,quantity:1,unitLabel:item.baseUnit,normalizedQtyInBaseUnit:1}]});
 const before=financialPosition(s,range.from,range.to),posted=approveCashierDay(s,id,'Owner');
 expect(financialPosition(posted,range.from,range.to)).toEqual(before);
 expect(buildReport(salesForReports(posted),[],range)).toMatchObject({revenue:1000,pendingCostDays:3,net:null});
 const complete=buildReport(salesForReports(posted),[],{...range,from:'2026-11-04'});
 expect(complete).toMatchObject({revenue:400,cost:20,net:380,pendingCostDays:0});
 expect(posted.items[0].stock).toBe(9);expect(()=>approveCashierDay(posted,id,'Owner')).toThrow();
});
it('preserves unknown profit in grouped charts and keeps absent openings distinct from zero',()=>{
 const s=source();expect(financialPosition({...s,financialOpenings:[]},range.from,range.to)).toBeNull();
 const points=reportPoints([{date:'2026-01-01',sales:10,profit:5},{date:'2026-01-02',sales:20,profit:null}],{from:'2026-01-01',to:'2026-12-31',valid:true,label:'Year'});
 expect(points[0]).toMatchObject({sales:30,profit:null});
});
it('renders opening plus receipts on the dashboard and never charts a zero profit for missing cost',()=>{
 const s=source(),r=buildReport(salesForReports(s),[],range);
 const model=dashboardSchema.parse({version:4,report:{...r,count:4,entries:r.points,firstDate:range.from,lastDate:range.to},cash:financialPosition(s,range.from,range.to),balances:{inventory:200,debts:0,shortages:0},pending:4,approved:0,queued:0,channels:[{id:'cashier_sync',label:'يوم الكاشير',value:1000}],products:[],activity:[],counts:{}});
 const {container}=render(<DashboardScreen model={model} name="Owner" period={period} onPeriod={()=>{}} onNavigate={()=>{}}/>);
 const cash=screen.getByRole('region',{name:'رصيد أموال النشاط'});
 expect(within(cash).getByText('بداية الفترة + المتحصلات')).toBeTruthy();expect(within(cash).getAllByText(money(2000)+' ج.م')).toHaveLength(2);
 expect(screen.getByText('المبيعات المسجلة')).toBeTruthy();expect(screen.getAllByText('بانتظار استكمال تكلفة الأصناف').length).toBeGreaterThan(0);
 expect(container.querySelectorAll('.point-profit')).toHaveLength(0);
 for(const path of container.querySelectorAll('path[d]'))expect(path.getAttribute('d')).not.toMatch(/NaN|undefined|null/);
});
it('shows financial-only sales in reports and blocks inferred partner profit shares until cost completes',()=>{
 const s=source();render(<ProfitReportsScreen financeState={s} period={period} items={s.items} salesInvoices={salesForReports(s)} expenses={[]} partners={INITIAL_PARTNERS} onBack={()=>{}}/>);
 expect(screen.getByLabelText('صافي ربح الفترة').textContent).toBe('بانتظار تكلفة الأصناف');
 expect(screen.getByText('بداية الفترة + المتحصلات')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'حصص الشركاء'}));
 expect(screen.getAllByText('بانتظار تكلفة الأصناف').length).toBeGreaterThan(1);
});
