import {it,expect} from 'vitest';
import {adjustCatalogItem,canDeleteCatalogItem} from '../src/lib/catalogAdjustments';
import {emptyStore} from '../src/lib/storeState';
import {INITIAL_ITEMS} from '../src/data/initialData';
import {itemEditPatch} from '../src/lib/operationChecks';
const bean={...INITIAL_ITEMS.find((item)=>item.category==='raw_bean')!,stock:10};
it('preserves financial and stock history when assigning a unique cashier code and catches concurrent code changes',()=>{
 const state={...emptyStore,items:[bean]};const changed=adjustCatalogItem(state,bean.id,{code:' 00100010 '},'Owner');
 expect(changed).toEqual({...state,items:[{...bean,code:'00100010'}]});
 expect(()=>adjustCatalogItem(state,bean.id,{code:' '},'Owner')).toThrow('كود المنتج مطلوب');
 expect(()=>itemEditPatch(bean,{...bean,code:'CHANGED'},{code:'100010'})).toThrow('تغيرت بيانات الصنف');
});
it('protects item history in cashier reports, production and stocktaking before attempting a save',()=>{
  const state={...emptyStore,items:[{...bean,stock:0}]};
  const day={id:'day',date:'2026-11-03',status:'pending',itemsReport:{lines:[{itemId:bean.id}]}} as any;
  const reported={...state,cashierDays:[day]};
  expect(canDeleteCatalogItem(reported,bean.id)).toBe(false);
  expect(()=>adjustCatalogItem(reported,bean.id,{category:'snack'},'Owner')).toThrow('حركات سابقة');
  expect(canDeleteCatalogItem({...state,productionBatches:[{blendId:bean.id,ingredientsConsumed:[]} as any]},bean.id)).toBe(false);
  expect(canDeleteCatalogItem({...state,stocktakingRecords:[{itemsAudited:[{itemId:bean.id}]} as any]},bean.id)).toBe(false);
  expect(canDeleteCatalogItem(state,bean.id)).toBe(true);
});
it('records a manual stock edit as a complete adjustment and preserves its opening quantity',()=>{
  const state={...emptyStore,items:[{...bean,openingStock:10}]};
  const changed=adjustCatalogItem(state,bean.id,{stock:8,openingStock:999},'Owner');
  expect(changed.items[0].stock).toBe(8);
  expect(changed.items[0].openingStock).toBe(10);
  expect(changed.stocktakingRecords[0].itemsAudited[0]).toMatchObject({systemStock:10,actualStock:8,difference:-2});
  expect(changed.stocktakingRecords[0].totalShortageValue).toBe(2*bean.costPrice);
  expect(adjustCatalogItem(state,bean.id,{retailPrice:0},'Owner').stocktakingRecords).toHaveLength(0);
});
it('refuses to reinterpret the unit of a stocked item and clears only unused drink phantom stock',()=>{
  expect(()=>adjustCatalogItem({...emptyStore,items:[bean]},bean.id,{baseUnit:'piece'},'Owner')).toThrow('صفّر');
  const drink={...bean,category:'drink_recipe' as const,baseUnit:'piece' as const,stock:999,hasRecipe:false,recipe:[]};
  const changed=adjustCatalogItem({...emptyStore,items:[drink]},drink.id,{category:'direct_product'},'Owner');
  expect(changed.items[0].stock).toBe(0);
  expect(changed.stocktakingRecords).toHaveLength(0);
});
