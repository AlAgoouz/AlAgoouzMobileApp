import type {
  InventoryItem,
  PurchaseInvoice,
  SalesInvoice,
  StocktakingItemVariance,
} from "../types/erp";

const round = (value: number) => Number(value.toFixed(2));
const validMoney = (value: number) => Number.isFinite(value) && value >= 0;
function sameMoney(actual: number, expected: number) {
  if (!validMoney(actual) || Math.abs(actual - expected) > 0.011)
    throw new Error(
      "مبالغ الفاتورة لا تطابق الأصناف أو توزيع المدفوع والمتبقي؛ راجع الفاتورة.",
    );
}
function dateValid(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error("تاريخ الفاتورة غير صالح");
}
export function itemEditPatch(
  original: InventoryItem,
  live: InventoryItem | undefined,
  edited: Partial<InventoryItem>,
): Partial<InventoryItem> {
  if (!live)
    throw new Error("الصنف لم يعد موجودًا؛ أغلق النافذة وراجع الكتالوج");
  const patch: Partial<InventoryItem> = {};
  for (const key of [
    "name",
    "category",
    "stock",
    "minStock",
    "costPrice",
    "retailPrice",
    "wholesalePrice",
  ] as const) {
    if (edited[key] === undefined || edited[key] === original[key]) continue;
    if (live[key] !== original[key])
      throw new Error(
        "تغيرت بيانات الصنف أثناء التعديل؛ أعد فتح النافذة وراجع القيم",
      );
    Object.assign(patch, { [key]: edited[key] });
  }
  return patch;
}
export function nextItemCode(
  items: Pick<InventoryItem, "code">[],
  prefix: string,
  start: number,
) {
  const suffixes = items
    .map(({ code }) =>
      code.startsWith(`${prefix}-`)
        ? Number(code.slice(prefix.length + 1))
        : NaN,
    )
    .filter((value) => Number.isSafeInteger(value) && value >= 0);
  const next =
    suffixes.reduce((max, value) => Math.max(max, value), start - 1) + 1;
  return `${prefix}-${next}`;
}
export function checkPurchase(
  data: Omit<PurchaseInvoice, "id" | "invoiceNumber">,
  items: InventoryItem[],
) {
  dateValid(data.date);
  const ids = new Set<string>();
  if (!data.items.length) throw new Error("أضف صنفًا للفاتورة");
  let total = 0;
  for (const line of data.items) {
    const item = items.find((i) => i.id === line.itemId);
    if (
      !item ||
      item.category === "drink_recipe" ||
      item.category === "manufactured_blend" ||
      ids.has(line.itemId)
    )
      throw new Error("صنف شراء غير موجود أو مكرر أو مخصص للإنتاج");
    ids.add(line.itemId);
    if (
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      !validMoney(line.purchasePrice) ||
      (line.newRetailPrice !== undefined && !validMoney(line.newRetailPrice)) ||
      (line.newWholesalePrice !== undefined &&
        !validMoney(line.newWholesalePrice))
    )
      throw new Error("راجع كميات الشراء والأسعار");
    total += round(line.quantity * line.purchasePrice);
  }
  sameMoney(data.totalAmount, round(total));
  if (
    !validMoney(data.paidAmount) ||
    data.paidAmount > data.totalAmount + 0.001
  )
    throw new Error("المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة");
  sameMoney(data.remainingAmount, round(data.totalAmount - data.paidAmount));
}
export function prepareSale(
  data: Omit<SalesInvoice, "id" | "invoiceNumber">,
  items: InventoryItem[],
) {
  dateValid(data.date);
  if (!data.items.length) throw new Error("أضف صنفًا للفاتورة");
  const lines = data.items.map((line) => {
    const item = items.find((i) => i.id === line.itemId);
    if (!item || !item.canSellDirectly)
      throw new Error("صنف الفاتورة غير موجود أو غير متاح للبيع");
    if (
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      !Number.isFinite(line.normalizedQtyInBaseUnit) ||
      line.normalizedQtyInBaseUnit <= 0 ||
      !validMoney(line.unitPrice)
    )
      throw new Error("كميات البيع أو أسعاره غير صالحة");
    const totalPrice = round(line.unitPrice * line.normalizedQtyInBaseUnit);
    sameMoney(line.totalPrice, totalPrice);
    const totalCost = round(item.costPrice * line.normalizedQtyInBaseUnit);
    return {
      ...line,
      itemName: item.name,
      category: item.category,
      unitCost: item.costPrice,
      totalPrice,
      totalCost,
      profit: round(totalPrice - totalCost),
    };
  });
  const subtotal = round(lines.reduce((sum, line) => sum + line.totalPrice, 0));
  sameMoney(data.subtotal, subtotal);
  if (!validMoney(data.discount) || data.discount > subtotal)
    throw new Error("الخصم يجب أن يكون بين صفر وإجمالي الأصناف");
  sameMoney(data.totalAmount, round(subtotal - data.discount));
  if (
    !validMoney(data.paidAmount) ||
    data.paidAmount > data.totalAmount + 0.001
  )
    throw new Error("المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة");
  sameMoney(data.remainingAmount, round(data.totalAmount - data.paidAmount));
  if (data.saleType === "retail" && data.remainingAmount > 0)
    throw new Error("البيع النقدي يتطلب سداد إجمالي الفاتورة");
  const totalCost = round(lines.reduce((sum, line) => sum + line.totalCost, 0));
  return {
    ...data,
    items: lines,
    totalCost,
    netProfit: round(data.totalAmount - totalCost),
  };
}
export function checkStocktaking(
  variances: StocktakingItemVariance[],
  items: InventoryItem[],
) {
  if (
    !variances.length ||
    new Set(variances.map((v) => v.itemId)).size !== variances.length
  )
    throw new Error("لا توجد أصناف للجرد أو يوجد صنف مكرر");
  return variances.map((variance) => {
    const item = items.find((i) => i.id === variance.itemId);
    if (
      !item ||
      item.category === "drink_recipe" ||
      !validMoney(variance.actualStock)
    )
      throw new Error("صنف الجرد أو رصيده الفعلي غير صالح");
    if (Math.abs(item.stock - variance.systemStock) > 0.000001)
      throw new Error(
        "تغير رصيد المخزن أثناء الجرد؛ راجع الكميات قبل الاعتماد",
      );
    const difference = Number((variance.actualStock - item.stock).toFixed(3));
    return {
      ...variance,
      itemName: item.name,
      baseUnit: item.baseUnit,
      systemStock: item.stock,
      difference,
      unitCost: item.costPrice,
      financialDifference: round(difference * item.costPrice),
    };
  });
}
