import type {InventoryItem,ItemCostRecord} from '../types/erp';

export function movingAverageCost(stock:number,oldCost:number,received:number,unitCost:number){
 if(![stock,oldCost,received,unitCost].every(Number.isFinite)||received<=0||oldCost<0||unitCost<0)throw Error('بيانات التكلفة أو كمية الاستلام غير صالحة');
 const valuedStock=Math.max(0,stock);
 return Number(((valuedStock*oldCost+received*unitCost)/(valuedStock+received)).toFixed(2));
}
export function receiveStock(item:InventoryItem,quantity:number,unitCost:number,source:{id:string;date:string;type:'purchase'|'production'|'sale_return';postedAt?:string}):InventoryItem{
 const averageCost=movingAverageCost(item.stock,item.costPrice,quantity,unitCost);
 const record:ItemCostRecord={id:crypto.randomUUID(),date:source.date,postedAt:source.postedAt??new Date().toISOString(),sourceType:source.type,sourceId:source.id,quantity,unitCost,averageCost};
 return {...item,stock:Number((item.stock+quantity).toFixed(6)),costPrice:averageCost,costingVersion:2,costHistory:[...(item.costHistory??[]),record]};
}
