import type { InventoryItem, RecipeIngredient, UnitType } from "../types/erp";

export function getIngredientCostContribution(
  ingredient: RecipeIngredient,
  allItems: InventoryItem[],
): number {
  const target = allItems.find((i) => i.id === ingredient.ingredientId);
  if (!target) throw new Error("مكون الوصفة غير موجود");

  const multiplier = convertToBaseUnit(
    ingredient.quantity,
    ingredient.unit,
    target.baseUnit,
  );
  return Number((multiplier * target.costPrice).toFixed(2));
}

export function calculateRecipeTotalCost(
  recipe: RecipeIngredient[] | undefined,
  allItems: InventoryItem[],
): number {
  if (!recipe || recipe.length === 0) return 0;
  const total = recipe.reduce(
    (sum, ing) => sum + getIngredientCostContribution(ing, allItems),
    0,
  );
  return Number(total.toFixed(2));
}

export function convertToBaseUnit(
  qty: number,
  fromUnit: UnitType,
  baseUnit: "kg" | "piece" | "liter",
): number {
  if (baseUnit === "kg" && fromUnit === "gram") return qty / 1000;
  if (baseUnit === "liter" && fromUnit === "ml") return qty / 1000;
  if (fromUnit === baseUnit) return qty;
  throw new Error("وحدة الكمية لا تطابق وحدة الصنف");
}

export function recalculateRecipeCosts(
  catalog: InventoryItem[],
): InventoryItem[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const costs = new Map<string, number>();
  const visiting = new Set<string>();
  const cost = (id: string): number => {
    if (costs.has(id)) return costs.get(id)!;
    const item = byId.get(id);
    if (!item) throw new Error("مكون الوصفة غير موجود");
    if (visiting.has(id)) throw new Error("تحتوي الوصفات اعتمادًا دائريًا");
    visiting.add(id);
    const value =
      item.hasRecipe && item.recipe?.length && !(item.category==='manufactured_blend'&&item.costingVersion===2)
        ? Number(
            item.recipe
              .reduce((total, ingredient) => {
                const raw = byId.get(ingredient.ingredientId);
                if (!raw) throw new Error("مكون الوصفة غير موجود");
                return (
                  total +
                  Number(
                    (
                      convertToBaseUnit(
                        ingredient.quantity,
                        ingredient.unit,
                        raw.baseUnit,
                      ) * cost(raw.id)
                    ).toFixed(2),
                  )
                );
              }, 0)
              .toFixed(2),
          )
        : item.costPrice;
    visiting.delete(id);
    costs.set(id, value);
    return value;
  };
  return catalog.map((item) => ({ ...item, costPrice: cost(item.id) }));
}
