import {beforeAll,beforeEach,afterAll,expect,it} from 'vitest';
import {setup,dispose,sql,literal} from './integration/postgres.mjs';
import {emptyStore,toCloud} from '../src/lib/storeState';
import {INITIAL_PARTNERS,INITIAL_ITEMS,INITIAL_CUSTOMERS,INITIAL_EMPLOYEES} from '../src/data/initialData';
import {recordEmployeeAction,reverseEmployeeAction,closePayrollPeriod,currentPayrollPeriod} from '../src/lib/payroll';
import {recordPayment,returnSale,recordExpense} from '../src/lib/ledger';
import {deductInventory} from '../src/lib/inventory';
import {adjustCatalogItem} from '../src/lib/catalogAdjustments';
import {businessDate} from '../src/lib/dates';
import type {StoreState} from '../src/lib/storeState';
import type {SalesInvoice,InventoryItem} from '../src/types/erp';
const active=!!process.env.AGOUZ_TEST_PG_CONTAINER;
const owner='11111111-1111-4111-8111-111111111111';
const state={...emptyStore,partners:[{...INITIAL_PARTNERS[0],id:'p1',sharePercent:100,totalPaidFromPocket:0,totalWithdrawals:0}]};
beforeAll(()=>{if(active){setup();sql(`insert into auth.users values('${owner}','test@local.test',now());insert into public.erp_members(user_id,username,partner_id,role)values('${owner}','owner','p1','partner');insert into bon_erp_private.owner_config(id,email)values(true,'test@local.test');`);}},120000);
function seed(store:StoreState){
  const fields=Object.entries(toCloud(store));
  sql(`delete from public.bon_elagouz_store;insert into public.bon_elagouz_store(id,version,${fields.map(([name])=>name).join(',')})values('main_store',0,${fields.map(([,value])=>literal(value)).join(',')});`);
}
beforeEach(()=>{if(active)seed(state);});
afterAll(()=>{if(active)dispose();});
function save(value:any){return sql(`begin;set local request.jwt.claim.sub='${owner}';set local role authenticated;select public.bon_erp_save_store(0,${literal(value)},gen_random_uuid(),null);rollback;`);}
const accept=(store:StoreState)=>expect(save(toCloud(store))).toContain('"version": 1');
const reject=(store:StoreState,reason:string)=>{expect(()=>save(toCloud(store))).toThrow(reason);expect(sql("select version from public.bon_elagouz_store where id='main_store'")).toBe('0');};
it.skipIf(!active)('accepts an actual complete store through the versioned API',()=>expect(save(toCloud(state))).toContain('"version": 1'));
it.skipIf(!active).each([
  ['missing-fields',{...toCloud(state),items:[{id:'bad'}]}],
  ['numeric-string',{...toCloud(state),partners:[{...state.partners[0],sharePercent:'100'}]}],
  ['invalid-shares',{...toCloud(state),partners:[{...state.partners[0],sharePercent:99}]}],
])('rejects malformed or inconsistent payloads on PostgreSQL: %s',(_,payload)=>{
  expect(()=>save(payload)).toThrow();expect(sql("select version from public.bon_elagouz_store where id='main_store'")).toBe('0');
});

const bean:InventoryItem={...INITIAL_ITEMS.find((item)=>item.category==='raw_bean')!,id:'bean',code:'B1',stock:10,openingStock:10,costPrice:1,supplierPrices:[]};
function sale(quantity=2,item=bean):SalesInvoice{
  const total=Number((quantity*2).toFixed(2)),cost=Number((quantity*item.costPrice).toFixed(2));
  return {id:'sale',invoiceNumber:'SALE-1',date:businessDate(),saleType:'retail',customerName:'Shop',items:[{itemId:item.id,itemName:item.name,category:item.category,quantity,unitLabel:item.baseUnit,normalizedQtyInBaseUnit:quantity,unitPrice:2,unitCost:item.costPrice,totalPrice:total,totalCost:cost,profit:Number((total-cost).toFixed(2))}],subtotal:total,discount:0,totalAmount:total,totalCost:cost,netProfit:Number((total-cost).toFixed(2)),paidAmount:total,remainingAmount:0,paymentMethod:'نقدي',partnerName:'Owner'};
}
function stockState():StoreState{return {...state,items:[{...bean}]};}
function sold(store:StoreState,invoice:SalesInvoice):StoreState{return {...store,items:deductInventory(invoice.items,store.items),salesInvoices:[invoice,...store.salesInvoices]};}
function workerState():StoreState{return {...state,employees:[{...INITIAL_EMPLOYEES[0],id:'worker',salaryType:'شهري',baseMonthlySalary:1000,payrollPeriod:currentPayrollPeriod(),openingPayable:0,workedDaysThisMonth:0,totalAdvances:0,totalDeductions:0,totalPaidOut:0,totalBonuses:0}]};}

it.skipIf(!active)('accepts an actual sale and refuses a forged nonnegative balance that hides an oversell',()=>{
  const before=stockState();seed(before);accept(sold(before,sale()));
  reject({...before,items:[{...bean,stock:0}],salesInvoices:[sale(11)]},'INVENTORY_MOVEMENT_MISMATCH');
});
it.skipIf(!active)('permits catalog count corrections only with a stocktaking journal',()=>{
  const before=stockState();seed(before);accept(adjustCatalogItem(before,bean.id,{stock:8},'Owner'));
  reject({...before,items:[{...bean,stock:8}]},'INVENTORY_MOVEMENT_MISMATCH');
});
it.skipIf(!active)('keeps drink components consumed on return and rejects restoring them',()=>{
  const raw={...bean,stock:1};
  const drink:InventoryItem={...bean,id:'drink',code:'D1',category:'drink_recipe',baseUnit:'piece',stock:999,costPrice:0.3,hasRecipe:true,recipe:[{ingredientId:bean.id,ingredientName:bean.name,quantity:300,unit:'gram'}]};
  const before={...stockState(),items:[raw,drink]};seed(before);accept(sold(before,sale(2,drink)));
  reject({...before,items:[{...raw,stock:0},drink],salesInvoices:[sale(4,drink)]},'INVENTORY_MOVEMENT_MISMATCH');
  const paid=sold(before,sale(2,drink));seed(paid);const returned=returnSale(paid,'sale','Owner');accept(returned);
  reject({...returned,items:returned.items.map((item)=>item.id==='bean'?{...item,stock:1}:item)},'INVENTORY_MOVEMENT_MISMATCH');
});
it.skipIf(!active)('restores directly sold goods on return and preserves the original invoice',()=>{
  const before=sold(stockState(),sale());seed(before);const returned=returnSale(before,'sale','Owner');accept(returned);
  reject({...returned,salesInvoices:[]},'IMMUTABLE_DOCUMENT');
});
it.skipIf(!active)('rejects an invalid calendar date and rewritten historical totals',()=>{
  const before=sold(stockState(),sale());seed(before);
  const invalid={...before,salesInvoices:[{...before.salesInvoices[0],date:'2026-02-30'}]};reject(invalid,'INVALID_BUSINESS_DATE');
  const rewritten={...before,salesInvoices:[{...before.salesInvoices[0],notes:'rewritten'}]};reject(rewritten,'IMMUTABLE_DOCUMENT');
});
it.skipIf(!active)('requires production to consume the configured recipe',()=>{
  const blend:InventoryItem={...bean,id:'blend',code:'M1',category:'manufactured_blend',stock:0,openingStock:0,hasRecipe:true,recipe:[{ingredientId:bean.id,ingredientName:bean.name,quantity:500,unit:'gram'}],costPrice:0.5};
  const before={...stockState(),items:[bean,blend]};seed(before);
  const batch={id:'batch',batchNumber:'P1',date:businessDate(),blendId:blend.id,blendName:blend.name,quantityProducedKg:2,unitCostPerKg:0.5,totalBatchCost:1,ingredientsConsumed:[{ingredientId:bean.id,ingredientName:bean.name,quantityUsed:1,displayQuantity:'1 kg',cost:1}],partnerName:'Owner'};
  accept({...before,items:[{...bean,stock:9},{...blend,stock:2}],productionBatches:[batch]});
  reject({...before,items:[bean,{...blend,stock:2}],productionBatches:[{...batch,unitCostPerKg:0,totalBatchCost:0,ingredientsConsumed:[]}]},'PRODUCTION_CONSUMPTION_MISMATCH');
});
it.skipIf(!active)('enforces actual debt, payment allocation and invoice settlement together',()=>{
  const customer={...INITIAL_CUSTOMERS[0],balance:100,totalSales:100,invoicesCount:1};
  const invoice={...sale(50),saleType:'wholesale' as const,customerId:customer.id,customerName:customer.name,paidAmount:0,remainingAmount:100,paymentMethod:'آجل' as const};
  const before={...stockState(),customers:[customer],salesInvoices:[invoice]};seed(before);
  accept(recordPayment(before,'customer',customer.id,40,'Owner'));
  const overpaid=recordPayment(before,'customer',customer.id,100,'Owner');
  reject({...overpaid,accountPayments:[{...overpaid.accountPayments[0],amount:101,openingBalanceAmount:1}]},'PAYMENT_EXCEEDS_DEBT');
  const undocumented=recordPayment(before,'customer',customer.id,40,'Owner');
  reject({...undocumented,accountPayments:[]},'INVOICE_PAYMENT_HISTORY_MISMATCH');
});
it.skipIf(!active)('links payroll counters, pocket funding and expense cancellation to their original movement',()=>{
  const before=workerState();seed(before);
  const paid=recordEmployeeAction(before,'worker','صرف راتب',400,'Salary','p1','من جيب الشريك');accept(paid);
  reject({...paid,partners:before.partners},'PARTNER_POCKET_HISTORY_MISMATCH');
  reject({...paid,employees:before.employees},'PAYROLL_COUNTER_HISTORY_MISMATCH');
  seed(paid);accept(reverseEmployeeAction(paid,paid.employeeTransactions[0].id,'Owner'));
});
it.skipIf(!active)('handles zero-rate daily attendance and its reversal without inventing days',()=>{
  const before={...workerState(),employees:workerState().employees.map((employee)=>({...employee,salaryType:'يومية' as const,dailyRate:0}))};seed(before);
  const attended=recordEmployeeAction(before,'worker','حضور يومية',0,'Attendance','p1');accept(attended);
  seed(attended);accept(reverseEmployeeAction(attended,attended.employeeTransactions[0].id,'Owner'));
});
it.skipIf(!active)('checks completed-month carry against the actual previous counters',()=>{
  const previous=new Date(currentPayrollPeriod()+'-01T12:00:00Z');previous.setUTCMonth(previous.getUTCMonth()-1);
  const before={...workerState(),employees:workerState().employees.map((employee)=>({...employee,payrollPeriod:previous.toISOString().slice(0,7),totalPaidOut:500}))};seed(before);
  const closed=closePayrollPeriod(before,'worker','p1');accept(closed);
  reject({...closed,employees:closed.employees.map((employee)=>({...employee,openingPayable:999}))},'PAYROLL_CARRY_HISTORY_MISMATCH');
});
it.skipIf(!active)('restricts snapshot restoration to the verified owner and separates it from normal saves',()=>{
  const before=stockState();seed(before);const restored={...before,items:[{...bean,stock:77}]};
  reject(restored,'INVENTORY_MOVEMENT_MISMATCH');
  const result=sql(`begin;set local request.jwt.claim.sub='${owner}';set local role authenticated;select public.bon_erp_restore_store(0,${literal(toCloud(restored))},gen_random_uuid());rollback;`);
  expect(result).toContain('"version": 1');
  const other='22222222-2222-4222-8222-222222222222';
  sql(`insert into auth.users values('${other}','other@local.test',now())on conflict do nothing;insert into public.erp_members(user_id,username,partner_id,role)values('${other}','other','p2','partner')on conflict do nothing;`);
  expect(()=>sql(`begin;set local request.jwt.claim.sub='${other}';set local role authenticated;select public.bon_erp_restore_store(0,${literal(toCloud(restored))},gen_random_uuid());rollback;`)).toThrow('OWNER_REQUIRED');
});
it.skipIf(!active)('does not expose privileged validation helpers or direct table updates',()=>{
  expect(sql("select has_function_privilege('authenticated','bon_erp_private.validate_changes(jsonb,jsonb)','EXECUTE')")).toBe('f');
  expect(()=>sql("begin;set local role authenticated;update public.bon_elagouz_store set items='[]' where id='main_store';rollback;")).toThrow('permission denied');
});
