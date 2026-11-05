// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ItemDefinitionModal} from '../src/components/ItemDefinitionModal';
import {CatalogProductRows} from '../src/components/CatalogProductRows';
import {INITIAL_ITEMS} from '../src/data/initialData';
import {convertToBaseUnit,calculateRecipeTotalCost} from '../src/lib/itemCosts';
import {quantityUnits} from '../src/lib/units';
import {mapRawCashierRows,reviewedCashierRows} from '../src/lib/cashierRows';
import {deductInventory} from '../src/lib/inventory';
import {receiveStock} from '../src/lib/costing';
import {emptyStore,validateStore,toCloud,fromCloud} from '../src/lib/storeState';
const item={...INITIAL_ITEMS[0],id:'counted',code:'C1',name:'صنف بالعدد',category:'direct_product' as const,baseUnit:'count' as const,stock:10,openingStock:10,costPrice:4,retailPrice:7,hasRecipe:false,recipe:[]};
afterEach(cleanup);
it('keeps count quantities one-to-one and rejects weight or volume conversions',()=>{
 for(const unit of ['count','piece'] as const){expect(convertToBaseUnit(3,unit,'count')).toBe(3);expect(convertToBaseUnit(3,'count',unit)).toBe(3);}
 for(const unit of ['kg','gram','liter','ml'] as const){expect(()=>convertToBaseUnit(3,unit,'count')).toThrow();expect(()=>convertToBaseUnit(3,'count',unit==='gram'?'kg':unit==='ml'?'liter':unit)).toThrow();}
 expect(quantityUnits('count')).toEqual(['count']);
 expect(calculateRecipeTotalCost([{ingredientId:item.id,ingredientName:item.name,quantity:2,unit:'count'}],[item])).toBe(8);
});
it('saves a distinct count unit and round-trips it through the cloud schema',async()=>{
 const save=vi.fn(()=>true);render(<ItemDefinitionModal items={[]} onSave={save} onClose={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'direct_product'}});
 fireEvent.change(screen.getByLabelText('اسم الصنف'),{target:{value:item.name}});
 fireEvent.change(screen.getByLabelText('الوحدة الأساسية'),{target:{value:'count'}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));await waitFor(()=>expect(save).toHaveBeenCalledOnce());
 expect(save.mock.calls[0][0]).toMatchObject({baseUnit:'count'});
 const state=validateStore({...emptyStore,items:[item]});expect(fromCloud(toCloud(state)).items[0].baseUnit).toBe('count');
});
it('deducts count sales and compatible cashier piece labels without a weight multiplier',()=>{
 const rows=mapRawCashierRows([{name:item.name,quantity:3,unit:'عدد'}],[item]);expect(rows[0]).toMatchObject({unitHint:'count',quantity:3,matchedItem:item});expect(rows[0].error).toBeUndefined();
 expect(reviewedCashierRows([{name:'POS alias',quantity:3}],[item],{0:{itemId:item.id,unit:'piece'}})[0].error).toBeUndefined();
 const lines=[{itemId:item.id,normalizedQtyInBaseUnit:convertToBaseUnit(rows[0].quantity,rows[0].unitHint,item.baseUnit)}];
 expect(deductInventory(lines,[item])[0].stock).toBe(7);
 const received=receiveStock(item,2,10,{id:'purchase',date:'2026-11-05',type:'purchase'});
 expect(received).toMatchObject({baseUnit:'count',stock:12,costPrice:5});
 expect(mapRawCashierRows([{name:item.name,quantity:3,unit:'kg'}],[item])[0].error).toBeTruthy();
});
it('labels count stock and unit prices correctly in the product register',()=>{
 render(<CatalogProductRows items={[item]} canManage={false} onEdit={()=>{}} onDelete={()=>{}} onRecipe={()=>{}}/>);
 expect(screen.getByText('التكلفة / عدد')).toBeTruthy();expect(screen.getByText('البيع / عدد')).toBeTruthy();expect(screen.getByText(/١٠ عدد/)).toBeTruthy();
});
