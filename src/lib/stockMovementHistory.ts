import type {InventoryItem, UnitType} from '../types/erp';
import type {StoreState} from './storeState';
import {businessDate} from './dates';
import {unitLabel} from './units';

export type StockMovement = {
  id: string;
  date: string;
  source: string;
  quantity: number;
  unit: string;
};

export function stockMovementHistory(item: InventoryItem, documents: Pick<StoreState,
  'purchaseInvoices' | 'salesInvoices' | 'productionBatches' | 'cashierDays' | 'stocktakingRecords'
>): StockMovement[] {
  const rows: StockMovement[] = [];
  const unit = unitLabel(item.baseUnit);
  const add = (id: string, date: string, source: string, quantity: number, rowUnit = unit) => {
    if (Number.isFinite(quantity) && quantity !== 0) rows.push({id, date, source, quantity, unit: rowUnit});
  };

  for (const invoice of documents.purchaseInvoices) {
    invoice.items.forEach((line, index) => {
      if (line.itemId !== item.id) return;
      add(`purchase:${invoice.id}:${index}`, invoice.date, `شراء ${invoice.invoiceNumber}`, line.quantity, unitLabel(line.unit as UnitType) ?? line.unit);
      if (invoice.isCancelled && invoice.cancelledAt && Number.isFinite(Date.parse(invoice.cancelledAt))) {
        add(`cancel:${invoice.id}:${index}`, businessDate(new Date(invoice.cancelledAt)), `إلغاء شراء ${invoice.invoiceNumber}`, -line.quantity, unitLabel(line.unit as UnitType) ?? line.unit);
      }
    });
  }
  for (const invoice of documents.salesInvoices) {
    invoice.items.forEach((line, index) => {
      if (line.itemId !== item.id || line.category === 'drink_recipe' || line.category === 'seasoning_recipe') return;
      add(`sale:${invoice.id}:${index}`, invoice.date, `بيع ${invoice.invoiceNumber}`, -line.normalizedQtyInBaseUnit);
      if (invoice.isReturned && invoice.returnedAt && Number.isFinite(Date.parse(invoice.returnedAt))) {
        add(`return:${invoice.id}:${index}`, businessDate(new Date(invoice.returnedAt)), `مرتجع ${invoice.invoiceNumber}`, line.normalizedQtyInBaseUnit);
      }
    });
  }
  for (const batch of documents.productionBatches) {
    if (batch.blendId === item.id) add(`blend:${batch.id}`, batch.date, `إنتاج ${batch.batchNumber}`, batch.quantityProducedKg, unitLabel('kg'));
    batch.ingredientsConsumed.forEach((line, index) => {
      if (line.ingredientId === item.id) add(`ingredient:${batch.id}:${index}`, batch.date, `استهلاك في ${batch.batchNumber}`, -line.quantityUsed);
    });
  }
  for (const day of documents.cashierDays) {
    if (day.status !== 'approved') continue;
    for (const line of day.consumption ?? []) {
      if (line.itemId === item.id) add(`cashier:${day.id}`, day.date, 'استهلاك يوم الكاشير', -line.quantity);
    }
  }
  for (const audit of documents.stocktakingRecords) {
    for (const line of audit.itemsAudited) {
      if (line.itemId === item.id) add(`audit:${audit.id}`, audit.date, `تسوية جرد ${audit.auditNumber}`, line.difference, unitLabel(line.baseUnit));
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
