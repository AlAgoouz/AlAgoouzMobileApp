import {expect,it} from 'vitest';
import {emptyStore,validateStore,createBackup,parseBackup} from '../src/lib/storeState';
import {receiveStock} from '../src/lib/costing';
import {deductInventory,productionNeeds} from '../src/lib/inventory';
import {attachCashierReport,approveCashierDay,salesForReports} from '../src/lib/cashierDays';
import {checkPurchase} from '../src/lib/operationChecks';
import {supplierPurchaseHistory} from '../src/lib/supplierPurchases';
import {adjustCatalogItem} from '../src/lib/catalogAdjustments';
import {recalculateRecipeCosts} from '../src/lib/itemCosts';
import {checkCustomerDetails,checkSupplierDetails,whatsAppNumber} from '../src/lib/contactDetails';
import type {InventoryItem,PurchaseInvoice} from '../src/types/erp';
const raw:InventoryItem={id:'raw',code:'R1',name:'بن خام',category:'raw_bean',baseUnit:'kg',stock:1,openingStock:1,minStock:0,costPrice:100,lastPurchasePrice:100,retailPrice:200,wholesalePrice:0,hasRecipe:false,canSellDirectly:true,supplierPrices:[]};
const seasoning:InventoryItem={...raw,id:'seasoning',code:'SE1',name:'تحويجة',category:'seasoning_recipe',stock:0,openingStock:0,costPrice:100,hasRecipe:true,recipe:[{ingredientId:raw.id,ingredientName:raw.name,quantity:1000,unit:'gram'}]};
const drink:InventoryItem={...raw,id:'drink',code:'D1',name:'مشروب بوصفة',category:'drink_recipe',baseUnit:'piece',stock:0,openingStock:0,costPrice:20,hasRecipe:true,recipe:[{ingredientId:seasoning.id,ingredientName:seasoning.name,quantity:200,unit:'gram'}]};
const file=(key:string)=>({fileName:key+'.xlsx',sha256:key.repeat(64),uploadedAt:'2026-11-03T04:00:00.000Z'});
function paired(){let state={...emptyStore,items:[raw,seasoning,drink]};state=attachCashierReport(state,'2026-11-03',{type:'items',file:file('a'),lines:[{itemId:drink.id,quantity:10,unitLabel:'piece',normalizedQtyInBaseUnit:10}]});return attachCashierReport(state,'2026-11-03',{type:'financial',file:file('b'),totalRevenue:500});}
it('posts one day revenue once and recursively consumes seasoning into negative physical stock',()=>{
 const pending=paired();expect(salesForReports(pending)).toEqual([]);expect(pending.items[0].stock).toBe(1);
 const posted=approveCashierDay(pending,pending.cashierDays[0].id,'Owner');
 expect(posted.items.find(i=>i.id===raw.id)?.stock).toBe(-1);expect(posted.items.find(i=>i.id===seasoning.id)?.stock).toBe(0);
 expect(posted.cashierDays[0].totalCost).toBe(200);expect(posted.cashierDays[0].shortages).toEqual([{itemId:'raw',shortage:1}]);
 expect(salesForReports(posted).reduce((s,i)=>s+i.totalAmount,0)).toBe(500);expect(salesForReports(posted)[0].netProfit).toBe(300);
 expect(()=>approveCashierDay(posted,posted.cashierDays[0].id,'Owner')).toThrow();
 expect(parseBackup(createBackup(posted))).toEqual(posted);
});
it('prevents same-day duplicates even for a different report hash and blocks copied files under another date',()=>{
 const state=paired();expect(()=>attachCashierReport(state,'2026-11-03',{type:'financial',file:file('c'),totalRevenue:100})).toThrow('تكراره');
 expect(()=>attachCashierReport(state,'2026-11-04',{type:'financial',file:file('b'),totalRevenue:500})).toThrow('مرفوع بالفعل');
});
it('requires both day reports before posting and never treats an unknown cost as zero',()=>{
 const state=attachCashierReport({...emptyStore,items:[raw]},'2026-11-03',{type:'financial',file:file('a'),totalRevenue:50});
 expect(()=>approveCashierDay(state,state.cashierDays[0].id,'Owner')).toThrow('التقرير المالي');expect(salesForReports(state)).toHaveLength(0);
});
it('aggregates shared raw ingredients and keeps ordinary sales and production strict',()=>{
 expect(()=>deductInventory([{itemId:drink.id,normalizedQtyInBaseUnit:10}],[raw,seasoning,drink])).toThrow('غير كافٍ');
 const blend={...raw,id:'blend',code:'BL1',category:'manufactured_blend' as const,hasRecipe:true,recipe:[{ingredientId:seasoning.id,ingredientName:seasoning.name,quantity:500,unit:'gram' as const},{ingredientId:raw.id,ingredientName:raw.name,quantity:500,unit:'gram' as const}]};
 expect([...productionNeeds(blend,1,[raw,seasoning,blend])]).toEqual([['raw',1]]);
 expect(()=>productionNeeds(blend,2,[raw,seasoning,blend])).toThrow('غير كافٍ');expect(()=>productionNeeds(drink,1,[raw,seasoning,drink])).toThrow('الإنتاج');
});
it('detects recursive seasoning cycles before consuming stock',()=>{
 const circular={...seasoning,recipe:[{ingredientId:seasoning.id,ingredientName:seasoning.name,quantity:1,unit:'kg' as const}]};
 expect(()=>deductInventory([{itemId:seasoning.id,normalizedQtyInBaseUnit:1}],[raw,circular],{allowNegative:true})).toThrow('دائري');
});
it('adds receipts to the signed stock and values only physically available stock in its moving average',()=>{
 const first=receiveStock({...raw,stock:2},2,200,{id:'P1',date:'2026-11-01',type:'purchase'});expect(first.costPrice).toBe(150);expect(first.stock).toBe(4);
 const second=receiveStock({...raw,stock:-3},2,200,{id:'P2',date:'2026-11-03',type:'purchase'});expect(second.stock).toBe(-1);expect(second.costPrice).toBe(200);expect(second.costHistory?.[0]).toMatchObject({date:'2026-11-03',sourceId:'P2',quantity:2,unitCost:200});
});
it('keeps batch cost controlled by documents after the first purchase',()=>{
 const received=receiveStock(raw,2,200,{id:'P1',date:'2026-11-03',type:'purchase'});
 expect(()=>adjustCatalogItem({...emptyStore,items:[received]},raw.id,{costPrice:1},'Owner')).toThrow('لا تعدلها يدويًا');
});
it('keeps an opening finished-blend valuation when its raw ingredients later change price',()=>{
 const opening={...raw,id:'opening-blend',code:'OB1',category:'manufactured_blend' as const,costingVersion:2 as const,hasRecipe:true,stock:4,openingStock:4,costPrice:100,recipe:[{ingredientId:raw.id,ingredientName:raw.name,quantity:1000,unit:'gram' as const}]};
 const result=recalculateRecipeCosts([{...raw,costPrice:200},opening]);
 expect(result.find(i=>i.id===opening.id)?.costPrice).toBe(100);
 expect(result.find(i=>i.id===opening.id)?.stock).toBe(4);
});
const purchase:PurchaseInvoice={id:'purchase',invoiceNumber:'P1',date:'2026-11-03',supplierId:'supplier',supplierName:'مورد',items:[{itemId:'raw',itemName:raw.name,quantity:2,unit:'kg',purchasePrice:100,previousLastPrice:100,previousWacCost:100,cheapestSupplierPrice:100,cheapestSupplierName:'مورد',updateProductCost:true}],netAmount:200,taxAmount:28,totalAmount:228,paidAmount:228,remainingAmount:0,paymentMethod:'نقدي',accountingVersion:2,partnerName:'Owner'};
it('validates separate purchase tax and rejects new unpaid purchases or a seasoning bought as finished stock',()=>{
 expect(()=>checkPurchase(purchase,[raw])).not.toThrow();expect(()=>checkPurchase({...purchase,paidAmount:200,remainingAmount:28},[raw])).toThrow('مدفوعة بالكامل');
 expect(()=>checkPurchase({...purchase,totalAmount:200},[raw])).toThrow();expect(()=>checkPurchase({...purchase,items:[{...purchase.items[0],itemId:seasoning.id}]},[seasoning])).toThrow();
});
it('compares the latest dated supplier price while retaining every older batch',()=>{
 const result=supplierPurchaseHistory([purchase,{...purchase,id:'old',date:'2026-11-01',items:[{...purchase.items[0],purchasePrice:50}]}],'supplier');expect(result.latest[0].purchasePrice).toBe(100);expect(result.history).toHaveLength(2);
});
it('requires real contact details and normalizes Arabic mobile digits for WhatsApp',()=>{
 expect(()=>checkCustomerDetails({name:'عميل',phone:'01012345678'})).toThrow('المنطقة');
 expect(()=>checkSupplierDetails({name:'مورد',phone:'01012345678',address:'القاهرة'})).toThrow('المندوب');
 expect(whatsAppNumber('٠١٠١٢٣٤٥٦٧٨')).toBe('201012345678');
});
it('rejects duplicate day records from backup input',()=>{const state=paired();expect(()=>validateStore({...state,cashierDays:[state.cashierDays[0],{...state.cashierDays[0],id:'another'}]})).toThrow('مكرر');});
