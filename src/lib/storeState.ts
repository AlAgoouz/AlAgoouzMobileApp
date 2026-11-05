import { z } from "zod";
import { convertToBaseUnit } from "./itemCosts";
import type {
  InventoryItem,
  ProductionBatch,
  PurchaseInvoice,
  SalesInvoice,
  Supplier,
  Customer,
  Expense,
  Partner,
  AuditLogEntry,
  ShiftRecord,
  Employee,
  EmployeeTransaction,
  StocktakingAuditRecord,
  AccountPaymentRecord,
  CashierDay,
  FinancialOpening,
  CatalogNameDraft,
} from "../types/erp";

export interface StoreState {
  items: InventoryItem[];
  productionBatches: ProductionBatch[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  suppliers: Supplier[];
  customers: Customer[];
  expenses: Expense[];
  partners: Partner[];
  auditLogs: AuditLogEntry[];
  shifts: ShiftRecord[];
  employees: Employee[];
  employeeTransactions: EmployeeTransaction[];
  stocktakingRecords: StocktakingAuditRecord[];
  accountPayments: AccountPaymentRecord[];
  cashierDays: CashierDay[];
  financialOpenings: FinancialOpening[];
  catalogNameDrafts: CatalogNameDraft[];
}
export const emptyStore: StoreState = {
  items: [],
  productionBatches: [],
  purchaseInvoices: [],
  salesInvoices: [],
  suppliers: [],
  customers: [],
  expenses: [],
  partners: [],
  auditLogs: [],
  shifts: [],
  employees: [],
  employeeTransactions: [],
  stocktakingRecords: [],
  accountPayments: [],
  cashierDays: [],
  financialOpenings: [],
  catalogNameDrafts: [],
};
export const cloudFields: Record<keyof StoreState, string> = {
  items: "items",
  productionBatches: "production_batches",
  purchaseInvoices: "purchase_invoices",
  salesInvoices: "sales_invoices",
  suppliers: "suppliers",
  customers: "customers",
  expenses: "expenses",
  partners: "partners",
  auditLogs: "audit_logs",
  shifts: "shifts",
  employees: "employees",
  employeeTransactions: "employee_transactions",
  stocktakingRecords: "stocktaking_records",
  accountPayments: "account_payments",
  cashierDays: "cashier_days",
  financialOpenings: "financial_openings",
  catalogNameDrafts: "catalog_name_drafts",
};
const text = z.string(),
  id = text.min(1),
  number = z.number().finite(),
  money = number.nonnegative();
const base = z.object({ id });
const ingredient = z.object({
  ingredientId: id,
  ingredientName: text,
  quantity: number.positive(),
  unit: z.enum(["kg", "gram", "piece", "count", "liter", "ml"]),
});
const item = base
  .extend({
    code: id,
    name: id,
    category: z.enum([
      "raw_bean",
      "raw_spice",
      "manufactured_blend",
      "drink_recipe",
      "direct_product",
      "direct_drink",
      "seasoning_recipe",
      "snack",
    ]),
    baseUnit: z.enum(["kg", "piece", "count", "liter"]),
    openingStock: money.optional(),
    stock: number,
    minStock: money,
    costPrice: money,
    lastPurchasePrice: money,
    retailPrice: money,
    wholesalePrice: money,
    canSellDirectly: z.boolean(),
    hasRecipe: z.boolean(),
    recipe: z.array(ingredient).optional(),
    supplierPrices: z.array(
      z
        .object({
          supplierId: id,
          supplierName: text,
          price: money,
          date: text,
        })
        .passthrough(),
    ),
    costingVersion: z.literal(2).optional(),
    costHistory: z.array(z.object({id, date: id, postedAt: id, sourceType: z.enum(['opening','purchase','production']), sourceId: id, quantity: number.positive(), unitCost: money, averageCost: money})).optional(),
  })
  .passthrough();
const line = z
  .object({
    itemId: id,
    itemName: text,
    category: z.enum(['raw_bean','raw_spice','manufactured_blend','drink_recipe','direct_product','direct_drink','seasoning_recipe','snack']),
    quantity: money,
    normalizedQtyInBaseUnit: money,
    totalPrice: money,
    totalCost: money,
    unitCost: money,
    unitPrice: money,
    profit: number,
  })
  .passthrough();
const invoice = base
  .extend({
    invoiceNumber: id,
    date: id,
    totalAmount: money,
    paidAmount: money,
    remainingAmount: money,
    partnerName: text,
    isCancelled: z.boolean().optional(),
    cancelledAt: text.optional(),
    cancelledBy: text.optional(),
    refundDue: money.optional(),
  })
  .passthrough();
export const schema = z.object({
  catalogNameDrafts:z.array(base.extend({name:text.trim().min(1).max(200),sourceRepository:text.min(1).max(200),sourceCommit:text.regex(/^[a-f0-9]{40}$/),sourcePath:text.min(1).max(500),importedAt:text.datetime()})).max(2000).default([]),
  financialOpenings:z.array(base.extend({date:id,account:z.literal('treasury'),amount:money.max(999999999999.99),priorPeriodSettled:z.literal(true),history:z.array(z.object({id,recordedAt:id,actorId:id,actorName:id,amount:money.max(999999999999.99),reason:text.min(6).max(500)})).min(1).max(1000)})).max(1).default([]),
  cashierDays:z.array(base.extend({date:id,status:z.enum(['pending','approved']),
    financialReport:z.object({fileName:id,sha256:text.regex(/^[a-f0-9]{64}$/),uploadedAt:id,sourceQueueId:id.optional(),totalRevenue:money}).optional(),
    itemsReport:z.object({fileName:id,sha256:text.regex(/^[a-f0-9]{64}$/),uploadedAt:id,sourceQueueId:id.optional(),lines:z.array(z.object({itemId:id,quantity:number.positive(),unitLabel:id,normalizedQtyInBaseUnit:number.positive()})).min(1)}).optional(),
    consumption:z.array(z.object({itemId:id,quantity:number.positive(),unitCost:money,totalCost:money})).optional(),
    shortages:z.array(z.object({itemId:id,shortage:number.positive()})).optional(),totalCost:money.optional(),approvedAt:id.optional(),partnerName:id.optional(),
  })).default([]),
  items: z.array(item),
  productionBatches: z.array(
    base
      .extend({
        batchNumber: id,
        date: id,
        blendId: id,
        blendName: text,
        quantityProducedKg: money,
        unitCostPerKg: money,
        totalBatchCost: money,
        partnerName: text,
        ingredientsConsumed: z.array(
          z.object({
            ingredientId: id,
            ingredientName: text,
            quantityUsed: money,
            displayQuantity: text,
            cost: money,
          }),
        ),
      })
      .passthrough(),
  ),
  purchaseInvoices: z.array(
    invoice.extend({
      supplierId: id,
      netAmount: money.optional(),
      taxAmount: money.optional(),
      accountingVersion: z.literal(2).optional(),
      paymentMethod: z.enum(['نقدي','آجل','جزئي']),
      supplierName: text,
      inventoryBefore: z.array(item).optional(),
      inventoryAfter: z.array(item).optional(),
      items: z.array(
        z
          .object({
            itemId: id,
            itemName: text,
            quantity: money,
            purchasePrice: money,
            updateProductCost: z.boolean(),
          })
          .passthrough(),
      ),
    }),
  ),
  salesInvoices: z.array(
    invoice.extend({
      saleType: z.enum(["retail", "wholesale", "cashier_sync"]),
      paymentMethod: z.enum(['نقدي','آجل','محفظة/انستا باي']),
      customerName: text,
      isReturned: z.boolean().optional(),
      returnedAt: text.optional(),
      returnedBy: text.optional(),
      returnDebtReversed: money.optional(),
      returnRefundAmount: money.optional(),
      items: z.array(line),
      subtotal: money,
      discount: money,
      totalCost: money,
      netProfit: number,
    }),
  ),
  suppliers: z.array(
    base
      .extend({
        name: id,
        phone: text,
        address: text.optional(),
        representativeName: text.optional(),
        category: text,
        balance: money,
        totalPurchases: money,
        invoicesCount: money,
      })
      .passthrough(),
  ),
  customers: z.array(
    base
      .extend({
        name: id,
        phone: text,
        area: text.optional(),
        type: text,
        balance: money,
        totalSales: money,
        invoicesCount: money,
      })
      .passthrough(),
  ),
  expenses: z.array(
    base
      .extend({
        date: id,
        category: z.enum(['إيجار','كهرباء ومياه وغاز','رواتب ويوميات','صيانة مطاحن وماكينات','أكياس وتغليف','نقل ومشال','مسحوبات شركاء','نثريات أخرى']),
        title: id,
        frequency: z.enum(['monthly_fixed','daily']).optional(),
        amount: money,
        partnerName: text,
        paidFrom: z.enum(['درج المحل','خزنة الشركة','من جيب الشريك','تسوية مخزون (بدون نقدية)']),
        partnerId: id.optional(),
        isCancelled: z.boolean().optional(),
        cancelledAt: text.optional(),
        cancelledBy: text.optional(),
        sourceInvoiceId: id.optional(),
        sourceEmployeeTransactionId: id.optional(),
      })
      .passthrough(),
  ),
  // Deliberately strip unknown fields, including legacy plaintext passwords.
  partners: z.array(
    base.extend({
      username: id,
      name: id,
      role: text,
      avatarLetter: text,
      phone: text,
      sharePercent: money.max(100),
      totalPaidFromPocket: money,
      totalWithdrawals: money,
      lastLogin: text.optional(),
    }),
  ),
  auditLogs: z.array(
    base.extend({
      timestamp: id,
      partnerName: text,
      actionType: id,
      description: text,
      amount: number.optional(),
      actorId: text.optional(),
    }),
  ),
  shifts: z.array(
    base.extend({
      date: id,
      shiftName: text,
      cashierName: text,
      supervisorPartner: text,
      openingCash: money,
      cashSales: money,
      expensesPaid: money,
      expectedCash: number,
      actualCash: money,
      difference: number,
      status: text,
    }),
  ),
  employees: z.array(
    base.extend({
      name: id,
      role: text,
      phone: text,
      salaryType: z.enum(['شهري','يومية']),
      baseMonthlySalary: money,
      dailyRate: money,
      workedDaysThisMonth: money,
      totalAdvances: money,
      totalDeductions: money,
      totalBonuses: money,
      totalPaidOut: money,
      payrollPeriod: text.regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      openingPayable: number.optional(),
    }),
  ),
  employeeTransactions: z.array(
    base.extend({
      date: id,
      employeeId: id,
      employeeName: text,
      type: z.enum(['سلفة','حضور يومية','خصم/عجز','مكافأة','صرف راتب','إقفال شهر']),
      amount: money,
      notes: text,
      partnerName: text,
      payrollPeriod: text.regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      accountingVersion: z.literal(1).optional(),
      partnerId: id.optional(),
      paidFrom: z.enum(['درج المحل','خزنة الشركة','من جيب الشريك']).optional(),
      expenseId: id.optional(),
      reversedAt: text.optional(),
      reversedBy: text.optional(),
      closingSummary: z.object({openingPayable:number,earned:money,advances:money,deductions:money,bonuses:money,paidOut:money,carryForward:number}).optional(),
    }),
  ),
  stocktakingRecords: z.array(
    base
      .extend({
        auditNumber: id,
        date: id,
        partnerName: text,
        totalShortageValue: money,
        totalSurplusValue: money,
        netVarianceValue: number,
        itemsAudited: z.array(
          z.object({
            itemId: id,
            itemName: text,
            baseUnit: text,
            systemStock: number,
            actualStock: money,
            difference: number,
            unitCost: money,
            financialDifference: number,
          }),
        ),
      })
      .passthrough(),
  ),
  accountPayments: z.array(
    base.extend({
      date: id,
      targetType: z.enum(["supplier", "customer"]),
      targetId: id,
      targetName: text,
      amount: money,
      partnerName: text,
      notes: text.optional(),
      reversedAt: text.optional(),
      reversedBy: text.optional(),
      allocations: z
        .array(z.object({ invoiceId: id, amount: money }))
        .optional(),
      openingBalanceAmount: money.optional(),
    }),
  ),
});

export function validateStore(value: unknown): StoreState {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const labels: Record<string, string> = {
      items: "الأصناف",
      partners: "الشركاء",
      salesInvoices: "فواتير البيع",
      purchaseInvoices: "فواتير الشراء",
      suppliers: "الموردين",
      customers: "العملاء",
      expenses: "المصروفات",
      employees: "العمال",
      auditLogs: "سجل الحركات",
    };
    throw new Error(
      `بيانات غير صالحة في ${labels[String(first.path[0])] ?? "النسخة"}؛ راجع القيم والحقول المطلوبة قبل الاعتماد.`,
    );
  }
  const parsed = result.data;
  if(new Set(parsed.catalogNameDrafts.map(d=>d.name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase())).size!==parsed.catalogNameDrafts.length)throw Error('أسماء مستوردة مكررة؛ راجع قائمة الاستكمال');
  for(const opening of parsed.financialOpenings){
    if(new Set(opening.history.map(h=>h.id)).size!==opening.history.length)throw Error('سجل رصيد البداية يحتوي على تعديلات مكررة');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(opening.date)||!Number.isFinite(Date.parse(opening.date+'T12:00:00Z'))||new Date(opening.date+'T12:00:00Z').toISOString().slice(0,10)!==opening.date||opening.history[opening.history.length-1]?.amount!==opening.amount||!Number.isSafeInteger(Math.round(opening.amount*100))||Math.abs(opening.amount*100-Math.round(opening.amount*100))>0.0001)throw Error('رصيد أول المدة أو سجل تعديلاته غير صالح');
  }
  if(new Set(parsed.cashierDays.map(d=>d.date)).size!==parsed.cashierDays.length)throw Error('يوجد يوم كاشير مكرر');
  for(const day of parsed.cashierDays){
    if(!day.financialReport&&!day.itemsReport)throw Error('يوم الكاشير بلا تقارير');
    if(day.status==='approved'&&(!day.financialReport||!day.itemsReport||!day.consumption?.length||day.totalCost===undefined||!day.approvedAt||!day.partnerName))throw Error('لا يعتمد يوم الكاشير قبل اكتمال التقريرين وتكلفة المخزون');
    for(const line of day.itemsReport?.lines??[]){const raw=parsed.items.find(i=>i.id===line.itemId);if(!raw||Math.abs(convertToBaseUnit(line.quantity,line.unitLabel as import('../types/erp').UnitType,raw.baseUnit)-line.normalizedQtyInBaseUnit)>0.000001)throw Error('كمية تقرير الكاشير أو وحدته غير صحيحة');}
    if(day.status==='approved'){
      const costs=day.consumption!;
      if(new Set(costs.map(l=>l.itemId)).size!==costs.length||costs.some(l=>!parsed.items.some(i=>i.id===l.itemId)||Math.abs(Number((l.quantity*l.unitCost).toFixed(2))-l.totalCost)>0.011)||Math.abs(costs.reduce((sum,l)=>sum+l.totalCost,0)-day.totalCost!)>0.011)throw Error('تكلفة يوم الكاشير لا تطابق المكونات المستهلكة');
    }else if(day.totalCost!==undefined||day.consumption||day.approvedAt||day.shortages)throw Error('يوم الكاشير لم يعتمد؛ لا يمكن تسجيل تكلفته بعد');
  }
  for (const [key, rows] of Object.entries(parsed)) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error(`معرفات مكررة في ${key}`);
  }
  const ids = new Set(parsed.items.map((i) => i.id));
  for (const transaction of parsed.employeeTransactions) {
    if (transaction.accountingVersion !== 1) continue;
    if (!parsed.employees.some((e)=>e.id===transaction.employeeId) || !parsed.partners.some((p)=>p.id===transaction.partnerId))
      throw new Error('حركة العامل مرتبطة بعامل أو شريك غير موجود');
    if (transaction.type==='صرف راتب' || transaction.type==='سلفة') {
      const expense=parsed.expenses.find((e)=>e.id===transaction.expenseId);
      if(!expense || expense.sourceEmployeeTransactionId!==transaction.id || expense.category!=='رواتب ويوميات' || expense.amount!==transaction.amount || expense.paidFrom!==transaction.paidFrom || expense.partnerId!==transaction.partnerId || Boolean(expense.isCancelled)!==Boolean(transaction.reversedAt))
        throw new Error('مصروف الراتب أو السلفة لا يطابق حركة العامل');
    } else if (transaction.expenseId) throw new Error('هذه الحركة ليست صرفًا نقديًا للعامل');
  }
  for(const expense of parsed.expenses) {
    if(expense.sourceEmployeeTransactionId && !parsed.employeeTransactions.some((t)=>t.id===expense.sourceEmployeeTransactionId && t.expenseId===expense.id))
      throw new Error('مصروف العامل غير مرتبط بحركة صحيحة');
  }
  if (
    new Set(parsed.items.map((i) => i.code.trim().toUpperCase())).size !==
    parsed.items.length
  )
    throw new Error("أكواد أصناف مكررة؛ يجب أن يكون لكل صنف كود مستقل");
  for (const item of parsed.items) {
    if (item.hasRecipe && !item.recipe?.length)
      throw new Error(`الوصفة ناقصة: ${item.name}`);
    for (const ing of item.recipe ?? []) {
      if (!ids.has(ing.ingredientId) || ing.ingredientId === item.id)
        throw new Error(`مكون مفقود أو دائري في وصفة ${item.name}`);
      if (
        parsed.items.find((i) => i.id === ing.ingredientId)?.category ===
        "drink_recipe"
      )
        throw new Error("المشروب المحضر لا يُستخدم كمكون مخزني في وصفة أخرى");
      convertToBaseUnit(
        ing.quantity,
        ing.unit,
        parsed.items.find((i) => i.id === ing.ingredientId)!.baseUnit,
      );
    }
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  const walk = (id: string) => {
    if (visiting.has(id))
      throw new Error("تحتوي الوصفات اعتمادًا دائريًا؛ راجع المكونات.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const ing of parsed.items.find((i) => i.id === id)?.recipe ?? [])
      walk(ing.ingredientId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const item of parsed.items) walk(item.id);
  for (const inv of [...parsed.salesInvoices, ...parsed.purchaseInvoices])
    if (
      Math.abs(inv.totalAmount - inv.paidAmount - inv.remainingAmount) > 0.011
    )
      throw new Error(
        `إجمالي الفاتورة لا يطابق المدفوع والمتبقي: ${inv.invoiceNumber}`,
      );
  return parsed as unknown as StoreState;
}
// The engine validates this untrusted input before publishing any state.
export function cloudStoreInput(row: Record<string, unknown>): unknown {
  return Object.fromEntries(
      Object.entries(cloudFields).map(([local, cloud]) => [
        local,
        row[cloud] ?? [],
      ]),
    );
}
export function fromCloud(row: Record<string, unknown>): StoreState {
  return validateStore(cloudStoreInput(row));
}
export function invoiceDetail(value:unknown):SalesInvoice {
 const invoice=schema.shape.salesInvoices.element.parse(value);
 if(Math.abs(invoice.totalAmount-invoice.paidAmount-invoice.remainingAmount)>0.011)throw Error('إجمالي الفاتورة لا يطابق المدفوع والمتبقي');
 return invoice as unknown as SalesInvoice;
}
export function cashierDayDetail(value:unknown):CashierDay {
 return schema.shape.cashierDays.unwrap().element.parse(value) as CashierDay;
}
export function toCloud(state: StoreState) {
  return Object.fromEntries(
    Object.entries(cloudFields).map(([local, cloud]) => [
      cloud,
      state[local as keyof StoreState],
    ]),
  );
}
export function createBackup(state: StoreState) {
  return {
    format: "bon-elagouz-store",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    state: validateStore(state),
  };
}
export function parseBackup(value: unknown): StoreState {
  if (!value || typeof value !== "object") throw new Error("النسخة غير صالحة");
  const envelope = value as Record<string, unknown>;
  if ("schemaVersion" in envelope) {
    if (envelope.schemaVersion !== 1 || envelope.format !== "bon-elagouz-store")
      throw new Error("إصدار النسخة غير مدعوم");
    return validateStore(envelope.state);
  }
  // Explicit compatibility with the original complete backup format.
  return validateStore({ ...envelope, shifts: envelope.shifts ?? [] });
}
