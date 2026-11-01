import { describe, it, expect } from 'vitest';
import * as initial from '../src/data/initialData';
import {
  mapRawCashierRows,
  parseLocalizedNumber,
  cashierSourceId,
} from '../src/lib/cashierRows';
import {
  emptyStore,
  validateStore,
  createBackup,
  parseBackup,
  fromCloud,
  toCloud,
} from '../src/lib/storeState';
import { deductInventory, productionNeeds } from '../src/lib/inventory';
import { assertPayment, reversePayment, returnSale } from '../src/lib/ledger';
import { businessDate, isInPeriod } from '../src/lib/dates';
import { escapePrintData } from '../src/lib/safeHtml';
import { scrubLegacyPasswords } from '../src/lib/legacyCache';
import type {
  InventoryItem,
  SalesInvoice,
  SalesInvoiceItem,
} from '../src/types/erp';

const bean: InventoryItem = {
  id: 'b1',
  code: 'B1',
  name: 'بن سادة فاتح',
  baseUnit: 'kg',
  stock: 10,
  minStock: 1,
  costPrice: 100,
  lastPurchasePrice: 100,
  retailPrice: 200,
  wholesalePrice: 180,
  category: 'raw_bean',
  canSellDirectly: true,
  hasRecipe: false,
  supplierPrices: [],
};
const line: SalesInvoiceItem = {
  itemId: 'b1',
  itemName: bean.name,
  category: 'raw_bean',
  quantity: 2,
  normalizedQtyInBaseUnit: 2,
  unitLabel: 'kg',
  unitPrice: 200,
  unitCost: 100,
  totalPrice: 400,
  totalCost: 200,
  profit: 200,
};
const invoice: SalesInvoice = {
  id: 's1',
  invoiceNumber: 'S1',
  date: '2026-11-01',
  saleType: 'wholesale',
  customerId: 'c1',
  customerName: 'عميل',
  items: [line],
  subtotal: 400,
  discount: 0,
  totalAmount: 400,
  totalCost: 200,
  netProfit: 200,
  paidAmount: 100,
  remainingAmount: 300,
  paymentMethod: 'آجل',
  partnerName: 'partner',
};
describe('cashier quantities and matching', () => {
  it.each([
    ['ربع كيلو', 8, 2],
    ['نصف كيلو', 3, 1.5],
    ['ثمن كيلو', 8, 1],
  ])('normalizes %s correctly', (unit, qty, kg) => {
    const [r] = mapRawCashierRows(
      [{ 'اسم الصنف': bean.name, الكود: 'B1', الكمية: qty, الوحدة: unit }],
      [bean],
    );
    expect(r.error).toBeUndefined();
    expect(r.quantity).toBe(kg);
    expect(r.unitHint).toBe('kg');
  });
  it('does not multiply explicit gram weight twice', () => {
    const [r] = mapRawCashierRows(
      [{ Name: 'ربع بن', Code: 'B1', Quantity: 250, Unit: 'g' }],
      [bean],
    );
    expect(r.quantity).toBe(250);
    expect(r.unitHint).toBe('gram');
  });
  it('matches item code without overwriting name', () => {
    const [r] = mapRawCashierRows(
      [{ Name: bean.name, 'Item Code': 'B1', Quantity: 1, Unit: 'kg' }],
      [bean],
    );
    expect(r.rawName).toBe(bean.name);
    expect(r.matchedItem?.id).toBe('b1');
  });
  it('preserves negative rows and blocks their sale import', () => {
    const [r] = mapRawCashierRows(
      [{ Name: bean.name, Code: 'B1', Quantity: -2, Unit: 'kg', Total: -400 }],
      [bean],
    );
    expect(r.quantity).toBe(-2);
    expect(r.totalPrice).toBe(-400);
    expect(r.error).toContain('مرتجع');
  });
  it('requires explicit unit for ambiguous weights', () => {
    const [r] = mapRawCashierRows([{ Name: bean.name, Quantity: 80 }], [bean]);
    expect(r.error).toContain('وحدة');
  });
  it('does not silently drop unmatched rows', () => {
    const rows = mapRawCashierRows(
      [{ Name: 'missing', Quantity: 2, Unit: 'kg' }],
      [bean],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeTruthy();
  });
  it('does not fall back to name when supplied code is wrong', () => {
    const [r] = mapRawCashierRows(
      [{ Name: bean.name, Code: 'WRONG', Quantity: 1, Unit: 'kg' }],
      [bean],
    );
    expect(r.matchedItem).toBeUndefined();
  });
  it('rejects ambiguous name matches', () => {
    const [r] = mapRawCashierRows(
      [{ Name: bean.name, Quantity: 1, Unit: 'kg' }],
      [bean, { ...bean, id: 'b2', code: 'B2' }],
    );
    expect(r.error).toContain('أكثر');
  });
  it.each([
    ['١٬٢٣٤٫٥٠', 1234.5],
    ['1,234.50', 1234.5],
    ['12,50', 12.5],
    ['(٢٠)', -20],
    ['-2', -2],
    ['not a number', undefined],
  ])('parses %s without losing the sign', (input, output) =>
    expect(parseLocalizedNumber(input)).toBe(output),
  );
  it('produces the same source identity regardless of filename or row order', async () => {
    const rows = mapRawCashierRows(
      [
        { Code: 'B1', Quantity: 1, Unit: 'kg', Total: 200 },
        { Code: 'B1', Quantity: 2, Unit: 'kg', Total: 400 },
      ],
      [bean],
    );
    expect(await cashierSourceId(rows, '2026-11-01')).toBe(
      await cashierSourceId([...rows].reverse(), '2026-11-01'),
    );
    expect(await cashierSourceId(rows, '2026-11-01')).not.toBe(
      await cashierSourceId(rows, '2026-11-02'),
    );
  });
  it('deduplicates equivalent quantities expressed in grams or kilos', async () => {
    const grams = mapRawCashierRows(
      [{ Code: 'B1', Quantity: 250, Unit: 'g', Total: 50 }],
      [bean],
    );
    const kilos = mapRawCashierRows(
      [{ Code: 'B1', Quantity: 0.25, Unit: 'kg', Total: 50 }],
      [bean],
    );
    expect(await cashierSourceId(grams, '2026-11-01')).toBe(
      await cashierSourceId(kilos, '2026-11-01'),
    );
  });
});
describe('inventory invariants', () => {
  it('rejects overselling instead of clipping shortage', () =>
    expect(() => deductInventory([line], [{ ...bean, stock: 1 }])).toThrow(
      'غير كاف',
    ));
  it('aggregates all lines before stock validation', () =>
    expect(() =>
      deductInventory([line, line], [{ ...bean, stock: 3 }]),
    ).toThrow('غير كاف'));
  it('deducts exact direct quantity', () =>
    expect(deductInventory([line], [bean])[0].stock).toBe(8));
  it('rejects missing production ingredients', () =>
    expect(() =>
      productionNeeds(
        {
          ...bean,
          recipe: [
            {
              ingredientId: 'missing',
              ingredientName: 'Missing',
              quantity: 1,
              unit: 'kg',
            },
          ],
        },
        1,
        [bean],
      ),
    ).toThrow('مفقود'));
  it.each([0, -1, NaN, Infinity])(
    'rejects invalid production amount %s',
    (qty) =>
      expect(() =>
        productionNeeds({ ...bean, recipe: [] }, qty, [bean]),
      ).toThrow(),
  );
  it('aggregates repeated recipe components', () => {
    const blend = {
      ...bean,
      id: 'blend',
      recipe: [
        {
          ingredientId: 'b1',
          ingredientName: bean.name,
          quantity: 600,
          unit: 'gram' as const,
        },
        {
          ingredientId: 'b1',
          ingredientName: bean.name,
          quantity: 600,
          unit: 'gram' as const,
        },
      ],
    };
    expect(() =>
      productionNeeds(blend, 1, [{ ...bean, stock: 1 }, blend]),
    ).toThrow('غير كاف');
  });
  it('deducts shared drink ingredients together', () => {
    const drink = {
      ...bean,
      id: 'drink',
      baseUnit: 'piece' as const,
      category: 'drink_recipe' as const,
      hasRecipe: true,
      recipe: [
        {
          ingredientId: 'b1',
          ingredientName: bean.name,
          quantity: 100,
          unit: 'gram' as const,
        },
      ],
    };
    expect(
      deductInventory(
        [{ ...line, itemId: 'drink', normalizedQtyInBaseUnit: 5 }],
        [bean, drink],
      )[0].stock,
    ).toBe(9.5);
  });
});
describe('payments and returns', () => {
  it.each([0, -1, 101, NaN, Infinity])(
    'rejects invalid or excess payment %s',
    (amount) => expect(() => assertPayment(100, amount)).toThrow(),
  );
  it('accepts payment at the outstanding amount', () =>
    expect(() => assertPayment(100, 100)).not.toThrow());
  it('reverses payment once while preserving evidence', () => {
    const state = {
      ...emptyStore,
      suppliers: [
        {
          id: 'sup',
          name: 'sup',
          phone: '',
          category: '',
          balance: 60,
          totalPurchases: 100,
          invoicesCount: 1,
        },
      ],
      accountPayments: [
        {
          id: 'p1',
          date: '2026-11-01',
          targetType: 'supplier' as const,
          targetId: 'sup',
          targetName: 'sup',
          amount: 40,
          partnerName: 'partner',
        },
      ],
    };
    const next = reversePayment(state, 'p1', 'partner');
    expect(next.suppliers[0].balance).toBe(100);
    expect(next.accountPayments[0].reversedAt).toBeTruthy();
    expect(() => reversePayment(next, 'p1', 'partner')).toThrow();
    expect(state.suppliers[0].balance).toBe(60);
  });
  it('returns direct stock and debt once without deleting invoice', () => {
    const state = {
      ...emptyStore,
      items: [bean],
      salesInvoices: [invoice],
      customers: [
        {
          id: 'c1',
          name: 'عميل',
          phone: '',
          type: 'عميل محل' as const,
          balance: 300,
          totalSales: 400,
          invoicesCount: 1,
        },
      ],
    };
    const next = returnSale(state, 's1', 'partner');
    expect(next.items[0].stock).toBe(12);
    expect(next.customers[0].balance).toBe(0);
    expect(next.salesInvoices[0].isReturned).toBe(true);
    expect(() => returnSale(next, 's1', 'partner')).toThrow();
  });
  it('leaves drink ingredients consumed after financial return', () => {
    const state = {
      ...emptyStore,
      items: [bean],
      salesInvoices: [
        {
          ...invoice,
          customerId: undefined,
          remainingAmount: 0,
          paidAmount: 400,
          items: [
            { ...line, itemId: 'drink', category: 'drink_recipe' as const },
          ],
        },
      ],
    };
    const next = returnSale(state, 's1', 'partner');
    expect(next.items[0].stock).toBe(10);
    expect(next.expenses[0].amount).toBe(200);
    expect(next.expenses[0].paidFrom).toBe('تسوية مخزون (بدون نقدية)');
    expect(() => returnSale(next, 's1', 'partner')).toThrow();
  });
});
describe('backup validation, reports and print safety', () => {
  it('removes only legacy credentials while preserving cached business data', () => {
    let raw = JSON.stringify({
      items: [bean],
      partners: [{ id: 'p1', password: 'legacy', name: 'Owner' }],
    });
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    expect(scrubLegacyPasswords(storage)).toBe(true);
    expect(JSON.parse(raw).items).toEqual([bean]);
    expect(JSON.parse(raw).partners).toEqual([{ id: 'p1', name: 'Owner' }]);
    expect(scrubLegacyPasswords(storage)).toBe(false);
  });
  it('validates complete demo fixtures and strips legacy passwords', () => {
    const state = validateStore({
      items: initial.INITIAL_ITEMS,
      productionBatches: initial.INITIAL_PRODUCTION_BATCHES,
      purchaseInvoices: initial.INITIAL_PURCHASE_INVOICES,
      salesInvoices: initial.INITIAL_SALES_INVOICES,
      suppliers: initial.INITIAL_SUPPLIERS,
      customers: initial.INITIAL_CUSTOMERS,
      expenses: initial.INITIAL_EXPENSES,
      partners: initial.INITIAL_PARTNERS.map((p) => ({
        ...p,
        password: 'legacy',
      })),
      auditLogs: initial.INITIAL_AUDIT_LOGS,
      shifts: initial.INITIAL_SHIFTS,
      employees: initial.INITIAL_EMPLOYEES,
      employeeTransactions: initial.INITIAL_EMPLOYEE_TRANSACTIONS,
      stocktakingRecords: initial.INITIAL_STOCKTAKING_RECORDS,
      accountPayments: initial.INITIAL_ACCOUNT_PAYMENTS,
    });
    expect(JSON.stringify(state.partners)).not.toContain('password');
    expect(parseBackup(createBackup(state))).toEqual(state);
  });
  it('round-trips the empty catalog as empty', () =>
    expect(fromCloud(toCloud(emptyStore)).items).toEqual([]));
  it('rejects malformed backups without applying partial data', () => {
    expect(() => parseBackup({ items: [{}] })).toThrow();
    expect(() =>
      parseBackup({ ...createBackup(emptyStore), schemaVersion: 99 }),
    ).toThrow();
    expect(() =>
      validateStore({ ...emptyStore, items: [{ ...bean, stock: NaN }] }),
    ).toThrow();
  });
  it('escapes nested print fields without altering monetary types', () => {
    const result = escapePrintData({
      name: '<img src=x onerror="alert(1)">',
      rows: [{ notes: '<script>x</script>', amount: 100 }],
    });
    expect(result.name).not.toContain('<img');
    expect(result.rows[0].notes).not.toContain('<script>');
    expect(result.rows[0].amount.toFixed(2)).toBe('100.00');
  });
  it('uses Cairo business date across UTC midnight boundary', () =>
    expect(businessDate(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01'));
  it('applies inclusive calendar periods and excludes future dates', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(isInPeriod('2026-10-26', '7days', now)).toBe(true);
    expect(isInPeriod('2026-10-25', '7days', now)).toBe(false);
    expect(isInPeriod('2026-10-31', 'today', now)).toBe(false);
    expect(isInPeriod('2026-11-02', 'today', now)).toBe(false);
  });
});
