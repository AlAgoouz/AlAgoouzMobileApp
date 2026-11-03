import type { StoreState } from './storeState';
import { businessDate } from './dates';

export function assertPayment(balance: number, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error('أدخل مبلغًا أكبر من صفر');
  if (amount > balance + 0.001)
    throw new Error(
      `المبلغ أكبر من المستحق؛ المستحق الحالي ${balance.toFixed(2)} ج.م`,
    );
}
export function reversePayment(
  state: StoreState,
  paymentId: string,
  actor: string,
): StoreState {
  const payment = state.accountPayments.find((p) => p.id === paymentId);
  if (!payment || payment.reversedAt)
    throw new Error('الدفعة غير موجودة أو ألغيت بالفعل');
  const field = payment.targetType === 'supplier' ? 'suppliers' : 'customers';
  if (!state[field].some((a) => a.id === payment.targetId))
    throw new Error('حساب الدفعة غير موجود');
  const invoiceField =
    payment.targetType === 'supplier' ? 'purchaseInvoices' : 'salesInvoices';
  for (const allocation of payment.allocations ?? []) {
    const invoice = state[invoiceField].find(
      (i) => i.id === allocation.invoiceId,
    );
    if (
      !invoice ||
      ('isReturned' in invoice && invoice.isReturned) ||
      ('isCancelled' in invoice && invoice.isCancelled) ||
      invoice.paidAmount + 0.001 < allocation.amount
    )
      throw new Error(
        'الدفعة مرتبطة بفاتورة مرتجعة أو ملغاة؛ راجع مستند الاسترداد قبل عكسها.',
      );
  }
  return {
    ...state,
    [invoiceField]: state[invoiceField].map((invoice) => {
      const amount = (payment.allocations ?? [])
        .filter((a) => a.invoiceId === invoice.id)
        .reduce((sum, a) => sum + a.amount, 0);
      return amount
        ? {
            ...invoice,
            paidAmount: Number((invoice.paidAmount - amount).toFixed(2)),
            remainingAmount: Number(
              (invoice.remainingAmount + amount).toFixed(2),
            ),
          }
        : invoice;
    }),
    [field]: state[field].map((a) =>
      a.id === payment.targetId
        ? { ...a, balance: Number((a.balance + payment.amount).toFixed(2)) }
        : a,
    ),
    accountPayments: state.accountPayments.map((p) =>
      p.id === paymentId
        ? { ...p, reversedAt: new Date().toISOString(), reversedBy: actor }
        : p,
    ),
  };
}
export function returnSale(
  state: StoreState,
  invoiceId: string,
  actor: string,
): StoreState {
  const invoice = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!invoice || invoice.isReturned)
    throw new Error('الفاتورة غير موجودة أو مرتجعة بالفعل');
  const stock = new Map<string, number>();
  for (const line of invoice.items) {
    if (line.category === 'drink_recipe') continue; // Prepared drinks remain consumed.
    if (!state.items.some((i) => i.id === line.itemId))
      throw new Error('يلزم استعادة الصنف المحذوف قبل تنفيذ المرتجع');
    stock.set(
      line.itemId,
      (stock.get(line.itemId) ?? 0) + line.normalizedQtyInBaseUnit,
    );
  }
  const customer = state.customers.find((c) => c.id === invoice.customerId);
  if (invoice.remainingAmount > 0 && !customer)
    throw new Error('حساب العميل غير موجود');
  const debtReversed = Math.min(
    invoice.remainingAmount,
    customer?.balance ?? 0,
  );
  const refundAmount = Number((invoice.totalAmount - debtReversed).toFixed(2));
  const consumedDrinkCost = Number(
    invoice.items
      .filter((line) => line.category === 'drink_recipe')
      .reduce((sum, line) => sum + line.totalCost, 0)
      .toFixed(2),
  );
  return {
    ...state,
    expenses:
      consumedDrinkCost > 0
        ? [
            {
              id: crypto.randomUUID(),
              date: businessDate(),
              category: 'نثريات أخرى',
              title: `تكلفة مشروبات مرتجعة — ${invoice.invoiceNumber}`,
              amount: consumedDrinkCost,
              partnerName: actor,
              paidFrom: 'تسوية مخزون (بدون نقدية)',
              notes:
                'استهلاك مكونات مشروبات لم تعد للمخزون؛ لا يمثل صرفًا نقديًا.',
              sourceInvoiceId: invoice.id,
            },
            ...state.expenses,
          ]
        : state.expenses,
    items: state.items.map((i) =>
      stock.has(i.id)
        ? { ...i, stock: Number((i.stock + stock.get(i.id)!).toFixed(6)) }
        : i,
    ),
    customers: state.customers.map((c) =>
      c.id === invoice.customerId
        ? {
            ...c,
            balance: Number((c.balance - debtReversed).toFixed(2)),
            totalSales: Math.max(0, c.totalSales - invoice.totalAmount),
            invoicesCount: Math.max(0, c.invoicesCount - 1),
          }
        : c,
    ),
    salesInvoices: state.salesInvoices.map((i) =>
      i.id === invoiceId
        ? {
            ...i,
            isReturned: true,
            returnedAt: new Date().toISOString(),
            returnedBy: actor,
            returnDebtReversed: debtReversed,
            returnRefundAmount: refundAmount,
          }
        : i,
    ),
  };
}

export function recordPayment(
  state: StoreState,
  type: 'supplier' | 'customer',
  id: string,
  amount: number,
  actor: string,
  notes = '',
): StoreState {
  const field = type === 'supplier' ? 'suppliers' : 'customers';
  const account = state[field].find((a) => a.id === id);
  if (!account) throw new Error('الحساب غير موجود');
  assertPayment(account.balance, amount);
  const invoices =
    type === 'supplier'
      ? state.purchaseInvoices.filter(
          (i) => i.supplierId === id && !i.isCancelled,
        )
      : state.salesInvoices.filter((i) => i.customerId === id && !i.isReturned);
  const allocations: { invoiceId: string; amount: number }[] = [];
  let remaining = amount;
  // Settle oldest outstanding invoices first; unmatched legacy debt is kept explicit.
  for (const invoice of [...invoices].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    const paid = Number(
      Math.min(remaining, invoice.remainingAmount).toFixed(2),
    );
    if (paid > 0) {
      allocations.push({ invoiceId: invoice.id, amount: paid });
      remaining = Number((remaining - paid).toFixed(2));
    }
    if (remaining <= 0) break;
  }
  const invoiceField =
    type === 'supplier' ? 'purchaseInvoices' : 'salesInvoices';
  return {
    ...state,
    [field]: state[field].map((a) =>
      a.id === id
        ? { ...a, balance: Number((a.balance - amount).toFixed(2)) }
        : a,
    ),
    [invoiceField]: state[invoiceField].map((invoice) => {
      const paid =
        allocations.find((a) => a.invoiceId === invoice.id)?.amount ?? 0;
      return paid
        ? {
            ...invoice,
            paidAmount: Number((invoice.paidAmount + paid).toFixed(2)),
            remainingAmount: Number(
              (invoice.remainingAmount - paid).toFixed(2),
            ),
          }
        : invoice;
    }),
    accountPayments: [
      {
        id: crypto.randomUUID(),
        date: businessDate(),
        targetType: type,
        targetId: id,
        targetName: account.name,
        amount,
        partnerName: actor,
        notes,
        allocations,
        openingBalanceAmount: remaining,
      },
      ...state.accountPayments,
    ],
  };
}

export function cancelPurchase(
  state: StoreState,
  id: string,
  actor: string,
): StoreState {
  const invoice = state.purchaseInvoices.find((i) => i.id === id);
  if (!invoice || invoice.isCancelled)
    throw new Error('الفاتورة غير موجودة أو ملغاة بالفعل');
  if (!invoice.inventoryBefore?.length || !invoice.inventoryAfter?.length)
    throw new Error(
      'الفاتورة قديمة ولا تحتوي دليل المخزون المطلوب للإلغاء الآمن.',
    );
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, entry]) => [key, canonical(entry)]),
          )
        : value;
  for (const after of invoice.inventoryAfter) {
    const current = state.items.find((i) => i.id === after.id);
    if (
      !current ||
      JSON.stringify(canonical(current)) !== JSON.stringify(canonical(after))
    )
      throw new Error(
        'حدثت حركة لاحقة على أصناف الفاتورة؛ لا يمكن إلغاؤها قبل تسوية تلك الحركة.',
      );
  }
  const supplier = state.suppliers.find((s) => s.id === invoice.supplierId);
  if (!supplier || supplier.balance + 0.001 < invoice.remainingAmount)
    throw new Error('رصيد المورد يحتاج مراجعة قبل الإلغاء');
  return {
    ...state,
    items: state.items.map(
      (item) =>
        invoice.inventoryBefore!.find((old) => old.id === item.id) ?? item,
    ),
    suppliers: state.suppliers.map((s) =>
      s.id === invoice.supplierId
        ? {
            ...s,
            balance: Number((s.balance - invoice.remainingAmount).toFixed(2)),
            totalPurchases: Math.max(0, s.totalPurchases - invoice.totalAmount),
            invoicesCount: Math.max(0, s.invoicesCount - 1),
          }
        : s,
    ),
    purchaseInvoices: state.purchaseInvoices.map((i) =>
      i.id === id
        ? {
            ...i,
            isCancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelledBy: actor,
            refundDue: i.paidAmount,
          }
        : i,
    ),
  };
}

export function recordExpense(
  state: StoreState,
  input: Omit<import('../types/erp').Expense, 'id'>,
  partnerId: string,
): StoreState {
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    throw new Error('مبلغ المصروف يجب أن يكون أكبر من صفر');
  const partner = state.partners.find((p) => p.id === partnerId);
  if (!partner) throw new Error('الشريك غير موجود');
  if (input.category === 'مسحوبات شركاء' && input.paidFrom === 'من جيب الشريك')
    throw new Error('المسحوبات تُصرف من أموال المحل؛ اختر الدرج أو الخزنة.');
  return {
    ...state,
    expenses: [
      { ...input, frequency:input.frequency??'daily', id: crypto.randomUUID(), partnerId },
      ...state.expenses,
    ],
    partners: state.partners.map((p) =>
      p.id === partnerId
        ? {
            ...p,
            totalWithdrawals:
              p.totalWithdrawals +
              (input.category === 'مسحوبات شركاء' ? input.amount : 0),
            totalPaidFromPocket:
              p.totalPaidFromPocket +
              (input.paidFrom === 'من جيب الشريك' ? input.amount : 0),
          }
        : p,
    ),
  };
}
export function cancelExpense(
  state: StoreState,
  id: string,
  actor: string,
): StoreState {
  const expense = state.expenses.find((e) => e.id === id);
  if (!expense || expense.isCancelled)
    throw new Error('المصروف غير موجود أو ملغى بالفعل');
  if (expense.sourceInvoiceId)
    throw new Error('هذه تسوية مرتبطة بمرتجع؛ لا تُلغى منفصلة عن أصلها.');
  if (expense.sourceEmployeeTransactionId)
    throw new Error('هذا المصروف مرتبط بحركة عامل؛ اعكس الحركة من سجل العمال.');
  const partner = state.partners.find((p) =>
    expense.partnerId
      ? p.id === expense.partnerId
      : p.name === expense.partnerName,
  );
  if (
    (expense.category === 'مسحوبات شركاء' ||
      expense.paidFrom === 'من جيب الشريك') &&
    !partner
  )
    throw new Error('لا يمكن تحديد حساب الشريك لعكس الحركة');
  if (
    partner &&
    ((expense.category === 'مسحوبات شركاء' &&
      partner.totalWithdrawals < expense.amount) ||
      (expense.paidFrom === 'من جيب الشريك' &&
        partner.totalPaidFromPocket < expense.amount))
  )
    throw new Error('رصيد الشريك يحتاج مراجعة قبل الإلغاء');
  return {
    ...state,
    expenses: state.expenses.map((e) =>
      e.id === id
        ? {
            ...e,
            isCancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelledBy: actor,
          }
        : e,
    ),
    partners: state.partners.map((p) =>
      p.id === partner?.id
        ? {
            ...p,
            totalWithdrawals:
              p.totalWithdrawals -
              (expense.category === 'مسحوبات شركاء' ? expense.amount : 0),
            totalPaidFromPocket:
              p.totalPaidFromPocket -
              (expense.paidFrom === 'من جيب الشريك' ? expense.amount : 0),
          }
        : p,
    ),
  };
}
export function operatingExpenses(expenses: StoreState['expenses']) {
  return expenses
    .filter((e) => !e.isCancelled && e.category !== 'مسحوبات شركاء')
    .reduce((sum, e) => sum + e.amount, 0);
}
