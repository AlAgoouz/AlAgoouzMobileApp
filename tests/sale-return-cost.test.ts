import {expect,it,vi} from 'vitest';
import {returnSale,saveSaleReturn} from '../src/lib/ledger';
import {StoreEngine} from '../src/lib/storeEngine';
import {emptyStore,createBackup,parseBackup} from '../src/lib/storeState';
import {businessDate} from '../src/lib/dates';
import {financialPosition,recordFinancialOpening} from '../src/lib/financialOpening';
import {INITIAL_CUSTOMERS} from '../src/data/initialData';
import type {InventoryItem,SalesInvoice} from '../src/types/erp';
const item:InventoryItem={id:'blend',code:'B1',name:'Blend',category:'manufactured_blend',baseUnit:'kg',stock:20,openingStock:0,minStock:0,costPrice:6,lastPurchasePrice:6,retailPrice:10,wholesalePrice:10,hasRecipe:true,canSellDirectly:true,supplierPrices:[],costingVersion:2,recipe:[{ingredientId:'raw',ingredientName:'Raw',quantity:1000,unit:'gram'}]};
const raw:InventoryItem={...item,id:'raw',code:'R1',name:'Raw',category:'raw_bean',hasRecipe:false,recipe:[]};
const invoice:SalesInvoice={id:'sale',invoiceNumber:'S1',date:businessDate(),saleType:'wholesale',customerId:'c',customerName:'Customer',items:[{itemId:item.id,itemName:item.name,category:item.category,quantity:4,unitLabel:'kg',normalizedQtyInBaseUnit:4,unitPrice:10,unitCost:3,totalPrice:40,totalCost:12,profit:28}],subtotal:40,discount:0,totalAmount:40,totalCost:12,netProfit:28,paidAmount:30,remainingAmount:10,paymentMethod:'آجل',partnerName:'Owner'};
const state=()=>({...emptyStore,items:[item,raw],salesInvoices:[invoice],customers:[{...INITIAL_CUSTOMERS[0],id:'c',name:'Customer',phone:'01012345678',area:'Cairo',balance:10,totalSales:40,invoicesCount:1}]});
it('revalues returned stock at its original invoice cost and preserves immutable evidence through backup',()=>{
 const before=state(),after=returnSale(before,'sale','Owner');
 expect(after.items[0]).toMatchObject({stock:24,costPrice:5.5,costingVersion:2});
 expect(after.items[0].costHistory).toHaveLength(1);
 expect(after.items[0].costHistory![0]).toMatchObject({sourceType:'sale_return',sourceId:'sale',quantity:4,unitCost:3,averageCost:5.5,postedAt:after.salesInvoices[0].returnedAt,date:businessDate(new Date(after.salesInvoices[0].returnedAt!))});
 expect(after.salesInvoices[0].items).toEqual(before.salesInvoices[0].items);
 expect(after.salesInvoices[0]).toMatchObject({returnDebtReversed:10,returnRefundAmount:30});
 expect(after.customers[0]).toMatchObject({balance:0,totalSales:0,invoicesCount:0});
 expect(after.expenses).toHaveLength(0);expect(before.items[0].costPrice).toBe(6);
 expect(parseBackup(createBackup(after))).toEqual(after);
 expect(()=>returnSale(after,'sale','Owner')).toThrow('مرتجعة بالفعل');
});
it('uses the recorded rounded line costs and aggregates repeated lines once per item',()=>{
 const s=state();s.salesInvoices=[{...invoice,items:[{...invoice.items[0],normalizedQtyInBaseUnit:0.003,quantity:0.003,totalCost:0.01},{...invoice.items[0],normalizedQtyInBaseUnit:0.003,quantity:0.003,totalCost:0.01}]}];
 const returned=returnSale(s,'sale','Owner').items[0];
 expect(returned.stock).toBe(20.006);expect(returned.costHistory).toHaveLength(1);
 expect(returned.costHistory![0].unitCost).toBeCloseTo(0.02/0.006,10);
});
it('keeps signed shortages while valuing only available stock on a return',()=>{
 const s=state();s.items=[{...item,stock:-5}];const returned=returnSale(s,'sale','Owner').items[0];
 expect(returned.stock).toBe(-1);expect(returned.costPrice).toBe(3);
});
it('keeps legacy seasoning and drink ingredients consumed with one noncash cost and one cash refund',()=>{
 const s=state();s.items=[{...item,id:'raw',category:'raw_bean',stock:2,costPrice:6}];
 s.salesInvoices=[{...invoice,items:[{...invoice.items[0],itemId:'removed-seasoning',category:'seasoning_recipe',totalCost:7},{...invoice.items[0],itemId:'removed-drink',category:'drink_recipe',totalCost:5}]}];
 const opened=recordFinancialOpening(s,businessDate(),100,'Opening settled period',{id:'owner',name:'Owner'});
 const after=returnSale(opened,'sale','Owner');expect(after.items).toEqual(s.items);
 expect(after.expenses).toHaveLength(1);expect(after.expenses[0]).toMatchObject({amount:12,paidFrom:'تسوية مخزون (بدون نقدية)',sourceInvoiceId:'sale'});
 expect(financialPosition(after,businessDate(),businessDate())).toMatchObject({inflow:30,outflow:30,closing:100});
});
it('rejects a missing physical item instead of silently skipping stock restoration',()=>{
 expect(()=>returnSale({...state(),items:[]},'sale','Owner')).toThrow('استعادة الصنف');
});
it('retries a lost acknowledgement with the same operation and no duplicate receipt or audit',async()=>{
 const save=vi.fn().mockRejectedValueOnce(Error('network')).mockResolvedValue(1);
 const engine=new StoreEngine({load:async()=>({state:state(),version:0}),save});await engine.load();
 await expect(saveSaleReturn(engine,'sale','Owner','owner')).rejects.toThrow('network');
 await saveSaleReturn(engine,'sale','Owner','owner');
 expect(save).toHaveBeenCalledTimes(2);expect(save.mock.calls[0][2]).toBe(save.mock.calls[1][2]);
 expect(engine.state.items[0].costHistory).toHaveLength(1);expect(engine.state.auditLogs).toHaveLength(1);
 expect(engine.snapshot.status).toBe('ready');
});
it('does not report a successful return when the server rejects its transaction',async()=>{
 const engine=new StoreEngine({load:async()=>({state:state(),version:0}),save:async()=>{throw Error('RETURN_ORIGINAL_COST_REQUIRED');}});await engine.load();
 await expect(saveSaleReturn(engine,'sale','Owner')).rejects.toThrow('RETURN_ORIGINAL_COST_REQUIRED');
 expect(engine.snapshot.status).toBe('error');
});
