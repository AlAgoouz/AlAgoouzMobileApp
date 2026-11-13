import {beforeAll,beforeEach,afterAll,expect,it} from 'vitest';
import {setup,dispose,sql,literal} from './integration/postgres.mjs';
import {emptyStore,toCloud} from '../src/lib/storeState';
import {INITIAL_PARTNERS,INITIAL_ITEMS,INITIAL_CUSTOMERS,INITIAL_EMPLOYEES} from '../src/data/initialData';
import {recordEmployeeAction,reverseEmployeeAction,closePayrollPeriod,currentPayrollPeriod} from '../src/lib/payroll';
import {recordPayment,returnSale,recordExpense} from '../src/lib/ledger';
import {deductInventory} from '../src/lib/inventory';
import {adjustCatalogItem} from '../src/lib/catalogAdjustments';
import {businessDate} from '../src/lib/dates';
import {receiveStock} from '../src/lib/costing';
import {recordFinancialOpening,financialPosition} from '../src/lib/financialOpening';
import {completeCatalogNameDraft,changeCatalogNameDraft} from '../src/lib/catalogNameDrafts';
import {recordRecipeDefinition,activateRecipeDraft,updateCatalogRecipe} from '../src/lib/recipeCatalog';
import {attachCashierReport,approveCashierDay} from '../src/lib/cashierDays';
import {salesForReports} from '../src/lib/cashierDays';
import {buildReport,reportRange,reportPoints} from '../src/lib/reporting';
import {dashboardSchema,salesPageSchema} from '../src/lib/readModels';
import type {StoreState} from '../src/lib/storeState';
import type {SalesInvoice,InventoryItem} from '../src/types/erp';
const active=!!process.env.AGOUZ_TEST_PG_CONTAINER;
const owner='11111111-1111-4111-8111-111111111111';
function readJson(query:string){return JSON.parse(asUser(owner,query).split('\n').at(-1)!);}
const state={...emptyStore,partners:[{...INITIAL_PARTNERS[0],id:'p1',sharePercent:100,totalPaidFromPocket:0,totalWithdrawals:0}]};
function asUser(id:string,query:string){return sql(`begin;select set_config('request.jwt.claim.sub','${id}',true);set local role authenticated;${query};rollback;`);}
function userAccessFixture(id:string,permissions:Record<string,boolean>,role='partner',disabled=false){
 sql(`insert into auth.users values('${id}','user-${id}@local.test',now());`);
 sql(`begin;select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;select public.bon_erp_set_user_access('${id}','user_${id.slice(-4)}','Employee','${role}',null,${literal(permissions)},${disabled},false);commit;`);
}
it.skipIf(!active)('creates an unlinked login membership without adding or changing financial partners',()=>{
 const id='22222222-2222-4222-8222-222222220001';const before=sql("select partners::text from public.bon_elagouz_store where id='main_store'");
 userAccessFixture(id,{view:true,sales:true});
 expect(sql("select partners::text from public.bon_elagouz_store where id='main_store'")).toBe(before);
 const access=asUser(id,"select public.bon_erp_my_access()");expect(access).toContain('"partner_id": null');expect(access).toContain('"is_owner": false');
 expect(sql(`select count(*) from bon_erp_private.user_access_events where actor_id='${owner}' and target_id='${id}'`)).toBe('1');
});
it.skipIf(!active)('protects the master against direct deletion, disabling and permission reduction',()=>{
 for(const statement of [`delete from auth.users where id='${owner}'`,`delete from public.erp_members where user_id='${owner}'`,`update public.erp_members set disabled_at=now() where user_id='${owner}'`,`update public.erp_members set access_permissions='{}' where user_id='${owner}'`])expect(()=>sql(statement)).toThrow('MASTER_ACCOUNT_PROTECTED');
});
it.skipIf(!active)('keeps a read-only unlinked account out of writes and account administration',()=>{
 const id='22222222-2222-4222-8222-222222220002';userAccessFixture(id,{view:true});
 expect(asUser(id,"select count(*) from public.bon_elagouz_store").split('\n').at(-1)).toBe('1');
 expect(()=>asUser(id,`select public.bon_erp_save_store(0,${literal(toCloud(state))},'${crypto.randomUUID()}')`)).toThrow('USER_PERMISSION_DENIED');
 expect(()=>asUser(id,'select public.bon_erp_list_users()')).toThrow('OWNER_REQUIRED');
 expect(()=>asUser(id,`select public.bon_erp_set_user_access('${id}','self_admin','Self','partner',null,'{"view":true,"partners":true}',false,false)`)).toThrow('OWNER_REQUIRED');
});
it.skipIf(!active)('enforces section permissions in the database even when the client is bypassed',()=>{
 const salesId='22222222-2222-4222-8222-222222220003',catalogId='22222222-2222-4222-8222-222222220004';
 userAccessFixture(salesId,{view:true,sales:true});userAccessFixture(catalogId,{view:true,catalog:true});
 const before=stockState();seed(before);const next={...before,items:[{...bean,name:'Renamed by catalog editor'}]};
 expect(()=>asUser(salesId,`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}')`)).toThrow('USER_PERMISSION_DENIED');
 expect(()=>asUser(catalogId,`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}')`)).not.toThrow();
});
it.skipIf(!active)('keeps cashier accounts upload-only and revokes upload immediately when disabled',()=>{
 const id='22222222-2222-4222-8222-222222220005';userAccessFixture(id,{},'cashier');
 expect(asUser(id,'select count(*) from public.bon_elagouz_store').split('\n').at(-1)).toBe('0');
 const upload=`select public.bon_erp_enqueue_export('cashier.csv','2026-11-03','[{"Name":"Coffee","Quantity":1}]','${'c'.repeat(64)}')`;
 expect(()=>asUser(id,upload)).not.toThrow();
 sql(`update public.erp_members set disabled_at=now() where user_id='${id}'`);
 expect(asUser(id,'select public.bon_erp_my_access() is null').split('\n').at(-1)).toBe('t');
 expect(()=>asUser(id,upload)).toThrow('USER_PERMISSION_DENIED');
});
it.skipIf(!active)('allows the master to unlink its financial profile while keeping its system identity',()=>{
 const query=`select public.bon_erp_set_user_access('${owner}','owner','Owner','partner',null,'{"view":true,"catalog":true,"purchases":true,"sales":true,"cashier":true,"production":true,"stocktaking":true,"contacts":true,"collections":true,"staff":true,"expenses":true,"partners":true}',false,false);select public.bon_erp_my_access()`;
 const result=asUser(owner,query);expect(result).toContain('"partner_id": null');expect(result).toContain('"is_owner": true');
});
it.skipIf(!active)('keeps master protection bound to identity across email changes and rejects old-email impersonation',()=>{
 const other='22222222-2222-4222-8222-222222220006';userAccessFixture(other,{view:true});
 expect(sql(`begin;update auth.users set email='changed@local.test',email_confirmed_at=null where id='${owner}';update auth.users set email='test@local.test' where id='${other}';select bon_erp_private.is_master('${owner}'),bon_erp_private.is_master('${other}');rollback;`)).toBe('t|f');
});
beforeAll(()=>{if(active){setup();sql(`insert into auth.users values('${owner}','test@local.test',now());insert into public.erp_members(user_id,username,partner_id,role)values('${owner}','owner','p1','partner');insert into bon_erp_private.owner_config(id,email,owner_user_id)values(true,'test@local.test','${owner}');`);}},120000);
function seed(store:StoreState){
  const fields=Object.entries(toCloud(store));
  // Opening-balance triggers require the owner's identity even for a disposable
  // fixture inserted by postgres. Keep the real authorization checks enabled.
  sql(`begin;set local request.jwt.claim.sub='${owner}';delete from public.bon_elagouz_store;insert into public.bon_elagouz_store(id,version,${fields.map(([name])=>name).join(',')})values('main_store',0,${fields.map(([,value])=>literal(value)).join(',')});commit;`);
}
beforeEach(()=>{if(active){seed(state);sql('truncate table bon_erp_private.import_jobs,public.cashier_sync_queue;delete from storage.objects where bucket_id=\'agouz-cashier-imports\';');}});
afterAll(()=>{if(active)dispose();});
it.skipIf(!active)('publishes only the approved menu snapshot without granting access to drafts or ERP data',()=>{
 const employee='22222222-2222-4222-8222-222222220093';
 userAccessFixture(employee,{view:true,catalog:true});
 const draft={image:'data:image/jpeg;base64,/9j/2Q=='};
 const updated={image:'data:image/jpeg;base64,/9j//9k='};
 const rpc=(revision:number,content:unknown,publish:boolean)=>`select public.agouz_save_menu(${revision},${literal(content)},${publish})`;
 const ownerSave=(revision:number,content:unknown,publish:boolean)=>sql(`begin;set local request.jwt.claim.sub='${owner}';set local role authenticated;${rpc(revision,content,publish)};commit;`);
 const anon=(query:string)=>sql(`begin;set local role anon;${query};rollback;`);
 const draftCount='select count(*) from public.agouz_menu_draft';
 const publication='select content from public.agouz_menu_publication';
 expect(anon(publication)).toBe('');
 expect(()=>anon(draftCount)).toThrow('permission denied');
 expect(()=>anon(rpc(0,draft,true))).toThrow('permission denied');
 expect(()=>asUser(employee,rpc(0,draft,true))).toThrow('OWNER_REQUIRED');
 expect(()=>asUser(owner,"insert into public.agouz_menu_publication(content) values('{}')")).toThrow('permission denied');
 expect(()=>ownerSave(0,{...draft,costPrice:23},true)).toThrow('INVALID_MENU');
 for (const image of ['https://example.test/menu.jpg','data:image/svg+xml;base64,AA==','data:image/jpeg;base64,AA==']) {
  expect(()=>ownerSave(0,{image},true)).toThrow('INVALID_MENU');
 }
 expect(()=>ownerSave(0,{image:draft.image+'A'.repeat(1200000)},true)).toThrow('INVALID_MENU');
 expect(ownerSave(0,draft,false)).toBe('1');
 expect(asUser(employee,draftCount).split('\n').at(-1)).toBe('0');
 expect(anon(publication)).toBe('');
 expect(ownerSave(1,draft,true)).toBe('2');
 expect(JSON.parse(anon(publication))).toEqual(draft);
 expect(ownerSave(2,updated,false)).toBe('3');
 expect(()=>ownerSave(2,updated,true)).toThrow('MENU_REVISION_CONFLICT');
 expect(JSON.parse(anon(publication))).toEqual(draft);
 expect(ownerSave(3,updated,true)).toBe('4');
 expect(JSON.parse(anon(publication))).toEqual(updated);
 const canRestore='select public.agouz_menu_restore_available()';
 const restore=(revision:number)=>'select public.agouz_restore_menu_image('+revision+')';
 expect(asUser(owner,canRestore).split('\n').at(-1)).toBe('t');
 expect(asUser(employee,canRestore).split('\n').at(-1)).toBe('f');
 expect(()=>anon(restore(4))).toThrow('permission denied');
 expect(()=>asUser(employee,restore(4))).toThrow('OWNER_REQUIRED');
 expect(()=>asUser(owner,restore(3))).toThrow('MENU_REVISION_CONFLICT');
 expect(JSON.parse(sql("begin;set local request.jwt.claim.sub='"+owner+"';set local role authenticated;"+restore(4)+";commit;"))).toEqual({revision:5,content:draft});
 expect(JSON.parse(anon(publication))).toEqual(draft);
});
it.skipIf(!active)('exports only the requested period with matching authoritative totals and no write effects',()=>{
 const today=businessDate(),invoices=[{...sale(),id:'in-range',date:today},{...sale(),id:'outside',date:'2020-01-01'}];
 const source={...stockState(),salesInvoices:invoices};seed(source);
 const before=sql("select row_to_json(s)::text from public.bon_elagouz_store s where id='main_store'");
 const report=readJson(`select public.bon_erp_export_report_v2('${today}','${today}')`);
 expect(report.sales_invoices.map((row:SalesInvoice)=>row.id)).toEqual(['in-range']);
 expect(report.summary).toEqual(readJson(`select public.bon_erp_dashboard_v2('${today}','${today}')`));
 expect(report.summary.report.revenue).toBe(invoices[0].totalAmount);
 expect(report.version).toBe(report.summary.version);
 expect(sql("select row_to_json(s)::text from public.bon_elagouz_store s where id='main_store'")).toBe(before);
 expect(()=>asUser(owner,"select public.bon_erp_export_report_v2('2026-02-30','2026-03-01')")).toThrow();
});
it.skipIf(!active)('checks live report export access and refuses unbounded arrays',()=>{
 const viewer='22222222-2222-4222-8222-222222220091',cashier='22222222-2222-4222-8222-222222220092';
 userAccessFixture(viewer,{view:true});userAccessFixture(cashier,{},'cashier');
 const query="select public.bon_erp_export_report_v2('0001-01-01','9999-12-31')";
 expect(()=>asUser(viewer,query)).not.toThrow();
 expect(()=>asUser(cashier,query)).toThrow('USER_PERMISSION_DENIED');
 sql(`update public.erp_members set disabled_at=now() where user_id='${viewer}'`);
 expect(()=>asUser(viewer,query)).toThrow('USER_PERMISSION_DENIED');
 expect(()=>sql(`begin;set local role anon;${query};rollback;`)).toThrow('permission denied');
 sql("update public.bon_elagouz_store set suppliers=(select jsonb_agg(jsonb_build_object('id',n::text,'name','Supplier '||n,'phone','01012345678','address','Cairo','representativeName','Agent','category','Coffee','balance',0,'totalPurchases',0,'invoicesCount',0)) from generate_series(1,10001)n) where id='main_store'");
 expect(()=>asUser(owner,query)).toThrow('EXPORT_ROW_LIMIT');
});
it.skipIf(!active)('matches bounded dashboard figures to the established financial reporting rules',()=>{
 const paired=cashierPair().posted;
 const invoices=[{...sale(),id:'active',date:businessDate()},{...sale(),id:'returned',isReturned:true,date:businessDate()}];
 const expenses=[{id:'exp',title:'Daily',date:businessDate(),category:'إيجار',amount:3,paidFrom:'درج المحل',partnerName:'Owner'},{id:'withdrawal',title:'Owner',date:businessDate(),category:'مسحوبات شركاء',amount:999,paidFrom:'درج المحل',partnerName:'Owner'},{id:'cancelled',title:'Cancelled',date:businessDate(),category:'إيجار',amount:999,paidFrom:'درج المحل',partnerName:'Owner',isCancelled:true}] as StoreState['expenses'];
 const source={...paired,salesInvoices:invoices,expenses};seed(source);
 const range=reportRange({kind:'all',from:'',to:''}),expected=buildReport(salesForReports(source),expenses,range);
 const result=dashboardSchema.parse(readJson("select public.bon_erp_dashboard_v2('0001-01-01','9999-12-31')"));
 for(const field of ['revenue','cost','gross','spent','net','margin'] as const)expect(result.report[field]).toBeCloseTo(expected[field],8);
 expect(result.report.count).toBe(expected.active.length);expect(result.balances.inventory).toBe(-0.5);expect(result.approved).toBe(1);
 expect(reportPoints(result.report.entries,range,result.report.firstDate,result.report.lastDate)).toEqual(expected.points);
 expect(result.products[0].revenue).toBe(invoices[0].items[0].totalPrice);
 expect(JSON.stringify(result)).not.toContain('financial.xlsx');
});
it.skipIf(!active)('preserves sparse month and year charts without returning invoice history',()=>{
 for(const dates of [['2026-01-01','2026-12-31'],['2000-01-01','2026-12-31'],['1800-01-01','2026-12-31']]){
  const invoices=dates.map((date,i)=>({...sale(),date,id:'chart-'+i}));seed({...stockState(),salesInvoices:invoices});
  const range=reportRange({kind:'all',from:'',to:''}),expected=buildReport(invoices,[],range);
  const model=dashboardSchema.parse(readJson("select public.bon_erp_dashboard_v2('0001-01-01','9999-12-31')"));
  expect(reportPoints(model.report.entries,range,model.report.firstDate,model.report.lastDate)).toEqual(expected.points);
  expect(model.report.entries.length).toBeLessThanOrEqual(2);
 }
});
it.skipIf(!active)('counts financial-only cashier reports and opening funds without claiming missing cost or posting stock',()=>{
 let source=recordFinancialOpening(stockState(),'2026-11-01',1000,'Opening settled period',{id:owner,name:'Owner'});
 for(let n=1;n<=4;n++)source=attachCashierReport(source,`2026-11-0${n}`,{type:'financial',file:{fileName:`report${n}.xls`,sha256:String(n).repeat(64),uploadedAt:'2026-11-05T10:00:00Z'},totalRevenue:n*100});
 seed(source);const fingerprint=sql("select md5(to_jsonb(s)::text) from public.bon_elagouz_store s where id='main_store'");
 const model=dashboardSchema.parse(readJson("select public.bon_erp_dashboard_v2('2026-11-01','2026-11-04')"));
 expect(model.report).toMatchObject({revenue:1000,count:4,cost:null,gross:null,net:null,margin:null,pendingCostDays:4});
 expect(model.report.entries.map(e=>e.profit)).toEqual([null,null,null,null]);
 expect(model.cash).toEqual(financialPosition(source,'2026-11-01','2026-11-04'));
 expect(model.cash).toMatchObject({opening:1000,inflow:1000,resources:2000,closing:2000});
 expect(model.channels.find(c=>c.id==='cashier_sync')?.value).toBe(1000);expect(model.approved).toBe(0);expect(model.pending).toBe(4);
 const exported=readJson("select public.bon_erp_export_report_v2('2026-11-01','2026-11-04')");expect(exported.summary).toEqual(model);expect(exported.cashier_days).toHaveLength(4);
 const later=dashboardSchema.parse(readJson("select public.bon_erp_dashboard_v2('2026-11-03','2026-11-04')"));
 expect(later.cash).toMatchObject({opening:1300,inflow:700,resources:2000,closing:2000});expect(later.report.revenue).toBe(700);
 expect(sql("select md5(to_jsonb(s)::text) from public.bon_elagouz_store s where id='main_store'")).toBe(fingerprint);
});
it.skipIf(!active)('keeps the same revenue and cash when a financial day later gets its inventory cost',()=>{
 const paired=cashierPair();let pending=recordFinancialOpening(paired.pending,'2026-11-01',1000,'Opening settled period',{id:owner,name:'Owner'});seed(pending);
 const before=dashboardSchema.parse(readJson(`select public.bon_erp_dashboard_v2('2026-11-01','${businessDate()}')`));
 const posted=approveCashierDay(pending,pending.cashierDays[0].id,'Owner');seed(posted);
 const after=dashboardSchema.parse(readJson(`select public.bon_erp_dashboard_v2('2026-11-01','${businessDate()}')`));
 expect(after.report.revenue).toBe(before.report.revenue);expect(after.cash).toEqual(before.cash);expect(before.report.net).toBeNull();expect(after.report.net).not.toBeNull();expect(after.report.pendingCostDays).toBe(0);
});
it.skipIf(!active)('reconciles server cash with collections, allocations, cancellations and noncash exclusions',()=>{
 const initial=recordFinancialOpening(stockState(),'2026-11-01',1000,'Opening settled period',{id:owner,name:'Owner'});
 const source={...initial,salesInvoices:[{...sale(),id:'sale-cash',date:'2026-11-01',customerId:'c',paidAmount:40,totalAmount:60,remainingAmount:20,isReturned:true,returnedAt:'2026-11-03T10:00:00Z',returnRefundAmount:20,returnDebtReversed:20}],accountPayments:[{id:'collection',date:'2026-11-02',targetType:'customer' as const,targetId:'c',targetName:'Customer',amount:20,partnerName:'Owner',allocations:[{invoiceId:'sale-cash',amount:20}]}],expenses:[{id:'expense',date:'2026-11-02',category:'إيجار',title:'Rent',amount:10,paidFrom:'خزنة الشركة',partnerName:'Owner',isCancelled:true,cancelledAt:'2026-11-04T10:00:00Z'},{id:'noncash',date:'2026-11-02',category:'نثريات أخرى',title:'Cost',amount:15,paidFrom:'تسوية مخزون (بدون نقدية)',partnerName:'Owner'}]};
 seed(source);expect(readJson("select public.bon_erp_cash_summary('2026-11-01','2026-11-04')")).toEqual(financialPosition(source,'2026-11-01','2026-11-04'));
 seed({...source,salesInvoices:[{...source.salesInvoices[0],returnRefundAmount:undefined}]});expect(readJson("select public.bon_erp_cash_summary('2026-11-01','2026-11-04')").closing).toBeNull();
});
it.skipIf(!active)('bounds invoice pages and searches line names across the entire history',()=>{
 const invoices=Array.from({length:121},(_,i)=>({...sale(),id:'history-'+String(i).padStart(3,'0'),invoiceNumber:'SEARCH-'+i,items:[{...sale().items[0],itemName:i===120?'Unique ingredient':'Ordinary'}]}));seed({...stockState(),salesInvoices:invoices});
 const first=salesPageSchema.parse(readJson("select public.bon_erp_sales_page('legacy','',0,50)"));expect(first.total).toBe(121);expect(first.rows).toHaveLength(50);expect(first.rows[0].items).toBeUndefined();
 const second=salesPageSchema.parse(readJson("select public.bon_erp_sales_page('legacy','',50,50)"));expect(second.rows[0].id).not.toBe(first.rows[0].id);
 const searched=salesPageSchema.parse(readJson("select public.bon_erp_sales_page('legacy','Unique ingredient',0,50)"));expect(searched.total).toBe(1);expect(searched.rows[0].id).toBe('history-120');
 const detail=readJson("select public.bon_erp_sale_detail('history-120','invoice')");expect(detail.items[0].itemName).toBe('Unique ingredient');
 expect(()=>asUser(owner,"select public.bon_erp_sales_page('legacy','',0,51)")).toThrow('INVALID_PAGE');
 expect(()=>asUser(owner,"select public.bon_erp_dashboard_v2('2026-02-30','2026-03-01')")).toThrow();
});
it.skipIf(!active)('keeps read APIs caller-authorized and immediately refuses disabled and cashier accounts',()=>{
 const viewer='22222222-2222-4222-8222-222222229101',cashier='22222222-2222-4222-8222-222222229102';userAccessFixture(viewer,{view:true});userAccessFixture(cashier,{},'cashier');
 const query="select public.bon_erp_dashboard_v2('0001-01-01','9999-12-31')";
 expect(()=>asUser(viewer,query)).not.toThrow();expect(()=>asUser(cashier,query)).toThrow('USER_PERMISSION_DENIED');
 sql(`update public.erp_members set disabled_at=now() where user_id='${viewer}'`);expect(()=>asUser(viewer,query)).toThrow('USER_PERMISSION_DENIED');
 expect(()=>sql('set role anon;'+query)).toThrow('permission denied');
 const cashQuery="select public.bon_erp_cash_summary('2026-11-01','2026-11-04')";
 expect(()=>asUser(cashier,cashQuery)).toThrow('USER_PERMISSION_DENIED');expect(()=>asUser(viewer,cashQuery)).toThrow('USER_PERMISSION_DENIED');expect(()=>sql('set role anon;'+cashQuery)).toThrow('permission denied');
 expect(sql("select bool_and(not p.prosecdef) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('bon_erp_dashboard_v2','bon_erp_cash_summary','bon_erp_export_report_v2','bon_erp_sales_page','bon_erp_sale_detail','bon_erp_item_search')")).toBe('t');
});
function save(value:any){return sql(`begin;set local request.jwt.claim.sub='${owner}';set local role authenticated;select public.bon_erp_save_store(0,${literal(value)},gen_random_uuid(),null);rollback;`);}
const accept=(store:StoreState)=>expect(save(toCloud(store))).toContain('"version": 1');
const reject=(store:StoreState,reason:string)=>{expect(()=>save(toCloud(store))).toThrow(reason);expect(sql("select version from public.bon_elagouz_store where id='main_store'")).toBe('0');};
const nameDraft={id:'legacy-draft',name:'Imported name',sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'a'.repeat(40),sourcePath:'source.ts',importedAt:'2026-11-05T00:00:00.000Z'};
const drinkDefinition={code:'DR-1',category:'drink_recipe' as const,baseUnit:'piece' as const,retailPrice:20,openingStock:0,minStock:0};
const coffeeRecipe=[{ingredientId:'bean',ingredientName:'Coffee',quantity:18,unit:'gram' as const}];
it.skipIf(!active)('keeps imported and manual recipe definitions nonoperational and restores their complete metadata',()=>{
 const source=stockState();seed(source);
 const imported={...source,catalogNameDrafts:[nameDraft]};
 const defined=recordRecipeDefinition(recordRecipeDefinition(imported,nameDraft.id,nameDraft.name,drinkDefinition,{name:'Owner'}),'manual','Seasoning',{...drinkDefinition,code:'SE-1',category:'seasoning_recipe',baseUnit:'kg'},{name:'Owner'});
 const result=readJson(`select public.bon_erp_save_store(0,${literal(toCloud(defined))},'${crypto.randomUUID()}');select jsonb_build_object('drafts',catalog_name_drafts,'items',items,'sales',sales_invoices,'production',production_batches,'expenses',expenses) from public.bon_elagouz_store`);
 expect(result).toEqual({drafts:defined.catalogNameDrafts,items:source.items,sales:[],production:[],expenses:[]});
 expect(readJson(`select public.bon_erp_restore_store(0,${literal(toCloud(defined))},'${crypto.randomUUID()}');select catalog_name_drafts from public.bon_elagouz_store`)).toEqual(defined.catalogNameDrafts);
});
it.skipIf(!active)('reserves pending codes against both other definitions and operational item edits',()=>{
 const pending=recordRecipeDefinition(stockState(),'pending','Drink',drinkDefinition,{name:'Owner'});seed(pending);
 const duplicate={...pending,catalogNameDrafts:[...pending.catalogNameDrafts,{...pending.catalogNameDrafts[0],id:'other',name:'Another drink'}]};reject(duplicate,'RECIPE_DEFINITION_CODE_OR_NAME_USED');
 reject({...pending,items:pending.items.map(i=>({...i,code:'dr-1'}))},'RECIPE_DEFINITION_CODE_OR_NAME_USED');
 for(const definition of [{...drinkDefinition,baseUnit:'kg'},{...drinkDefinition,openingStock:1},{...drinkDefinition,code:' B2 '}])reject({...pending,catalogNameDrafts:[{...pending.catalogNameDrafts[0],definition}]} as StoreState,'INVALID_RECIPE_DEFINITION');
});
it.skipIf(!active)('requires catalog permission for recipe definitions and preserves their provenance against stale clients',()=>{
 const source=stockState(),pending=recordRecipeDefinition({...source,catalogNameDrafts:[nameDraft]},nameDraft.id,nameDraft.name,drinkDefinition,{name:'Owner'});seed(source);
 const production='22222222-2222-4222-8222-222222220088',catalog='22222222-2222-4222-8222-222222220089';userAccessFixture(production,{view:true,production:true});userAccessFixture(catalog,{view:true,catalog:true});
 expect(()=>asUser(production,`select public.bon_erp_save_store(0,${literal(toCloud(pending))},'${crypto.randomUUID()}')`)).toThrow('USER_PERMISSION_DENIED');
 expect(()=>asUser(catalog,`select public.bon_erp_save_store(0,${literal(toCloud(pending))},'${crypto.randomUUID()}')`)).not.toThrow();
 seed(pending);reject({...pending,catalogNameDrafts:[nameDraft]},'RECIPE_DEFINITION_CLIENT_UPGRADE_REQUIRED');
 reject({...pending,catalogNameDrafts:[{...pending.catalogNameDrafts[0],sourceCommit:'b'.repeat(40)}]},'CATALOG_DRAFT_SOURCE_IMMUTABLE');
});
it.skipIf(!active)('activates complete recipes atomically without consuming ingredients or creating production',()=>{
 const pending=recordRecipeDefinition(stockState(),'pending','Drink',drinkDefinition,{name:'Owner'});seed(pending);
 const ready=activateRecipeDraft(pending,'pending',coffeeRecipe,{name:'Owner'});accept(ready);
 const result=readJson(`select public.bon_erp_save_store(0,${literal(toCloud(ready))},'${crypto.randomUUID()}');select jsonb_build_object('drafts',catalog_name_drafts,'items',items,'production',production_batches,'sales',sales_invoices) from public.bon_elagouz_store`);
 expect(result).toEqual({drafts:[],items:ready.items,production:[],sales:[]});expect(result.items.find((i:InventoryItem)=>i.id==='bean')).toEqual(pending.items[0]);
 const invalid={...ready,items:ready.items.map(i=>i.code==='DR-1'?{...i,recipe:[]}:i)};reject(invalid,'EMPTY_RECIPE');
 const unregistered={...pending,salesInvoices:[sale(1,{...bean,id:'pending'})]};expect(()=>save(toCloud(unregistered))).toThrow();
});
it.skipIf(!active)('updates a blend recipe without rewriting its inventory average or recorded transactions',()=>{
 const pending=recordRecipeDefinition(stockState(),'blend','Blend',{...drinkDefinition,code:'BL-1',category:'manufactured_blend',baseUnit:'kg',openingStock:2},{name:'Owner'});
 const ready=activateRecipeDraft(pending,'blend',[{...coffeeRecipe[0],quantity:1000}],{name:'Owner'});seed(ready);const blend=ready.items.find(i=>i.code==='BL-1')!;
 const next=updateCatalogRecipe(ready,blend,[{...coffeeRecipe[0],quantity:500}],{name:'Owner'});accept(next);
 const result=readJson(`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}');select jsonb_build_object('items',items,'production',production_batches,'sales',sales_invoices,'purchases',purchase_invoices,'audits',stocktaking_records) from public.bon_elagouz_store`);
 expect(result.items.find((i:InventoryItem)=>i.id===blend.id)).toMatchObject({stock:2,costPrice:blend.costPrice,recipe:[{...coffeeRecipe[0],quantity:500}]});
 expect(result.production).toEqual([]);expect(result.sales).toEqual([]);expect(result.purchases).toEqual([]);expect(result.audits).toEqual([]);
});
it.skipIf(!active)('drops withdrawn price metadata from stale clients and restores without altering manually entered product prices',()=>{
 const existing=stockState();seed(existing);
 const pending={...existing,catalogNameDrafts:[nameDraft]},stale={...pending,catalogNameDrafts:[{...nameDraft,legacyPrices:{purchasePrice:45,salePrice:65,sourceKind:'github_seed'}}]};
 // Reproduce data written before the compensating migration in this disposable
 // validation database. All triggers are re-enabled on transaction completion.
 sql(`begin;set local session_replication_role=replica;update public.bon_elagouz_store set catalog_name_drafts=${literal(stale.catalogNameDrafts)};commit;`);
 const payload={...toCloud(pending),catalog_name_drafts:stale.catalogNameDrafts};
 const result=readJson(`select public.bon_erp_save_store(0,${literal(payload)},'${crypto.randomUUID()}');select jsonb_build_object('drafts',catalog_name_drafts,'items',items,'partners',partners,'sales',sales_invoices,'expenses',expenses) from public.bon_elagouz_store`);
 expect(result).toEqual({drafts:pending.catalogNameDrafts,items:existing.items,partners:existing.partners,sales:[],expenses:[]});
 expect(readJson(`select public.bon_erp_restore_store(0,${literal(payload)},'${crypto.randomUUID()}');select catalog_name_drafts from public.bon_elagouz_store`)).toEqual(pending.catalogNameDrafts);
 const employee='22222222-2222-4222-8222-222222220099';userAccessFixture(employee,{view:true,expenses:true});
 expect(JSON.parse(asUser(employee,`select public.bon_erp_save_store(0,${literal(payload)},'${crypto.randomUUID()}');select catalog_name_drafts from public.bon_elagouz_store`).split('\n').at(-1)!)).toEqual(pending.catalogNameDrafts);
});
it.skipIf(!active)('authorizes catalog name rename and deletion without changing inventory or accounting',()=>{
 seed(stockState());const pending={...stockState(),catalogNameDrafts:[nameDraft]};
 sql(`begin;set local request.jwt.claim.sub='${owner}';update public.bon_elagouz_store set catalog_name_drafts=${literal(pending.catalogNameDrafts)};commit;`);
 const renamed=changeCatalogNameDraft(pending,nameDraft.id,'Corrected name'),removed=changeCatalogNameDraft(pending,nameDraft.id,null);accept(renamed);accept(removed);
 const employee='22222222-2222-4222-8222-222222220097';userAccessFixture(employee,{view:true,expenses:true});
 for(const next of [renamed,removed])expect(()=>asUser(employee,`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}')`)).toThrow('USER_PERMISSION_DENIED');
 const result=readJson(`select public.bon_erp_save_store(0,${literal(toCloud(removed))},'${crypto.randomUUID()}');select jsonb_build_object('drafts',catalog_name_drafts,'items',items,'sales',sales_invoices,'expenses',expenses,'partners',partners) from public.bon_elagouz_store`);
 expect(result).toEqual({drafts:[],items:pending.items,sales:pending.salesInvoices,expenses:pending.expenses,partners:pending.partners});
});
it.skipIf(!active)('keeps pending names separate from accounting and enforces catalog access on the server',()=>{
 seed(stockState());const next={...stockState(),catalogNameDrafts:[nameDraft]};accept(next);
 const employee='22222222-2222-4222-8222-222222220095';userAccessFixture(employee,{view:true,expenses:true});
 expect(()=>asUser(employee,`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}')`)).toThrow('USER_PERMISSION_DENIED');
 const catalog='22222222-2222-4222-8222-222222220096';userAccessFixture(catalog,{view:true,catalog:true});
 expect(()=>asUser(catalog,`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}')`)).not.toThrow();
 const duplicate={...next,catalogNameDrafts:[nameDraft,{...nameDraft,id:'dup'}]};reject(duplicate,'DUPLICATE_CATALOG_DRAFT');
});
it.skipIf(!active)('activates one completed definition atomically and preserves pending names for old clients',()=>{
 seed(stockState());const pending={...stockState(),catalogNameDrafts:[nameDraft]};
 sql(`begin;set local request.jwt.claim.sub='${owner}';update public.bon_elagouz_store set catalog_name_drafts=${literal(pending.catalogNameDrafts)};commit;`);
 const {id,...definition}={...bean,name:nameDraft.name,code:'NEW-1',stock:0,openingStock:0};
 const ready=completeCatalogNameDraft(pending,nameDraft.id,definition);accept(ready);
 const result=readJson(`select public.bon_erp_save_store(0,${literal(toCloud(ready))},'${crypto.randomUUID()}');select jsonb_build_object('drafts',catalog_name_drafts,'items',jsonb_array_length(items),'sales',sales_invoices,'expenses',expenses,'partners',partners) from public.bon_elagouz_store`);
 expect(result).toMatchObject({drafts:[],items:2,sales:[],expenses:[],partners:state.partners});
 const legacy=toCloud(stockState());delete legacy.catalog_name_drafts;
 expect(readJson(`select public.bon_erp_save_store(0,${literal(legacy)},'${crypto.randomUUID()}');select catalog_name_drafts from public.bon_elagouz_store`)).toEqual(pending.catalogNameDrafts);
});
it.skipIf(!active)('accepts an actual complete store through the versioned API',()=>expect(save(toCloud(state))).toContain('"version": 1'));
it.skipIf(!active)('records a settled opening asset once without changing revenue, profit, partners or debt',()=>{
 const next=recordFinancialOpening(stockState(),'2026-11-01',1000,'ترحيل رصيد أكتوبر بعد التسوية',{id:owner,name:'Owner'});seed(stockState());accept(next);
 const result=readJson(`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}');select jsonb_build_object('report',public.bon_erp_dashboard_v2('2026-11-01','2026-11-30')->'report','opening',(select financial_openings->0->'amount' from public.bon_elagouz_store),'partners',(select partners from public.bon_elagouz_store),'expenses',(select expenses from public.bon_elagouz_store))`);
 expect(result.opening).toBe(1000);expect(result.report.revenue).toBe(0);expect(result.report.net).toBe(0);expect(result.expenses).toEqual([]);expect(result.partners).toEqual(state.partners);
});
it.skipIf(!active)('requires the master and immutable correction history for opening changes',()=>{
 const id='22222222-2222-4222-8222-222222220094';userAccessFixture(id,{view:true,partners:true});
 const next=recordFinancialOpening(stockState(),'2026-11-01',1000,'رصيد مؤكد في خزنة الشركة',{id:owner,name:'Owner'});
 expect(()=>asUser(id,`select public.bon_erp_save_store(0,${literal(toCloud(next))},'${crypto.randomUUID()}')`)).toThrow();
 const forged=structuredClone(next);forged.financialOpenings[0].history[0].actorId=id;reject(forged,'OPENING_HISTORY_REQUIRED');
 const changed=structuredClone(next);changed.financialOpenings[0].amount=2000;reject(changed,'OPENING_HISTORY_REQUIRED');
 sql(`begin;set local request.jwt.claim.sub='${owner}';update public.bon_elagouz_store set financial_openings=${literal(next.financialOpenings)};commit;`);
 const correction=recordFinancialOpening(next,'2026-11-01',1200,'تصحيح مثبت من عد الخزنة',{id:owner,name:'Owner'});accept(correction);
 const tampered=structuredClone(correction);tampered.financialOpenings[0].history[0].reason='تغيير السجل السابق';reject(tampered,'OPENING_HISTORY_IMMUTABLE');
 reject({...next,financialOpenings:[]},'OPENING_IMMUTABLE');
 const legacy=toCloud(stockState());delete legacy.financial_openings;
 const preserved=readJson(`select public.bon_erp_save_store(0,${literal(legacy)},'${crypto.randomUUID()}');select financial_openings from public.bon_elagouz_store`);
 expect(preserved).toEqual(next.financialOpenings);
});
it.skipIf(!active)('publishes a small protected version row in the same financial transaction',()=>{
  expect(sql(`begin;set local request.jwt.claim.sub='${owner}';set local role authenticated;select public.bon_erp_save_store(0,${literal(toCloud(state))},gen_random_uuid(),null);select version from public.bon_erp_store_versions where id='main_store';rollback;`)).toContain('\n1');
  expect(sql("select version from public.bon_erp_store_versions where id='main_store'")).toBe('0');
  expect(()=>sql("begin;set local role anon;select * from public.bon_erp_store_versions;rollback;")).toThrow('permission denied');
  expect(()=>sql("begin;set local role authenticated;update public.bon_erp_store_versions set version=5;rollback;")).toThrow('permission denied');
});
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
it.skipIf(!active)('accepts count products and one-to-one count recipes while rejecting cross-dimension units',()=>{
 const counted:InventoryItem={...bean,id:'counted',code:'C1',category:'direct_product',baseUnit:'count',hasRecipe:false,recipe:[]};
 expect(()=>save(toCloud({...state,items:[counted]}))).not.toThrow();
 expect(sql("select bon_erp_private.base_quantity(3,'count','count'),bon_erp_private.base_quantity(3,'piece','count'),bon_erp_private.base_quantity(3,'count','piece'),bon_erp_private.base_quantity(3,'kg','count') is null,bon_erp_private.base_quantity(3,'count','liter') is null")).toBe('3|3|3|t|t');
 const drink:InventoryItem={...bean,id:'drink-count',code:'DC1',category:'drink_recipe',baseUnit:'piece',stock:0,openingStock:0,hasRecipe:true,recipeYield:1,costPrice:2,recipe:[{ingredientId:counted.id,ingredientName:counted.name,quantity:2,unit:'count'}]};
 expect(()=>save(toCloud({...state,items:[counted,drink]}))).not.toThrow();
 expect(()=>save(toCloud({...state,items:[counted,{...drink,recipe:[{...drink.recipe![0],unit:'gram'}]}]}))).toThrow('INVALID_RECIPE_UNIT');
});
function sold(store:StoreState,invoice:SalesInvoice):StoreState{return {...store,items:deductInventory(invoice.items,store.items),salesInvoices:[invoice,...store.salesInvoices],customers:store.customers.map(c=>c.id===invoice.customerId?{...c,balance:c.balance+invoice.remainingAmount,totalSales:c.totalSales+invoice.totalAmount,invoicesCount:c.invoicesCount+1,lastPurchaseDate:invoice.date}:c)};}
function workerState():StoreState{return {...state,employees:[{...INITIAL_EMPLOYEES[0],id:'worker',salaryType:'شهري',baseMonthlySalary:1000,payrollPeriod:currentPayrollPeriod(),openingPayable:0,workedDaysThisMonth:0,totalAdvances:0,totalDeductions:0,totalPaidOut:0,totalBonuses:0}]};}

it.skipIf(!active)('accepts an actual sale and refuses a forged nonnegative balance that hides an oversell',()=>{
  const blend:InventoryItem={...bean,id:'blend',code:'BL1',category:'manufactured_blend',hasRecipe:true,recipe:[{ingredientId:bean.id,ingredientName:bean.name,quantity:1000,unit:'gram'}]};
  const customer={...INITIAL_CUSTOMERS[0],area:'Cairo',phone:'01012345678',balance:0,totalSales:0,invoicesCount:0};
  const before={...stockState(),items:[bean,blend],customers:[customer]};seed(before);
  const invoice={...sale(2,blend),saleType:'wholesale' as const,customerId:customer.id,customerName:customer.name};accept(sold(before,invoice));
  reject({...before,items:[bean,{...blend,stock:0}],salesInvoices:[{...sale(11,blend),saleType:'wholesale',customerId:customer.id}]},'INVENTORY_MOVEMENT_MISMATCH');
});
it.skipIf(!active)('permits catalog count corrections only with a stocktaking journal',()=>{
  const before=stockState();seed(before);accept(adjustCatalogItem(before,bean.id,{stock:8},'Owner'));
  reject({...before,items:[{...bean,stock:8}]},'INVENTORY_MOVEMENT_MISMATCH');
});
it.skipIf(!active)('keeps drink components consumed on return and rejects restoring them',()=>{
  const raw={...bean,stock:1};
  const drink:InventoryItem={...bean,id:'drink',code:'D1',category:'drink_recipe',baseUnit:'piece',stock:999,costPrice:0.3,hasRecipe:true,recipe:[{ingredientId:bean.id,ingredientName:bean.name,quantity:300,unit:'gram'}]};
  const before={...stockState(),items:[raw,drink]};seed(before);reject(sold(before,sale(2,drink)),'NEW_SALE_WHOLESALE_CUSTOMER_REQUIRED');
  reject({...before,items:[{...raw,stock:0},drink],salesInvoices:[sale(4,drink)]},'INVENTORY_MOVEMENT_MISMATCH');
  const paid=sold(before,sale(2,drink));seed(paid);const returned=returnSale(paid,'sale','Owner');accept(returned);
  reject({...returned,items:returned.items.map((item)=>item.id==='bean'?{...item,stock:1}:item)},'INVENTORY_MOVEMENT_MISMATCH');
});
it.skipIf(!active)('restores directly sold goods on return and preserves the original invoice',()=>{
  const before=sold(stockState(),sale());seed(before);const returned=returnSale(before,'sale','Owner');accept(returned);
  reject({...returned,salesInvoices:[]},'IMMUTABLE_DOCUMENT');
});
it.skipIf(!active)('returns changed-cost stock at its invoice valuation and rejects forged receipt evidence',()=>{
 const before={...stockState(),items:[{...bean,stock:20,costPrice:6,costingVersion:2 as const}],salesInvoices:[sale(4,{...bean,costPrice:3})]};seed(before);
 const returned=returnSale(before,'sale','Owner');expect(returned.items[0]).toMatchObject({stock:24,costPrice:5.5});accept(returned);
 const item=returned.items[0],history=item.costHistory!;
 reject({...returned,items:[{...item,costPrice:6}]},'RETURN_AVERAGE_COST_MISMATCH');
 reject({...returned,items:[{...item,costHistory:[]}]},'RETURN_COST_HISTORY_REQUIRED');
 reject({...returned,items:[{...item,costHistory:[{...history[0],unitCost:6}]}]},'RETURN_ORIGINAL_COST_REQUIRED');
 reject({...returned,items:[{...item,costHistory:[{...history[0],quantity:3}]}]},'RETURN_ORIGINAL_COST_REQUIRED');
 reject({...returned,items:[{...item,costHistory:[{...history[0],sourceId:'other'}]}]},'RETURN_COST_RECEIPT_INVALID');
 reject({...returned,items:[{...item,costHistory:[{...history[0],date:'2020-01-01'}]}]},'RETURN_COST_RECEIPT_INVALID');
});
it.skipIf(!active)('keeps legacy seasoning consumed and requires exactly one noncash expense for its original cost',()=>{
 const seasoning:InventoryItem={...bean,id:'seasoning',code:'SE1',category:'seasoning_recipe',stock:0,openingStock:0,costPrice:0.3,hasRecipe:true,recipe:[{ingredientId:bean.id,ingredientName:bean.name,quantity:300,unit:'gram'}]};
 const paid=sold({...stockState(),items:[bean,seasoning]},sale(2,seasoning));seed(paid);
 const returned=returnSale(paid,'sale','Owner');expect(returned.items).toEqual(paid.items);accept(returned);
 reject({...returned,expenses:[]},'RETURN_CONSUMPTION_COST_REQUIRED');
 reject({...returned,expenses:[returned.expenses[0],{...returned.expenses[0],id:'duplicate'}]},'RETURN_EXPENSE_DUPLICATE_OR_AMOUNT');
 reject({...returned,items:returned.items.map(i=>i.id===bean.id?{...i,stock:bean.stock}:i)},'INVENTORY_MOVEMENT_MISMATCH');
});
it.skipIf(!active)('replays consecutive returns at original costs without allowing reused return receipts',()=>{
 const first=sale(4,{...bean,costPrice:3}),second={...sale(2,{...bean,costPrice:9}),id:'second',invoiceNumber:'S2'};
 const before={...stockState(),items:[{...bean,stock:20,costPrice:6,costingVersion:2 as const}],salesInvoices:[first,second]};seed(before);
 const returned=returnSale(returnSale(before,'sale','Owner'),'second','Owner');expect(returned.items[0].costPrice).toBe(5.77);accept(returned);
 const item=returned.items[0],history=item.costHistory!;
 reject({...returned,items:[{...item,costHistory:[history[0],{...history[1],sourceId:'sale'}]}]},'RETURN_COST_RECEIPT_INVALID');
 seed(returned);
 reject({...returned,items:[{...item,costHistory:[...history,{...history[0],id:'replayed'}]}]},'RETURN_RECEIPT_WITHOUT_DOCUMENT');
});
it.skipIf(!active)('values returns into negative stock without pretending missing goods have value',()=>{
 const before={...stockState(),items:[{...bean,stock:-5,costPrice:6,costingVersion:2 as const}],salesInvoices:[sale(4,{...bean,costPrice:3})]};seed(before);
 const returned=returnSale(before,'sale','Owner');expect(returned.items[0]).toMatchObject({stock:-1,costPrice:3});accept(returned);
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
  accept({...before,items:[{...bean,stock:9},receiveStock(blend,2,0.5,{id:batch.id,date:batch.date,type:'production'})],productionBatches:[batch]});
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
  sql(`delete from public.erp_members where user_id='${other}';delete from auth.users where id='${other}';`);
});
it.skipIf(!active)('does not expose privileged validation helpers or direct table updates',()=>{
  expect(sql("select has_function_privilege('authenticated','bon_erp_private.validate_changes(jsonb,jsonb)','EXECUTE')")).toBe('f');
  expect(()=>sql("begin;set local role authenticated;update public.bon_elagouz_store set items='[]' where id='main_store';rollback;")).toThrow('permission denied');
});
it.skipIf(!active)('lets only the backup principal read private files without acquiring ERP or storage write access',()=>{
  const reader='33333333-3333-4333-8333-333333333333';
  expect(sql(`begin;insert into auth.users values('${reader}','backup@local.test',now());insert into bon_erp_private.storage_backup_principal values(true,'${reader}');insert into storage.objects values(gen_random_uuid(),'private','nested/file.bin');set local request.jwt.claim.sub='${reader}';set local role authenticated;select name from storage.objects;select count(*) from public.bon_elagouz_store;rollback;`)).toBe('nested/file.bin\n0');
  expect(()=>sql(`begin;set local role authenticated;insert into storage.objects values(gen_random_uuid(),'private','bad');rollback;`)).toThrow('permission denied');
  expect(()=>sql(`begin;set local role authenticated;delete from storage.objects;rollback;`)).toThrow('permission denied');
});

function cashierPair(){
  const drink:InventoryItem={...bean,id:'drink',code:'DR1',category:'drink_recipe',baseUnit:'piece',stock:0,openingStock:0,costPrice:0.3,hasRecipe:true,recipe:[{ingredientId:bean.id,ingredientName:bean.name,quantity:300,unit:'gram'}]};
  const before={...stockState(),items:[{...bean,stock:1},drink]};
  const withMoney=attachCashierReport(before,businessDate(),{type:'financial',file:{fileName:'financial.xlsx',sha256:'a'.repeat(64),uploadedAt:new Date().toISOString()},totalRevenue:200});
  const pending=attachCashierReport(withMoney,businessDate(),{type:'items',file:{fileName:'items.xlsx',sha256:'b'.repeat(64),uploadedAt:new Date().toISOString()},lines:[{itemId:drink.id,quantity:5,unitLabel:'piece',normalizedQtyInBaseUnit:5}]});
  return {before,pending,posted:approveCashierDay(pending,pending.cashierDays[0].id,'Owner')};
}
it.skipIf(!active)('assigns a cashier code to an existing product without changing its recorded sales, stock or costs',()=>{
 const {posted}=cashierPair();seed(posted);const changed=adjustCatalogItem(posted,bean.id,{code:'200018'},'Owner');
 expect(changed.cashierDays).toEqual(posted.cashierDays);expect(changed.stocktakingRecords).toEqual(posted.stocktakingRecords);expect(changed.items.find(item=>item.id===bean.id)).toEqual({...posted.items.find(item=>item.id===bean.id),code:'200018'});accept(changed);
});
it.skipIf(!active)('accepts pending paired cashier reports without posting and permits verified cashier stock shortages',()=>{
 const {before,pending,posted}=cashierPair();seed(before);accept(pending);accept(posted);expect(posted.items[0].stock).toBe(-0.5);
});
it.skipIf(!active)('posts count cashier quantities without weight scaling and accepts compatible piece labels',()=>{
 const counted:InventoryItem={...bean,id:'counted',code:'C1',category:'direct_product',baseUnit:'count',hasRecipe:false,recipe:[]};
 for(const unit of ['count','piece']){
  const before={...state,items:[counted]};seed(before);
  const money=attachCashierReport(before,businessDate(),{type:'financial',file:{fileName:'financial.xlsx',sha256:'c'.repeat(64),uploadedAt:new Date().toISOString()},totalRevenue:30});
  const pending=attachCashierReport(money,businessDate(),{type:'items',file:{fileName:'items.xlsx',sha256:'d'.repeat(64),uploadedAt:new Date().toISOString()},lines:[{itemId:counted.id,quantity:3,unitLabel:unit,normalizedQtyInBaseUnit:3}]});
  const posted=approveCashierDay(pending,pending.cashierDays[0].id,'Owner');accept(posted);expect(posted.items[0].stock).toBe(7);expect(posted.cashierDays[0].totalCost).toBe(3);
 }
});
it.skipIf(!active)('rejects forged cashier consumption, cost, shortage evidence and changed approved reports',()=>{
 const {before,posted}=cashierPair();seed(before);
 const forged=structuredClone(posted);forged.cashierDays[0].consumption![0].quantity=1;reject(forged,'CASHIER_COST_MISMATCH');
 const shortage=structuredClone(posted);shortage.cashierDays[0].shortages=[];reject(shortage,'CASHIER_SHORTAGE_MISMATCH');
 seed(posted);const modified=structuredClone(posted);modified.cashierDays[0].financialReport!.totalRevenue=500;reject(modified,'CASHIER_REPORT_IMMUTABLE');
});
it.skipIf(!active)('refuses a second cashier report for the same business date and a missing half of the approved day',()=>{
 const {before,pending,posted}=cashierPair();seed(before);
 reject({...pending,cashierDays:[...pending.cashierDays,{...pending.cashierDays[0],id:'duplicate'}]},'DUPLICATE_CASHIER_DAY');
 const incomplete=structuredClone(posted);delete incomplete.cashierDays[0].financialReport;reject(incomplete,'CASHIER_REPORT_PAIR_REQUIRED');
});
it.skipIf(!active)('requires separate purchase tax, full payment, moving average and dated cost history',()=>{
 const supplier={id:'supplier',name:'Supplier',phone:'01012345678',address:'Cairo',representativeName:'Agent',category:'Raw',balance:0,totalPurchases:0,invoicesCount:0};
 const before={...stockState(),suppliers:[supplier]};seed(before);
 const invoice={id:'purchase',invoiceNumber:'P1',date:businessDate(),supplierId:supplier.id,supplierName:supplier.name,accountingVersion:2 as const,items:[{itemId:bean.id,itemName:bean.name,quantity:2,unit:'kg',purchasePrice:2,previousLastPrice:1,previousWacCost:1,cheapestSupplierPrice:1,cheapestSupplierName:'Supplier',updateProductCost:true}],netAmount:4,taxAmount:0.56,totalAmount:4.56,paidAmount:4.56,remainingAmount:0,paymentMethod:'نقدي' as const,partnerName:'Owner'};
 const after={...before,items:[receiveStock(bean,2,2,{id:invoice.id,date:invoice.date,type:'purchase'})],purchaseInvoices:[invoice],suppliers:[{...supplier,totalPurchases:4.56,invoicesCount:1}]};accept(after);
 reject({...after,purchaseInvoices:[{...invoice,paidAmount:0,remainingAmount:4.56,paymentMethod:'آجل'}],suppliers:[{...supplier,totalPurchases:4.56,invoicesCount:1,balance:4.56}]},'NEW_PURCHASE_FULL_PAYMENT_REQUIRED');
 reject({...after,items:[{...after.items[0],costPrice:2}]},'PURCHASE_AVERAGE_COST_MISMATCH');
 reject({...after,items:[{...after.items[0],costHistory:[]}]},'PURCHASE_COST_HISTORY_REQUIRED');
 seed(after);reject({...after,items:[{...after.items[0],costPrice:2}]},'COST_FROM_DOCUMENT_REQUIRED');
 reject({...after,items:[{...after.items[0],costHistory:[]}]},'COST_HISTORY_IMMUTABLE');
});
it.skipIf(!active)('rejects negative initial stock and missing new contact information',()=>{
 seed(state);reject({...state,items:[{...bean,stock:-1,openingStock:0}]},'INVENTORY_MOVEMENT_MISMATCH');
 reject({...state,customers:[{...INITIAL_CUSTOMERS[0],balance:0,totalSales:0,invoicesCount:0}]},'CONTACT_DETAILS_REQUIRED');
});

function importAs(user:string,query:string){return sql(`begin;set local request.jwt.claim.sub='${user}';set local role authenticated;${query};commit;`);}
function importJob(user=owner,date='2026-11-01',kind='financial'){
 const job=JSON.parse(importAs(user,`select public.bon_erp_new_import('report.csv','${kind}','${date}',7)`));
 sql(`insert into storage.objects values(gen_random_uuid(),'agouz-cashier-imports','${job.path}')`);
 const ready=JSON.parse(importAs(user,`select public.bon_erp_prepare_import('${job.id}','${'signed_fixture_'.repeat(3)}')`));return {...job,key:ready.workerToken,date};
}
function workerCall(job:any,action='claim',result:any={rows:[{metric:'Begun',amount:'5.00',businessDate:job.date}],sha256:'a'.repeat(64)},attempt:number|null=1){
 const query=action==='claim'?`public.bon_erp_claim_import('${job.id}','${job.key}')`:`public.bon_erp_finish_import('${job.id}','${job.key}',${attempt??'null'},${literal(result)},null)`;
 return JSON.parse(sql(`begin;set local role anon;select ${query};commit;`)||'null');
}
it.skipIf(!active)('parses into a pending cashier queue exactly once without changing money or stock',()=>{
 const job=importJob(),before=sql("select row_to_json(s)::text from public.bon_elagouz_store s");
 expect(workerCall(job).attempt).toBe(1);expect(workerCall(job)).toEqual({busy:true});
 const finish=workerCall(job,'finish');expect(finish.status).toBe('ready');expect(workerCall(job,'finish')).toEqual(finish);expect(workerCall(job)).toBeNull();
 expect(sql('select count(*) from public.cashier_sync_queue where not processed')).toBe('1');
 expect(sql("select row_to_json(s)::text from public.bon_elagouz_store s")).toBe(before);
 const list=JSON.parse(importAs(owner,'select public.bon_erp_read_import()'));expect(list).toHaveLength(1);expect(list[0].result).toBeUndefined();expect(list[0].worker_token).toBeUndefined();expect(list[0].download_token).toBeUndefined();
 expect(()=>importAs(owner,"select public.bon_erp_new_import('another.csv','financial','2026-11-01',7)")).toThrow('CASHIER_IMPORT_ALREADY_PENDING');
 expect(()=>sql(`begin;set local role anon;select * from bon_erp_private.import_jobs;rollback;`)).toThrow('permission denied');
});
it.skipIf(!active)('rejects a return refund above the recorded payment when the customer balance is inconsistent',()=>{
 const blend:InventoryItem={...bean,id:'blend',code:'BL1',category:'manufactured_blend',hasRecipe:true,
   recipe:[{ingredientId:bean.id,ingredientName:bean.name,quantity:1000,unit:'gram'}]};
 const saleInvoice={...sale(2,blend),saleType:'wholesale' as const,paymentMethod:'آجل' as const,customerId:'c1',paidAmount:1,remainingAmount:3};
 const previous={...stockState(),items:[bean,blend],salesInvoices:[saleInvoice],
   customers:[{...INITIAL_CUSTOMERS[0],id:'c1',name:'Customer',phone:'01012345678',area:'Cairo',balance:1,totalSales:sale().totalAmount,invoicesCount:1}]};
 seed(previous);
 const invoice=previous.salesInvoices[0];
 const forged={...previous,salesInvoices:[{...invoice,isReturned:true,returnedAt:new Date().toISOString(),
   returnedBy:'Owner',returnDebtReversed:1,returnRefundAmount:invoice.totalAmount-1}]};
 reject(forged,'RETURN_PAYMENT_RECONCILIATION_REQUIRED');
});
it.skipIf(!active)('requires one Begun amount and the report date at the database queue boundary',()=>{
 const job=importJob();expect(workerCall(job).saleDate).toBe('2026-11-01');
 for(const rows of [[{metric:'Total Revenue',amount:'5.00'}],[{metric:'Begun',amount:'-5.00'}],[{metric:'Begun',amount:'5.00'},{metric:'Begun',amount:'5.00'}]])expect(()=>workerCall(job,'finish',{rows,sha256:'a'.repeat(64)})).toThrow('BEGUN_RESULT_REQUIRED');
 expect(()=>workerCall(job,'finish',{rows:[{metric:'Begun',amount:'5.00',businessDate:'2026-11-02'}],sha256:'a'.repeat(64)})).toThrow('BEGUN_REPORT_DATE_MISMATCH');
 expect(()=>workerCall(job,'finish',{rows:[{metric:'Begun',amount:'5.00'}],sha256:'a'.repeat(64)})).toThrow('BEGUN_REPORT_DATE_REQUIRED');
 expect(workerCall(job,'finish').status).toBe('ready');
});
it.skipIf(!active)('keeps the original attempt budget when a failed import is queued again',()=>{
 const job=importJob();
 expect(workerCall(job).attempt).toBe(1);
 const prepare=()=>JSON.parse(importAs(owner,`select public.bon_erp_prepare_import('${job.id}','${'signed_fixture_'.repeat(3)}')`));
 for(const attempt of [2,3]){
  sql(`update bon_erp_private.import_jobs set status='failed',lease_until=null where id='${job.id}'`);
  job.key=prepare().workerToken;
  expect(workerCall(job).attempt).toBe(attempt);
 }
 sql(`update bon_erp_private.import_jobs set status='failed',lease_until=null where id='${job.id}'`);
 expect(prepare()).toEqual({id:job.id,status:'failed'});
 expect(sql(`select attempt from bon_erp_private.import_jobs where id='${job.id}'`)).toBe('3');
});
const uwsRow={code:'200018',name:'Fixture beans',quantity:'0.375',unit:'kg',total:'10.00',sourceFormat:'uws-items-v1',businessDate:'2026-11-01',sourceRow:4,saleCount:3};
function uwsFixture(row:Record<string,unknown>=uwsRow){
 const item={...bean,code:String(row.code),baseUnit:row.unit==='count'?'count' as const:'kg' as const};const before={...stockState(),items:[item]};seed(before);
 const job=importJob(owner,'2026-11-01','items');workerCall(job);const finish=workerCall(job,'finish',{rows:[row],sha256:'d'.repeat(64)});
 const pending=attachCashierReport(before,'2026-11-01',{type:'items',file:{fileName:'fixture.xls',sha256:'d'.repeat(64),uploadedAt:'2026-11-01',sourceQueueId:finish.queueId},lines:[{itemId:item.id,quantity:Number(row.quantity),unitLabel:String(row.unit),normalizedQtyInBaseUnit:Number(row.quantity)}]});
 return {before,pending,finish};
}
it.skipIf(!active)('binds printed item quantities, units, codes, and source day even when the interface is bypassed',()=>{
 const {pending}=uwsFixture();accept(pending);
 const changed=structuredClone(pending);changed.cashierDays[0].itemsReport!.lines[0].quantity=3;changed.cashierDays[0].itemsReport!.lines[0].normalizedQtyInBaseUnit=3;reject(changed,'CASHIER_UWS_QUANTITY_MISMATCH');
 const redated=structuredClone(pending);redated.cashierDays[0].date='2026-11-02';reject(redated,'CASHIER_UWS_SOURCE_MISMATCH');
 const noId=structuredClone(pending);delete noId.cashierDays[0].itemsReport!.sourceQueueId;reject(noId,'CASHIER_UWS_SOURCE_MISMATCH');
 const noLine=structuredClone(pending);noLine.cashierDays[0].itemsReport!.lines.push({...noLine.cashierDays[0].itemsReport!.lines[0]});reject(noLine,'CASHIER_UWS_LINES_MISMATCH');
 const wrongCode={...pending,items:[{...pending.items[0],code:'NOT-POS-CODE'}]};reject(wrongCode,'CASHIER_UWS_CODE_MISMATCH');
 const wrongUnit=structuredClone(pending);wrongUnit.cashierDays[0].itemsReport!.lines[0].unitLabel='gram';wrongUnit.cashierDays[0].itemsReport!.lines[0].normalizedQtyInBaseUnit=0.000375;reject(wrongUnit,'CASHIER_UWS_QUANTITY_MISMATCH');
});
it.skipIf(!active)('does not let an unrelated generic queue hide a printed source hash',()=>{
 const {pending}=uwsFixture();
 const other=sql(`insert into public.cashier_sync_queue(file_name,sale_date,raw_rows,content_hash,report_kind) values('generic.csv','2026-11-01','[{"code":"X","quantity":1}]','${'e'.repeat(64)}','items') returning id`);
 const forged=structuredClone(pending);forged.cashierDays[0].itemsReport!.sourceQueueId=other;reject(forged,'CASHIER_UWS_SOURCE_MISMATCH');
});
it.skipIf(!active)('retains unresolved printed rows for review but refuses inferred variant and seasoning deductions',()=>{
 const variant=uwsFixture({...uwsRow,code:'300010',sourceIssue:'UWS_VARIANT_WEIGHTS_REQUIRED'});reject(variant.pending,'CASHIER_UWS_DETAILS_REQUIRED');
 sql('truncate public.cashier_sync_queue,bon_erp_private.import_jobs;');
 const seasoning=uwsFixture({...uwsRow,code:'300014',quantity:'3',unit:'count',sourceIssue:'UWS_SEASONING_WEIGHT_REQUIRED'});reject(seasoning.pending,'CASHIER_UWS_DETAILS_REQUIRED');
});
it.skipIf(!active)('rejects malformed printed rows and wrong dates at the queue boundary',()=>{
 const job=importJob(owner,'2026-11-01','items');workerCall(job);
 for(const row of [{...uwsRow,businessDate:'2026-11-02'},{...uwsRow,quantity:'-1'},{...uwsRow,unit:'gram'},{...uwsRow,unit:'count',quantity:'2'},{...uwsRow,saleCount:0}])expect(()=>workerCall(job,'finish',{rows:[row],sha256:'d'.repeat(64)})).toThrow();
 expect(workerCall(job,'finish',{rows:[uwsRow],sha256:'d'.repeat(64)}).status).toBe('ready');
});
it.skipIf(!active)('binds the posted cashier amount to its Begun source even when the interface is bypassed',()=>{
 const job=importJob();workerCall(job);const finish=workerCall(job,'finish');
 const pending=attachCashierReport(stockState(),'2026-11-01',{type:'financial',file:{fileName:'report.csv',sha256:'a'.repeat(64),uploadedAt:'2026-11-01',sourceQueueId:finish.queueId},totalRevenue:5});
 accept(pending);
 const wrong=structuredClone(pending);wrong.cashierDays[0].financialReport!.totalRevenue=6;reject(wrong,'CASHIER_BEGUN_AMOUNT_MISMATCH');
 const rehashed=structuredClone(pending);rehashed.cashierDays[0].financialReport!.sha256='b'.repeat(64);reject(rehashed,'CASHIER_BEGUN_SOURCE_MISMATCH');
 const redated=structuredClone(pending);redated.cashierDays[0].date='2026-11-02';reject(redated,'CASHIER_BEGUN_SOURCE_MISMATCH');
});
it.skipIf(!active)('rejects null, wrong and replayed import credentials, result shapes and leases',()=>{
 const job=importJob();
 for(const key of ['null',"''",`'${'b'.repeat(64)}'`]){
  expect(()=>sql(`begin;set local role anon;select public.bon_erp_claim_import('${job.id}',${key});rollback;`)).toThrow('IMPORT_WORKER_DENIED');
  expect(()=>sql(`begin;set local role anon;select public.bon_erp_finish_import('${job.id}',${key},1,null,null);rollback;`)).toThrow('IMPORT_WORKER_DENIED');
 }
 workerCall(job);
 for(const result of [null,{}, {rows:{}}, {rows:[]}, {rows:[{}]}])expect(()=>workerCall(job,'finish',result)).toThrow('INVALID_IMPORT_RESULT');
 expect(()=>workerCall(job,'finish',{rows:[{}],sha256:'a'.repeat(64)},null)).toThrow('IMPORT_LEASE_CHANGED');
 sql(`update bon_erp_private.import_jobs set lease_until=now()-interval '1 second' where id='${job.id}'`);expect(workerCall(job).attempt).toBe(2);
 expect(()=>workerCall(job,'finish')).toThrow('IMPORT_LEASE_CHANGED');expect(workerCall(job,'finish',{rows:[{metric:'Begun',amount:'5.00',businessDate:'2026-11-01'}],sha256:'a'.repeat(64)},2).status).toBe('ready');
 expect(sql("select has_schema_privilege('anon','bon_erp_private','USAGE')")).toBe('f');
});
it.skipIf(!active)('keeps cashier jobs and storage private and stops processing after account revocation',()=>{
 const cashier='22222222-2222-4222-8222-222222220041',other='22222222-2222-4222-8222-222222220042';userAccessFixture(cashier,{},'cashier');userAccessFixture(other,{},'cashier');const job=importJob(cashier);
 expect(JSON.parse(importAs(other,`select public.bon_erp_read_import('${job.id}')`)||'null')).toBeNull();
 expect(()=>importAs(other,`select public.bon_erp_prepare_import('${job.id}','${'x'.repeat(30)}')`)).toThrow('USER_PERMISSION_DENIED');
 expect(()=>importAs(other,`select public.bon_erp_cancel_import('${job.id}')`)).toThrow('USER_PERMISSION_DENIED');
 expect(workerCall(job).catalog).toEqual([]);
 sql(`update public.erp_members set disabled_at=now() where user_id='${cashier}'`);
 expect(workerCall(job,'finish').status).toBe('failed');expect(sql('select count(*) from public.cashier_sync_queue')).toBe('0');
 expect(sql(`begin;grant insert on storage.objects to authenticated;set local request.jwt.claim.sub='${other}';set local role authenticated;select count(*) from storage.objects where bucket_id='agouz-cashier-imports';rollback;`)).toBe('0');
 expect(()=>sql(`begin;grant insert on storage.objects to authenticated;set local request.jwt.claim.sub='${other}';set local role authenticated;insert into storage.objects values(gen_random_uuid(),'agouz-cashier-imports','${job.path}');rollback;`)).toThrow('row-level security');
});
it.skipIf(!active)('cancels a wrong unreviewed import and rejects content duplicates across dates',()=>{
 const one=importJob();workerCall(one);workerCall(one,'finish');
 const two=importJob(owner,'2026-11-02');workerCall(two);expect(workerCall(two,'finish').status).toBe('failed');
 expect(sql(`select error_code from bon_erp_private.import_jobs where id='${two.id}'`)).toBe('DUPLICATE_IMPORT_FILE');
 importAs(owner,`select public.bon_erp_cancel_import('${one.id}')`);expect(sql('select count(*) from public.cashier_sync_queue where not processed')).toBe('0');
 expect(()=>workerCall(one)).toThrow('IMPORT_WORKER_DENIED');
 const replacement=importJob();workerCall(replacement);workerCall(replacement,'finish',{rows:[{metric:'Begun',amount:'5.00',businessDate:'2026-11-01'}],sha256:'c'.repeat(64)});
 sql(`update public.cashier_sync_queue set processed=true where import_job_id='${replacement.id}'`);
 expect(()=>importAs(owner,`select public.bon_erp_cancel_import('${replacement.id}')`)).toThrow('IMPORT_ALREADY_REVIEWED');
});
it.skipIf(!active)('validates import reservations and requires an actual stored file and signed download token',()=>{
 for(const args of ["null,'financial','2026-11-01',7","'../report.csv','financial','2026-11-01',7","'report.csv',null,'2026-11-01',7","'report.csv','items',null,7","'report.csv','items','2026-02-30',7","'report.csv','items','2026-11-01',null","'report.csv','items','2026-11-01',10485761"]){expect(()=>importAs(owner,`select public.bon_erp_new_import(${args})`)).toThrow();}
 const job=JSON.parse(importAs(owner,"select public.bon_erp_new_import('report.csv','financial','2026-11-01',7)"));
 expect(()=>importAs(owner,`select public.bon_erp_prepare_import('${job.id}',null)`)).toThrow('IMPORT_UPLOAD_MISSING');
 expect(()=>importAs(owner,`select public.bon_erp_prepare_import('${job.id}','${'x'.repeat(30)}')`)).toThrow('IMPORT_UPLOAD_MISSING');
 expect(()=>sql(`begin;set local role anon;select public.bon_erp_read_import();rollback;`)).toThrow('permission denied');
});

it.skipIf(!active)('reports recovery health through a narrow backup-only receipt while preserving the previous verified archive',()=>{
 const reader='33333333-3333-4333-8333-333333333334';
 sql(`insert into auth.users values('${reader}','health@local.test',now());insert into bon_erp_private.storage_backup_principal values(true,'${reader}')`);
 const sha='d'.repeat(40),generation='2026-11-04T01-00-00-000Z-12345678';
 const report=(state:string,run:string)=>importAs(reader,`select public.bon_erp_report_recovery_health('${state}','${run}','${sha}','${generation}')`);
 expect(()=>importAs(owner,`select public.bon_erp_report_recovery_health('running','1','${sha}')`)).toThrow('BACKUP_PRINCIPAL_REQUIRED');
 expect(()=>importAs(reader,`select public.bon_erp_report_recovery_health('success',null,'${sha}')`)).toThrow('INVALID_RECOVERY_STATUS');
 report('running','1');report('success','1');const verified=JSON.parse(importAs(owner,'select public.bon_erp_operational_health()')).backup;
 expect(verified.state).toBe('success');expect(verified.last_verified_run).toBe('1');
 report('running','2');report('failed','2');const failed=JSON.parse(importAs(owner,'select public.bon_erp_operational_health()')).backup;
 expect(failed.last_verified_at).toBe(verified.last_verified_at);expect(failed.last_verified_run).toBe('1');expect(failed.state).toBe('failed');
 expect(()=>report('success','1')).toThrow('RECOVERY_RUN_CHANGED');
 expect(()=>importAs(reader,'select public.bon_erp_operational_health()')).toThrow('USER_PERMISSION_DENIED');
 expect(importAs(reader,"select count(*) from public.bon_elagouz_store")).toBe('0');
 sql(`delete from bon_erp_private.storage_backup_principal where user_id='${reader}';delete from auth.users where id='${reader}'`);
});

it.skipIf(!active)('keeps individual cashier provenance and current customer contact available without downloading all invoices',()=>{
 const source=cashierPair().posted;seed(source);
 const result=readJson(`select public.bon_erp_sale_detail('${source.cashierDays[0].id}','cashier')`);
 expect(result.itemsReport).toEqual(source.cashierDays[0].itemsReport);expect(result.consumption).toEqual(source.cashierDays[0].consumption);expect(result.itemNames.bean).toBe(source.items[0].name);
 const customer={...INITIAL_CUSTOMERS[0],phone:'01012345678'},invoice={...sale(),customerId:INITIAL_CUSTOMERS[0].id};
 seed({...state,customers:[customer],salesInvoices:[invoice]});expect(readJson(`select public.bon_erp_sale_detail('${invoice.id}','invoice')`).customerPhone).toBe(customer.phone);
 expect(()=>readJson("select public.bon_erp_sales_page('legacy','',0,null)")).toThrow('INVALID_PAGE');
 expect(()=>readJson("select public.bon_erp_item_search('x',null)")).toThrow('INVALID_SEARCH');
});

it.skipIf(!active)('dispatches at most two due jobs with per-job credentials and rate-limits repeat dispatch without committing network requests',()=>{
 const jobs=[importJob(owner,'2026-10-01'),importJob(owner,'2026-10-02'),importJob(owner,'2026-10-03')];
 const result=sql(`begin;select bon_erp_private.dispatch_imports();select count(*) from bon_erp_private.import_jobs where dispatched_at is not null;select bon_erp_private.dispatch_imports();select bon_erp_private.dispatch_imports();select bool_and(convert_from(body,'UTF8')::jsonb ? 'worker_token' and url='https://agouz.vercel.app/api/import-worker') from net.http_request_queue;rollback;`);
 expect(result).toBe('2\n2\n1\n0\nt');
 expect(sql('select count(*) from net.http_request_queue')).toBe('0');
 expect(sql('select count(*) from bon_erp_private.import_jobs where dispatched_at is not null')).toBe('0');
 expect(()=>importAs(owner,'select bon_erp_private.dispatch_imports()')).toThrow('permission denied');
 sql(`update bon_erp_private.import_jobs set attempt=3 where id='${jobs[0].id}';update bon_erp_private.import_jobs set updated_at=now()-interval '51 minutes' where id='${jobs[1].id}'`);
 expect(sql(`begin;select bon_erp_private.dispatch_imports();select count(*) from bon_erp_private.import_jobs where status='failed';rollback;`)).toBe('0\n2');
});
