import type {InventoryItem,StocktakingItemVariance} from '../types/erp';
import type {StoreState} from './storeState';
import {businessDate} from './dates';
import {recalculateRecipeCosts} from './itemCosts';
import {isRecipeOnUse,requiresRecipe} from './itemPolicy';

export function hasItemHistory(state:StoreState,id:string):boolean {
  return state.salesInvoices.some(invoice=>invoice.items.some(line=>line.itemId===id))
    || state.purchaseInvoices.some(invoice=>invoice.items.some(line=>line.itemId===id))
    || state.productionBatches.some(batch=>batch.blendId===id||batch.ingredientsConsumed.some(line=>line.ingredientId===id))
    || state.stocktakingRecords.some(record=>record.itemsAudited.some(line=>line.itemId===id))
    || state.cashierDays.some(day=>day.itemsReport?.lines.some(line=>line.itemId===id)||day.consumption?.some(line=>line.itemId===id));
}
export function canDeleteCatalogItem(state:StoreState,id:string):boolean {
  return !hasItemHistory(state,id) && !state.items.some(item=>item.recipe?.some(line=>line.ingredientId===id));
}

export function adjustCatalogItem(state:StoreState,id:string,patch:Partial<InventoryItem>,actor:string):StoreState {
  const before=state.items.find((item)=>item.id===id);
  if(!before)throw new Error('الصنف لم يعد موجودًا؛ حدّث الشاشة');
  const next={...before,...patch,id:before.id,openingStock:before.openingStock};
  if(before.costingVersion===2&&next.costPrice!==before.costPrice)throw Error('التكلفة تتحدث من فواتير الشراء أو الإنتاج بمتوسط متحرك؛ لا تعدلها يدويًا بعد تسجيل الدفعات');
  if(requiresRecipe(next.category)&&(!next.hasRecipe||!next.recipe?.length))throw Error('هذا النوع يحتاج وصفة؛ أضف صنفًا بوصفته أو أكمل الوصفة من قسم الوصفات');
  if(next.stock<0&&next.stock!==before.stock)throw Error('الرصيد السالب ينشأ من تقرير الكاشير فقط؛ الجرد الفعلي لا يقل عن صفر');
  const historical=hasItemHistory(state,id);
  if(historical&&(before.category!==next.category||before.baseUnit!==next.baseUnit))throw new Error('لا يمكن تغيير نوع أو وحدة صنف له حركات سابقة؛ عرّف صنفًا جديدًا');
  if(!isRecipeOnUse(before)&&before.stock!==0&&(before.baseUnit!==next.baseUnit||isRecipeOnUse(next)))throw new Error('صفّر رصيد الصنف بجرد مستقل قبل تغيير وحدته أو تحويله إلى وصفة عند البيع');
  if(before.category==='drink_recipe'&&next.category!=='drink_recipe'&&Math.abs(next.stock-999)<0.0001)next.stock=0;
  let records=state.stocktakingRecords;
  const previousStock=isRecipeOnUse(before)?0:before.stock;
  if(!isRecipeOnUse(next)&&Math.abs(next.stock-previousStock)>0.0000001){
    const difference=Number((next.stock-previousStock).toFixed(6));
    const line:StocktakingItemVariance={itemId:id,itemName:next.name,baseUnit:next.baseUnit,systemStock:previousStock,actualStock:next.stock,difference,unitCost:next.costPrice,financialDifference:Number((difference*next.costPrice).toFixed(2))};
    records=[{id:crypto.randomUUID(),auditNumber:'ADJ-'+crypto.randomUUID().slice(0,8),date:businessDate(),partnerName:actor,notes:'تعديل رصيد الصنف من الكتالوج',totalShortageValue:Math.max(0,-line.financialDifference),totalSurplusValue:Math.max(0,line.financialDifference),netVarianceValue:line.financialDifference,itemsAudited:[line]},...records];
  }
  return {...state,items:recalculateRecipeCosts(state.items.map((item)=>item.id===id?next:item)),stocktakingRecords:records};
}
