import type {InventoryItem, PurchaseInvoice} from '../types/erp';
import {receiveStock} from './costing';
import {recalculateRecipeCosts} from './itemCosts';

export function compactPurchaseItem(item: InventoryItem, keepReceipt = false): InventoryItem {
  const {costHistory, supplierPrices, ...details} = item;
  return {
    ...details,
    ...(keepReceipt && costHistory ? {costHistory: costHistory.slice(-1)} : {}),
    supplierPrices: keepReceipt ? supplierPrices.slice(0, 1) : [],
  };
}

export function receivePurchaseInventory(items: readonly InventoryItem[], invoice: PurchaseInvoice) {
  const lines = new Map(invoice.items.map(line => [line.itemId, line]));
  const purchased = items.filter(item => lines.has(item.id));
  invoice.inventoryBefore = purchased.map(item => compactPurchaseItem(item));
  invoice.inventoryHistory = purchased.map(item => ({
    itemId: item.id,
    costEntries: item.costHistory?.length ?? null,
    supplierEntries: item.supplierPrices.length,
  }));
  const next = recalculateRecipeCosts(items.map(item => {
    const line = lines.get(item.id);
    if (!line) return item;
    const received = receiveStock(item, line.quantity, line.purchasePrice, {
      id: invoice.id, date: invoice.date, type: 'purchase',
    });
    return {
      ...received,
      lastPurchasePrice: line.purchasePrice,
      retailPrice: line.newRetailPrice ?? item.retailPrice,
      wholesalePrice: line.newWholesalePrice ?? item.wholesalePrice,
      supplierPrices: [{
        supplierId: invoice.supplierId,
        supplierName: invoice.supplierName,
        price: line.purchasePrice,
        date: invoice.date,
        invoiceId: invoice.invoiceNumber,
      }, ...item.supplierPrices],
    };
  }));
  invoice.inventoryAfter = next.filter(item => lines.has(item.id)).map(item => compactPurchaseItem(item, true));
  return next;
}

export function restorePurchasedItem(
  current: InventoryItem,
  before: InventoryItem,
  invoice: PurchaseInvoice,
): InventoryItem {
  if (!invoice.inventoryHistory) return before;
  const checkpoint = invoice.inventoryHistory.find(entry => entry.itemId === before.id);
  const history = current.costHistory;
  const purchaseEntry = history?.[history.length - 1];
  if (!checkpoint || history?.length !== (checkpoint.costEntries ?? 0) + 1 ||
      purchaseEntry?.sourceId !== invoice.id || purchaseEntry.sourceType !== 'purchase' ||
      current.supplierPrices.length !== checkpoint.supplierEntries + 1 ||
      current.supplierPrices[0]?.invoiceId !== invoice.invoiceNumber) {
    throw Error('حدثت حركة لاحقة على سجل تكلفة أو أسعار الصنف؛ تعذر إلغاء الفاتورة بأمان.');
  }
  return {
    ...before,
    ...(checkpoint.costEntries === null ? {} : {costHistory: history.slice(0, -1)}),
    supplierPrices: current.supplierPrices.slice(1),
  };
}
