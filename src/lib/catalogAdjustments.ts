import type {InventoryItem,StocktakingItemVariance} from '../types/erp';
import type {StoreState} from './storeState';
import {businessDate} from './dates';
import {recalculateRecipeCosts} from './itemCosts';

export function adjustCatalogItem(state:StoreState,id:string,patch:Partial<InventoryItem>,actor:string):StoreState {
  const before=state.items.find((item)=>item.id===id);
  if(!before)throw new Error('الصنف لم يعد موجودًا؛ حدّث الشاشة');
  const next={...before,...patch,id:before.id,openingStock:before.openingStock};
  const historical=state.salesInvoices.some((invoice)=>invoice.items.some((line)=>line.itemId===id))
    ||state.purchaseInvoices.some((invoice)=>invoice.items.some((line)=>line.itemId===id))
    ||state.productionBatches.some((batch)=>batch.blendId===id||batch.ingredientsConsumed.some((line)=>line.ingredientId===id))
    ||state.stocktakingRecords.some((record)=>record.itemsAudited.some((line)=>line.itemId===id));
  if(historical&&(before.category!==next.category||before.baseUnit!==next.baseUnit))throw new Error('لا يمكن تغيير نوع أو وحدة صنف له حركات سابقة؛ عرّف صنفًا جديدًا');
  if(before.category!=='drink_recipe'&&before.stock>0&&(before.baseUnit!==next.baseUnit||next.category==='drink_recipe'))throw new Error('صفّر رصيد الصنف بجرد مستقل قبل تغيير وحدته أو تحويله إلى مشروب');
  if(before.category==='drink_recipe'&&next.category!=='drink_recipe'&&Math.abs(next.stock-999)<0.0001)next.stock=0;
  let records=state.stocktakingRecords;
  const previousStock=before.category==='drink_recipe'?0:before.stock;
  if(next.category!=='drink_recipe'&&Math.abs(next.stock-previousStock)>0.0000001){
    const difference=Number((next.stock-previousStock).toFixed(6));
    const line:StocktakingItemVariance={itemId:id,itemName:next.name,baseUnit:next.baseUnit,systemStock:previousStock,actualStock:next.stock,difference,unitCost:next.costPrice,financialDifference:Number((difference*next.costPrice).toFixed(2))};
    records=[{id:crypto.randomUUID(),auditNumber:'ADJ-'+crypto.randomUUID().slice(0,8),date:businessDate(),partnerName:actor,notes:'تعديل رصيد الصنف من الكتالوج',totalShortageValue:Math.max(0,-line.financialDifference),totalSurplusValue:Math.max(0,line.financialDifference),netVarianceValue:line.financialDifference,itemsAudited:[line]},...records];
  }
  return {...state,items:recalculateRecipeCosts(state.items.map((item)=>item.id===id?next:item)),stocktakingRecords:records};
}
