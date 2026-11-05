import type {InventoryItem,UnitType} from '../types/erp';
export const unitLabel=(unit:UnitType):string=>({kg:'كجم',gram:'جم',piece:'قطعة',count:'عدد',liter:'لتر',ml:'مل'})[unit];
export const isCountUnit=(unit:UnitType)=>unit==='piece'||unit==='count';
export function quantityUnits(baseUnit:InventoryItem['baseUnit']):UnitType[]{
 return isCountUnit(baseUnit)?[baseUnit]:baseUnit==='liter'?['ml','liter']:['gram','kg'];
}
