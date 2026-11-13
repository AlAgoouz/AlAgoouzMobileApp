import {multiplyMoney,roundMoney,sumMoney} from '../src/lib/money';
import { expect, it } from "vitest";
import {
  checkPurchase,
  prepareSale,
  checkStocktaking,
  nextItemCode,
  itemEditPatch,
} from "../src/lib/operationChecks";
import { recalculateRecipeCosts } from "../src/lib/itemCosts";
import { validateStore, emptyStore } from "../src/lib/storeState";
import { INITIAL_ITEMS } from "../src/data/initialData";
const bean = {
  ...INITIAL_ITEMS.find((i) => i.category === "raw_bean")!,
  id: "bean",
  code: "B1",
  stock: 10,
  costPrice: 100,
  recipe: [],
  hasRecipe: false,
};
const purchase = () => ({
  date: "2026-11-01",
  supplierId: "s",
  supplierName: "Supplier",
  items: [
    {
      itemId: bean.id,
      itemName: bean.name,
      quantity: 2,
      unit: "كجم",
      purchasePrice: 120,
      newRetailPrice: 0,
      previousLastPrice: 100,
      previousWacCost: 100,
      cheapestSupplierPrice: 100,
      cheapestSupplierName: "Supplier",
      updateProductCost: true,
    },
  ],
  totalAmount: 240,
  paidAmount: 40,
  remainingAmount: 200,
  paymentMethod: "جزئي" as const,
  partnerName: "Owner",
});
const sale = () => ({
  date: "2026-11-01",
  saleType: "retail" as const,
  customerName: "Cash",
  items: [
    {
      itemId: bean.id,
      itemName: bean.name,
      category: bean.category,
      quantity: 0.25,
      normalizedQtyInBaseUnit: 0.25,
      unitLabel: "ربع كيلو",
      unitPrice: 200,
      unitCost: 1,
      totalPrice: 50,
      totalCost: 0.25,
      profit: 49.75,
    },
  ],
  subtotal: 50,
  discount: 5,
  totalAmount: 45,
  totalCost: 0.25,
  netProfit: 44.75,
  paidAmount: 45,
  remainingAmount: 0,
  paymentMethod: "نقدي" as const,
  partnerName: "Owner",
});
it("generates an unused blend code even after all 89 original codes are occupied", () => {
  const items = Array.from({ length: 89 }, (_, i) => ({
    code: `BL-${310 + i}`,
  }));
  expect(nextItemCode(items, "BL", 310)).toBe("BL-399");
});
it("accepts zero sale prices on a valid purchase", () =>
  expect(() => checkPurchase(purchase(), [bean])).not.toThrow());
it.each(["missing", "duplicate", "total", "overpayment", "date"])(
  "rejects invalid purchase %s before changing stock",
  (kind) => {
    const data = purchase();
    if (kind === "missing") data.items[0].itemId = "deleted";
    if (kind === "duplicate") data.items.push(data.items[0]);
    if (kind === "total") data.totalAmount = 200;
    if (kind === "overpayment") data.paidAmount = 250;
    if (kind === "date") data.date = "2026-02-30";
    expect(() => checkPurchase(data, [bean])).toThrow();
    expect(bean.stock).toBe(10);
  },
);
it("prices a sale from current cost and preserves its agreed selling price", () => {
  const result = prepareSale(sale(), [bean]);
  expect(result.totalCost).toBe(25);
  expect(result.netProfit).toBe(20);
  expect(result.items[0].unitPrice).toBe(200);
});
it.each(["line", "total", "discount", "payment"])(
  "rejects inconsistent sale %s",
  (kind) => {
    const data = sale();
    if (kind === "line") data.items[0].totalPrice = 60;
    if (kind === "total") data.totalAmount = 40;
    if (kind === "discount") data.discount = -1;
    if (kind === "payment") data.paidAmount = 60;
    expect(() => prepareSale(data, [bean])).toThrow();
  },
);
const variance = () => ({
  itemId: bean.id,
  itemName: bean.name,
  baseUnit: bean.baseUnit,
  systemStock: 10,
  actualStock: 9.5,
  difference: 99,
  unitCost: 1,
  financialDifference: 99,
});
it("derives inventory count differences and value from the current catalog", () => {
  const [result] = checkStocktaking([variance()], [bean]);
  expect(result.difference).toBe(-0.5);
  expect(result.financialDifference).toBe(-50);
});
it("rejects a stale inventory count before replacing later movements", () => {
  expect(() => checkStocktaking([variance()], [{ ...bean, stock: 8 }])).toThrow(
    "تغير رصيد",
  );
});
it("does not overwrite stock when an older edit only changes a price", () => {
  expect(
    itemEditPatch(bean, { ...bean, stock: 8 }, { ...bean, retailPrice: 250 }),
  ).toEqual({ retailPrice: 250 });
});
it("rejects simultaneous edits to the same field", () => {
  expect(() =>
    itemEditPatch(bean, { ...bean, stock: 8 }, { ...bean, stock: 9 }),
  ).toThrow("تغيرت بيانات");
});
it("allows a new recipe draft but refuses duplicate product codes", () => {
  const draft = {
    ...bean,
    id: "blend",
    code: "BL-310",
    category: "manufactured_blend" as const,
    stock: 0,
    hasRecipe: false,
    recipe: [],
  };
  expect(
    validateStore({ ...emptyStore, items: [bean, draft] }).items,
  ).toHaveLength(2);
  expect(() =>
    validateStore({ ...emptyStore, items: [bean, { ...draft, code: "b1" }] }),
  ).toThrow("أكواد");
});
it("recalculates multiple recipe levels independently of catalog order", () => {
  const first = {
    ...bean,
    id: "blend1",
    hasRecipe: true,
    recipe: [
      {
        ingredientId: bean.id,
        ingredientName: bean.name,
        quantity: 0.5,
        unit: "kg" as const,
      },
    ],
    costPrice: 1,
  };
  const second = {
    ...first,
    id: "blend2",
    recipe: [
      {
        ingredientId: first.id,
        ingredientName: "Blend",
        quantity: 2,
        unit: "kg" as const,
      },
    ],
  };
  const result = recalculateRecipeCosts([second, first, bean]);
  expect(result.map((i) => i.costPrice)).toEqual([100, 50, 100]);
});

it('rounds decimal products at a cent like PostgreSQL numeric and sums exact cents',()=>{
  expect(multiplyMoney(0.015,67)).toBe(1.01);
  expect(roundMoney(1.005)).toBe(1.01);
  expect(roundMoney(-1.005)).toBe(-1.01);
  expect(sumMoney([0.1,0.2,-0.3])).toBe(0);
});
