import {it,expect} from 'vitest';
import {reviewedCashierRows} from '../src/lib/cashierRows';
import {INITIAL_ITEMS} from '../src/data/initialData';
const item=INITIAL_ITEMS.find(i=>i.baseUnit==='kg')!;
it('requires explicit item and unit and leaves original quantities, prices and names intact',()=>{
 const source=[{name:'Unknown cashier name',quantity:'٢٥٠',total:'12.50'}];
 const original=JSON.stringify(source);
 expect(reviewedCashierRows(source,[item],{})[0].error).toBeTruthy();
 expect(reviewedCashierRows(source,[item],{0:{itemId:item.id,unit:''}})[0].matchedItem).toBeUndefined();
 const row=reviewedCashierRows(source,[item],{0:{itemId:item.id,unit:'gram'}})[0];
 expect(row.error).toBeUndefined();expect(row.matchedItem?.id).toBe(item.id);expect(row.quantity).toBe(250);expect(row.unitHint).toBe('gram');expect(row.totalPrice).toBe(12.5);expect(row.rawName).toBe(source[0].name);expect(JSON.stringify(source)).toBe(original);
});
it('cannot hide negative quantities, invalid prices, wrong units or removed catalog entries behind manual matching',()=>{
 for(const values of [{quantity:-1,total:2},{quantity:0,total:2},{quantity:1,total:'unknown'},{quantity:1,total:-2}])expect(reviewedCashierRows([{name:'unknown',...values}],[item],{0:{itemId:item.id,unit:'kg'}})[0].error).toBeTruthy();
 expect(reviewedCashierRows([{name:'unknown',quantity:1}],[item],{0:{itemId:item.id,unit:'piece'}})[0].error).toBeTruthy();
 expect(reviewedCashierRows([{name:'unknown',quantity:1}],[],{0:{itemId:item.id,unit:'kg'}})[0].matchedItem).toBeUndefined();
});

it('keeps the physical weight of an explicit fractional pack during manual matching',()=>{
 const rows=[{name:'POS alias',quantity:8,unit:'ربع كيلو'}];
 expect(reviewedCashierRows(rows,[item],{0:{itemId:item.id,unit:'kg'}})[0]).toMatchObject({quantity:2,unitHint:'kg',packFactor:0.25,error:undefined});
 expect(reviewedCashierRows(rows,[item],{0:{itemId:item.id,unit:'gram'}})[0]).toMatchObject({quantity:2000,unitHint:'gram',error:undefined});
});
