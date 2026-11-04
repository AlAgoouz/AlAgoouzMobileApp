import {it,expect} from 'vitest';
import {emptyStore,createBackup,parseBackup} from '../src/lib/storeState';
import {recordFinancialOpening,financialPosition} from '../src/lib/financialOpening';
import {buildReport} from '../src/lib/reporting';
import {salesForReports} from '../src/lib/cashierDays';
import type {SalesInvoice,PurchaseInvoice,Expense,CashierDay} from '../src/types/erp';
const actor={id:'11111111-1111-4111-8111-111111111111',name:'Owner'};
const base=(amount=1000)=>recordFinancialOpening(emptyStore,'2026-11-01',amount,'ترحيل أكتوبر بعد تسوية الشركاء',actor);
const sale=(patch:Partial<SalesInvoice>={}):SalesInvoice=>({id:'sale',invoiceNumber:'S1',date:'2026-11-02',customerId:'c',customerName:'Customer',saleType:'wholesale',items:[],subtotal:100,totalAmount:100,discount:0,paidAmount:100,remainingAmount:0,totalCost:60,netProfit:40,paymentMethod:'نقدي',partnerName:'Owner',...patch});
const purchase=(patch:Partial<PurchaseInvoice>={}):PurchaseInvoice=>({id:'purchase',invoiceNumber:'P1',date:'2026-11-02',supplierId:'s',supplierName:'Supplier',items:[],totalAmount:200,paidAmount:200,remainingAmount:0,paymentMethod:'نقدي',partnerName:'Owner',...patch});
const expense=(patch:Partial<Expense>={}):Expense=>({id:'expense',date:'2026-11-02',category:'إيجار',title:'Rent',amount:50,paidFrom:'خزنة الشركة',partnerName:'Owner',...patch});
const position=(state:ReturnType<typeof base>,from='2026-11-01',to='2026-11-30')=>financialPosition(state,from,to)!;
it('keeps an unconfigured balance distinct from a deliberately confirmed zero and preserves backups',()=>{
 expect(financialPosition(emptyStore,'2026-11-01','2026-11-30')).toBeNull();
 expect(position(base(0)).closing).toBe(0);
 const saved=base();expect(parseBackup(createBackup(saved)).financialOpenings).toEqual(saved.financialOpenings);
});
it('round-trips the exact opening and all correction evidence through a complete JSON backup',()=>{
 const before=base(),after=recordFinancialOpening(before,'2026-11-01',1100,'تصحيح المبلغ من عد الخزنة',actor);
 expect(after.financialOpenings).toHaveLength(1);expect(after.financialOpenings[0].history).toHaveLength(2);
 expect(parseBackup(createBackup(after)).financialOpenings).toEqual(after.financialOpenings);
 expect(before.financialOpenings[0].amount).toBe(1000);
 expect(()=>recordFinancialOpening(after,'2026-11-02',1100,'تغيير تاريخ البداية',actor)).toThrow('تاريخ');
});
it('separates income, credit, operating funds, stock cost, employee payouts and partner withdrawals',()=>{
 const state={...base(),salesInvoices:[sale({totalAmount:1000,subtotal:1000,paidAmount:150,remainingAmount:850,totalCost:600,netProfit:400}),sale({id:'old',date:'2026-10-15',paidAmount:90})],purchaseInvoices:[purchase()],accountPayments:[{id:'payment',date:'2026-11-03',targetType:'customer' as const,targetId:'c',targetName:'Customer',amount:50,partnerName:'Owner',allocations:[{invoiceId:'sale',amount:50}],openingBalanceAmount:0}],expenses:[expense(),expense({id:'withdraw',category:'مسحوبات شركاء',amount:25}),expense({id:'payroll',category:'رواتب ويوميات',amount:40}),expense({id:'pocket',amount:999,paidFrom:'من جيب الشريك'}),expense({id:'noncash',amount:777,paidFrom:'تسوية مخزون (بدون نقدية)'})],cashierDays:[{id:'day',date:'2026-11-03',status:'approved',financialReport:{fileName:'f.csv',sha256:'a'.repeat(64),uploadedAt:'now',totalRevenue:300},totalCost:200},{id:'pending',date:'2026-11-04',status:'pending',financialReport:{fileName:'p.csv',sha256:'b'.repeat(64),uploadedAt:'now',totalRevenue:900}}] as CashierDay[]};
 const result=position(state);expect(result).toMatchObject({opening:1000,inflow:450,outflow:315,resources:1450,closing:1135,issues:[]});
 const range={from:'2026-11-01',to:'2026-11-30',valid:true,label:'November'};
 const withOpening=buildReport(salesForReports(state),state.expenses,range),withoutOpening=buildReport(salesForReports({...state,financialOpenings:[]}),state.expenses,range);
 expect(withOpening).toEqual(withoutOpening);expect(withOpening.revenue).toBe(1300);
 expect(state.partners).toEqual(emptyStore.partners);
});
it('carries the closing cash to the next month without adding the opening twice',()=>{
 const state={...base(),salesInvoices:[sale(),sale({id:'december',date:'2026-12-02',paidAmount:200,totalAmount:200})]};
 expect(position(state).closing).toBe(1100);
 expect(position(state,'2026-12-01','2026-12-31')).toMatchObject({opening:1100,inflow:200,closing:1300});
 expect(financialPosition(state,'2026-10-01','2026-10-31')).toBeNull();
});
it('counts collection and its reversal at their dates and refunds a returned sale once',()=>{
 const state={...base(),salesInvoices:[sale({totalAmount:150,subtotal:150,paidAmount:100,remainingAmount:50,isReturned:true,returnedAt:'2026-11-05T10:00:00Z',returnRefundAmount:100,returnDebtReversed:50})],accountPayments:[{id:'payment',date:'2026-11-03',targetType:'customer' as const,targetId:'c',targetName:'Customer',amount:50,partnerName:'Owner',allocations:[{invoiceId:'sale',amount:50}],reversedAt:'2026-11-04T10:00:00Z'}]};
 expect(position(state)).toMatchObject({inflow:150,outflow:150,closing:1000});
});
it('includes collections against old debt without reintroducing October sales',()=>{
 const state={...base(),salesInvoices:[sale({date:'2026-10-15',paidAmount:50})],accountPayments:[{id:'payment',date:'2026-11-03',targetType:'customer' as const,targetId:'c',targetName:'Customer',amount:50,partnerName:'Owner',allocations:[{invoiceId:'sale',amount:50}]}]};
 expect(position(state)).toMatchObject({inflow:50,closing:1050});
});
it('keeps supplier refund claims out of cash until a receipt is recorded',()=>{
 const state={...base(),purchaseInvoices:[purchase({isCancelled:true,cancelledAt:'2026-11-03T10:00:00Z',refundDue:200})]};
 expect(position(state)).toMatchObject({inflow:0,outflow:200,pendingRefunds:200,closing:800});
});
it('reverses cash expenses across period boundaries without recounting payroll',()=>{
 const state={...base(),expenses:[expense({date:'2026-10-25',amount:25,isCancelled:true,cancelledAt:'2026-11-02T10:00:00Z'}),expense({id:'second',isCancelled:true,cancelledAt:'2026-12-02T10:00:00Z'})]};
 expect(position(state)).toMatchObject({inflow:25,outflow:50,closing:975});
 expect(position(state,'2026-12-01','2026-12-31')).toMatchObject({opening:975,inflow:50,closing:1025});
});
it('shows an unavailable balance for missing refund evidence or ambiguous legacy collections',()=>{
 expect(position({...base(),salesInvoices:[sale({isReturned:true,returnedAt:'2026-11-03T10:00:00Z'})]}).closing).toBeNull();
 expect(position({...base(),salesInvoices:[sale()],accountPayments:[{id:'old',date:'2026-11-03',targetType:'customer',targetId:'c',targetName:'Customer',amount:20,partnerName:'Owner'}]}).closing).toBeNull();
 expect(position({...base(),expenses:[expense({isCancelled:true})]}).closing).toBeNull();
});
it('rejects negative, fractional-cent and nonfinite openings instead of coercing them',()=>{
 for(const value of [-1,0.001,NaN,Infinity])expect(()=>base(value)).toThrow();
});
