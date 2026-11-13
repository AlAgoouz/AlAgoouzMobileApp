import {expect,it} from 'vitest';
import type {CashierDay,PurchaseInvoice} from '../src/types/erp';
import {INITIAL_ITEMS} from '../src/data/initialData';
import {cashierCostDetails,correctedCashierCost} from '../src/lib/cashierCosts';
import {salesForReports} from '../src/lib/cashierDays';

const item=INITIAL_ITEMS.find(row=>row.category==='raw_bean')!;
function day(date:string,quantity:number,debt:number,price:number):CashierDay{
  const totalCost=quantity*price;
  return {id:date,date,status:'approved',approvedAt:date+'T09:00:00.000Z',totalCost,
    financialReport:{fileName:'financial.xls',sha256:'a'.repeat(64),uploadedAt:date,totalRevenue:200},
    consumption:[{itemId:item.id,quantity,unitCost:price,totalCost}],
    shortages:debt>0?[{itemId:item.id,shortage:debt}]:[]};
}
function buy(date:string,quantity:number,stock:number,price:number):PurchaseInvoice{
  return {id:date,invoiceNumber:'PUR-'+date,date,createdAt:date+'T12:00:00.000Z',supplierId:'supplier',supplierName:'Supplier',
    inventoryBefore:[{...item,stock}],items:[{itemId:item.id,itemName:item.name,quantity,unit:'kg',
      purchasePrice:price,previousLastPrice:0,previousWacCost:0,cheapestSupplierPrice:0,cheapestSupplierName:'',updateProductCost:true}],
    totalAmount:quantity*price,paidAmount:quantity*price,remainingAmount:0,paymentMethod:'نقدي',partnerName:'Owner'};
}

it('allocates partial deliveries to the oldest open shortage and updates original-day profit',()=>{
  const older=day('2026-11-01',3,2,10);
  const later=day('2026-11-02',2,4,10);
  const first=buy('2026-11-03',1,-4,20);
  const second=buy('2026-11-04',2,-3,30);
  const details=cashierCostDetails([later,older],[second,first]);
  expect(details.get(older.id)?.[0]).toMatchObject({covered:2,uncovered:0,totalCost:60,
    allocations:[{quantity:1,unitCost:20},{quantity:1,unitCost:30}]});
  expect(details.get(later.id)?.[0]).toMatchObject({covered:1,uncovered:1,totalCost:40});
  expect(salesForReports({salesInvoices:[],cashierDays:[older,later],purchaseInvoices:[first,second]}))
    .toMatchObject([{date:older.date,totalAmount:200,totalCost:60,netProfit:140},
      {date:later.date,totalAmount:200,totalCost:40,netProfit:160}]);
  expect(older.totalCost).toBe(30);
});

it('does not assign unknown historical stock debt or a cancelled purchase to a cashier day',()=>{
  const recorded=day('2026-11-01',1,3,10);
  const unknownCoverage=buy('2026-11-02',2,-3,20);
  const cancelled={...buy('2026-11-03',1,-1,20),isCancelled:true};
  const realCoverage=buy('2026-11-04',1,-1,30);
  expect(correctedCashierCost(recorded,cashierCostDetails([recorded],[unknownCoverage,cancelled]).get(recorded.id))).toBe(10);
  expect(correctedCashierCost(recorded,cashierCostDetails([recorded],[unknownCoverage,cancelled,realCoverage]).get(recorded.id))).toBe(30);
});

it('does not apply later purchases to a shortage already cleared by a stock adjustment',()=>{
  const first=day('2026-11-01',2,2,10);
  const later=day('2026-11-03',1,0,10);
  const afterCount=buy('2026-11-04',1,0,20);
  const results=cashierCostDetails([first,later],[afterCount]);
  expect(results.get(first.id)?.[0]).toMatchObject({covered:0,uncovered:2,totalCost:20,allocations:[]});
});
