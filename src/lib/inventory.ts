import type { InventoryItem, SalesInvoiceItem } from "../types/erp";
import { convertToBaseUnit } from "./itemCosts";
import { businessDate } from "./dates";
import {isRecipeOnUse} from './itemPolicy';

type ConsumptionLine=Pick<SalesInvoiceItem,'itemId'|'normalizedQtyInBaseUnit'>;
function requirementCollector(catalog:InventoryItem[]){
 const byId=new Map(catalog.map(item=>[item.id,item]));
 const needs=new Map<string,number>();
 const add=(id:string,quantity:number,path:Set<string>)=>{
  const item=byId.get(id);
  if(!item||!Number.isFinite(quantity)||quantity<=0)throw Error('مكون أو كمية غير صالحة');
  if(path.has(id))throw Error('تحتوي الوصفة اعتمادًا دائريًا');
  if(item.category==='drink_recipe'&&path.size)throw Error('لا يمكن استخدام مشروب كمكون في وصفة أخرى');
  if(isRecipeOnUse(item)){
   if(!item.hasRecipe||!item.recipe?.length)throw Error(`وصفة ناقصة: ${item.name}`);
   const next=new Set(path);next.add(id);
   for(const ing of item.recipe){
    const raw=byId.get(ing.ingredientId);if(!raw||!Number.isFinite(ing.quantity)||ing.quantity<=0)throw Error('مكون مفقود أو غير صالح');
    add(raw.id,convertToBaseUnit(ing.quantity,ing.unit,raw.baseUnit)*quantity,next);
   }
  }else needs.set(id,(needs.get(id)??0)+quantity);
 };
 return {needs,add};
}

export function inventoryDeductions(
  lines: readonly ConsumptionLine[],
  catalog: InventoryItem[],
): Map<string, number> {
  const {needs,add}=requirementCollector(catalog);
  for (const line of lines) {
    if (
      !Number.isFinite(line.normalizedQtyInBaseUnit) ||
      line.normalizedQtyInBaseUnit <= 0
    )
      throw new Error("كمية البيع يجب أن تكون أكبر من صفر");
    add(line.itemId,line.normalizedQtyInBaseUnit,new Set());
  }
  return needs;
}
export function deductInventory(
  lines: readonly ConsumptionLine[],
  catalog: InventoryItem[],
  options:{allowNegative?:boolean;date?:string}={},
): InventoryItem[] {
  const needs = inventoryDeductions(lines, catalog);
  for (const [id, amount] of needs) {
    const item = catalog.find((i) => i.id === id)!;
    if (!options.allowNegative && item.stock + 0.0000001 < amount)
      throw new Error(
        `رصيد ${item.name} غير كافٍ؛ المتاح ${item.stock} والمطلوب ${Number(amount.toFixed(6))}`,
      );
  }
  return catalog.map((item) =>
    needs.has(item.id)
      ? {
          ...item,
          stock: Number((item.stock - needs.get(item.id)!).toFixed(6)),
          lastSoldDate: options.date??businessDate(),
        }
      : item,
  );
}
export function productionNeeds(
  blend: InventoryItem,
  quantity: number,
  catalog: InventoryItem[],
  options:{checkStock?:boolean}={},
): Map<string, number> {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error("كمية الإنتاج يجب أن تكون أكبر من صفر");
  if (blend.category !== "manufactured_blend" || blend.baseUnit !== "kg")
    throw new Error("الإنتاج متاح لتوليفة بن بالكيلو فقط");
  if (!blend.recipe?.length) throw new Error("التوليفة ليس لها وصفة");
  const {needs,add}=requirementCollector(catalog);
  for (const ing of blend.recipe) {
    const raw = catalog.find((i) => i.id === ing.ingredientId);
    if (
      !raw ||
      raw.id === blend.id ||
      raw.category === "drink_recipe" ||
      ing.quantity <= 0 ||
      !Number.isFinite(ing.quantity)
    )
      throw new Error("الوصفة تحتوي مكونًا مفقودًا أو غير صالح");
    add(raw.id,convertToBaseUnit(ing.quantity,ing.unit,raw.baseUnit)*quantity,new Set([blend.id]));
  }
  for (const [id, amount] of needs) {
    const raw = catalog.find((i) => i.id === id)!;
    if (options.checkStock!==false && raw.stock + 0.0000001 < amount)
      throw new Error(
        `رصيد ${raw.name} غير كافٍ؛ المتاح ${raw.stock} والمطلوب ${amount}`,
      );
  }
  return needs;
}
