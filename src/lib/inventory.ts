import type { InventoryItem, SalesInvoiceItem } from "../types/erp";
import { convertToBaseUnit } from "./itemCosts";
import { businessDate } from "./dates";

export function inventoryDeductions(
  lines: SalesInvoiceItem[],
  catalog: InventoryItem[],
): Map<string, number> {
  const needs = new Map<string, number>();
  const add = (id: string, quantity: number) =>
    needs.set(id, (needs.get(id) ?? 0) + quantity);
  for (const line of lines) {
    if (
      !Number.isFinite(line.normalizedQtyInBaseUnit) ||
      line.normalizedQtyInBaseUnit <= 0
    )
      throw new Error("كمية البيع يجب أن تكون أكبر من صفر");
    const item = catalog.find((i) => i.id === line.itemId);
    if (!item) throw new Error("صنف الفاتورة غير موجود");
    if (item.category === "drink_recipe") {
      if (!item.hasRecipe || !item.recipe?.length)
        throw new Error(`وصفة ناقصة: ${item.name}`);
      for (const ing of item.recipe) {
        const raw = catalog.find((i) => i.id === ing.ingredientId);
        if (!raw || !Number.isFinite(ing.quantity) || ing.quantity <= 0)
          throw new Error(`مكون مفقود أو غير صالح في ${item.name}`);
        if (raw.category === "drink_recipe")
          throw new Error("لا يمكن استخدام مشروب كمكون مخزني");
        add(
          raw.id,
          convertToBaseUnit(ing.quantity, ing.unit, raw.baseUnit) *
            line.normalizedQtyInBaseUnit,
        );
      }
    } else add(item.id, line.normalizedQtyInBaseUnit);
  }
  return needs;
}
export function deductInventory(
  lines: SalesInvoiceItem[],
  catalog: InventoryItem[],
): InventoryItem[] {
  const needs = inventoryDeductions(lines, catalog);
  for (const [id, amount] of needs) {
    const item = catalog.find((i) => i.id === id)!;
    if (item.stock + 0.0000001 < amount)
      throw new Error(
        `رصيد ${item.name} غير كافٍ؛ المتاح ${item.stock} والمطلوب ${Number(amount.toFixed(6))}`,
      );
  }
  return catalog.map((item) =>
    needs.has(item.id)
      ? {
          ...item,
          stock: Number((item.stock - needs.get(item.id)!).toFixed(6)),
          lastSoldDate: businessDate(),
        }
      : item,
  );
}
export function productionNeeds(
  blend: InventoryItem,
  quantity: number,
  catalog: InventoryItem[],
): Map<string, number> {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error("كمية الإنتاج يجب أن تكون أكبر من صفر");
  if (blend.category !== "manufactured_blend" || blend.baseUnit !== "kg")
    throw new Error("الإنتاج متاح لتوليفة بن بالكيلو فقط");
  if (!blend.recipe?.length) throw new Error("التوليفة ليس لها وصفة");
  const needs = new Map<string, number>();
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
    needs.set(
      raw.id,
      (needs.get(raw.id) ?? 0) +
        convertToBaseUnit(ing.quantity, ing.unit, raw.baseUnit) * quantity,
    );
  }
  for (const [id, amount] of needs) {
    const raw = catalog.find((i) => i.id === id)!;
    if (raw.stock + 0.0000001 < amount)
      throw new Error(
        `رصيد ${raw.name} غير كافٍ؛ المتاح ${raw.stock} والمطلوب ${amount}`,
      );
  }
  return needs;
}
