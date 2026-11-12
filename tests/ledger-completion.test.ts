import { it, expect } from 'vitest';
import { emptyStore, validateStore } from '../src/lib/storeState';
import {
  recordPayment,
  reversePayment,
  cancelPurchase,
  recordExpense,
  cancelExpense,
  operatingExpenses,
  returnSale,
} from '../src/lib/ledger';
import { INITIAL_ITEMS, INITIAL_PARTNERS } from '../src/data/initialData';
const owner = {
  ...INITIAL_PARTNERS[0],
  sharePercent: 100,
  totalPaidFromPocket: 0,
  totalWithdrawals: 0,
};
const invoice = (id: string, date: string, remaining: number) => ({
  id,
  invoiceNumber: id,
  date,
  saleType: 'wholesale' as const,
  customerId: 'c',
  customerName: 'Customer',
  items: [],
  subtotal: remaining,
  discount: 0,
  totalAmount: remaining,
  totalCost: 0,
  netProfit: remaining,
  paidAmount: 0,
  remainingAmount: remaining,
  paymentMethod: 'آجل' as const,
  partnerName: 'Owner',
});
it('allocates a payment to oldest invoices and reverses their balances exactly', () => {
  const state = {
    ...emptyStore,
    partners: [owner],
    customers: [
      {
        id: 'c',
        name: 'Customer',
        phone: '',
        type: 'عميل محل' as const,
        balance: 150,
        totalSales: 150,
        invoicesCount: 2,
      },
    ],
    salesInvoices: [
      invoice('new', '2026-11-02', 100),
      invoice('old', '2026-11-01', 50),
    ],
  };
  const paid = recordPayment(state, 'customer', 'c', 70, 'Owner');
  expect(paid.customers[0].balance).toBe(80);
  expect(paid.salesInvoices.find((i) => i.id === 'old')?.remainingAmount).toBe(
    0,
  );
  expect(paid.salesInvoices.find((i) => i.id === 'new')?.remainingAmount).toBe(
    80,
  );
  const validated = validateStore(paid);
  expect(validated.accountPayments[0].allocations).toHaveLength(2);
  const reversed = reversePayment(
    validated,
    paid.accountPayments[0].id,
    'Owner',
  );
  expect(reversed.customers[0].balance).toBe(150);
  expect(reversed.salesInvoices.map((i) => i.remainingAmount)).toEqual([
    100, 50,
  ]);
  expect(() =>
    reversePayment(reversed, paid.accountPayments[0].id, 'Owner'),
  ).toThrow();
});
it('a return after collection records the refund without reopening settled debt', () => {
  const state = {
    ...emptyStore,
    partners: [owner],
    customers: [
      {
        id: 'c',
        name: 'Customer',
        phone: '',
        type: 'عميل محل' as const,
        balance: 50,
        totalSales: 50,
        invoicesCount: 1,
      },
    ],
    salesInvoices: [invoice('i', '2026-11-01', 50)],
  };
  const paid = recordPayment(state, 'customer', 'c', 50, 'Owner');
  const returned = returnSale(paid, 'i', 'Owner');
  expect(returned.customers[0].balance).toBe(0);
  expect((returned.salesInvoices[0] as any).returnRefundAmount).toBe(50);
  expect(() =>
    reversePayment(returned, paid.accountPayments[0].id, 'Owner'),
  ).toThrow();
});
it('keeps partner withdrawals out of profit and reverses them without deleting evidence', () => {
  const state = { ...emptyStore, partners: [owner] };
  const next = recordExpense(
    state,
    {
      date: '2026-11-01',
      title: 'Withdrawal',
      category: 'مسحوبات شركاء',
      amount: 50,
      partnerName: owner.name,
      paidFrom: 'درج المحل',
    },
    owner.id,
  );
  expect(next.partners[0].totalWithdrawals).toBe(50);
  expect(operatingExpenses(next.expenses)).toBe(0);
  const cancelled = cancelExpense(next, next.expenses[0].id, 'Owner');
  expect(cancelled.partners[0].totalWithdrawals).toBe(0);
  expect(cancelled.expenses[0].isCancelled).toBe(true);
  expect(() =>
    cancelExpense(cancelled, next.expenses[0].id, 'Owner'),
  ).toThrow();
});
it('reverses an out-of-pocket expense contribution and excludes cancelled costs', () => {
  const next = recordExpense(
    { ...emptyStore, partners: [owner] },
    {
      date: '2026-11-01',
      title: 'Repair',
      category: 'صيانة مطاحن وماكينات',
      amount: 80,
      partnerName: owner.name,
      paidFrom: 'من جيب الشريك',
    },
    owner.id,
  );
  expect(next.partners[0].totalPaidFromPocket).toBe(80);
  expect(operatingExpenses(next.expenses)).toBe(80);
  const reversed = cancelExpense(next, next.expenses[0].id, 'Owner');
  expect(reversed.partners[0].totalPaidFromPocket).toBe(0);
  expect(operatingExpenses(reversed.expenses)).toBe(0);
  const floatFirst = recordExpense(
    { ...emptyStore, partners: [owner] },
    {
      date: '2026-11-01',
      title: 'Part 1',
      category: 'صيانة مطاحن وماكينات',
      amount: 100.1,
      partnerName: owner.name,
      paidFrom: 'من جيب الشريك',
    },
    owner.id,
  );
  const floatSecond = recordExpense(
    floatFirst,
    {
      date: '2026-11-01',
      title: 'Part 2',
      category: 'صيانة مطاحن وماكينات',
      amount: 200.2,
      partnerName: owner.name,
      paidFrom: 'من جيب الشريك',
    },
    owner.id,
  );
  expect(floatSecond.partners[0].totalPaidFromPocket).toBe(300.3);
  expect(operatingExpenses(floatSecond.expenses)).toBe(300.3);
});
it('refreshes dependent recipe costs after cancellation restores ingredient prices', () => {
  const rawBefore = {
    ...INITIAL_ITEMS[0],
    stock: 10,
    costPrice: 100,
    lastPurchasePrice: 100,
  };
  const rawAfter = {
    ...rawBefore,
    stock: 12,
    costPrice: 120,
    lastPurchasePrice: 120,
  };
  const drink = {
    ...INITIAL_ITEMS.find((item) => item.category === 'drink_recipe')!,
    id: 'drink-test',
    code: 'DR-TEST',
    stock: 5,
    costPrice: 120,
    recipe: [
      {
        ingredientId: rawBefore.id,
        ingredientName: rawBefore.name,
        quantity: 1,
        unit: 'kg' as const,
      },
    ],
  };
  const purchase = {
    id: 'p',
    invoiceNumber: 'P',
    date: '2026-11-01',
    supplierId: 's',
    supplierName: 'Supplier',
    items: [],
    totalAmount: 100,
    paidAmount: 20,
    remainingAmount: 80,
    paymentMethod: 'جزئي' as const,
    partnerName: 'Owner',
    inventoryBefore: [rawBefore],
    inventoryAfter: [rawAfter],
  };
  const state = {
    ...emptyStore,
    items: [rawAfter, drink],
    purchaseInvoices: [purchase],
    suppliers: [
      {
        id: 's',
        name: 'Supplier',
        phone: '',
        category: '',
        balance: 80,
        totalPurchases: 100,
        invoicesCount: 1,
      },
    ],
  };
  const next = cancelPurchase(validateStore(state), 'p', 'Owner');
  expect(next.items.find((item) => item.id === rawBefore.id)?.costPrice).toBe(
    100,
  );
  expect(next.items.find((item) => item.id === drink.id)?.costPrice).toBe(100);
});
it('cancels a purchase only when its inventory evidence still matches', () => {
  const before = { ...INITIAL_ITEMS[0], stock: 10 },
    after = { ...before, stock: 12, costPrice: 200 };
  const purchase = {
    id: 'p',
    invoiceNumber: 'P',
    date: '2026-11-01',
    supplierId: 's',
    supplierName: 'Supplier',
    items: [],
    totalAmount: 100,
    paidAmount: 20,
    remainingAmount: 80,
    paymentMethod: 'جزئي' as const,
    partnerName: 'Owner',
    inventoryBefore: [before],
    inventoryAfter: [after],
  };
  const state = {
    ...emptyStore,
    items: [after],
    purchaseInvoices: [purchase],
    suppliers: [
      {
        id: 's',
        name: 'Supplier',
        phone: '',
        category: '',
        balance: 80,
        totalPurchases: 100,
        invoicesCount: 1,
      },
    ],
  };
  const next = cancelPurchase(validateStore(state), 'p', 'Owner');
  expect(next.items[0]).toEqual(before);
  expect(next.suppliers[0].balance).toBe(0);
  expect(next.purchaseInvoices[0].refundDue).toBe(20);
  expect(next.purchaseInvoices[0].isCancelled).toBe(true);
  expect(() => cancelPurchase(next, 'p', 'Owner')).toThrow();
  expect(() =>
    cancelPurchase(
      { ...state, items: [{ ...after, stock: 11 }] },
      'p',
      'Owner',
    ),
  ).toThrow('حركة لاحقة');
});
