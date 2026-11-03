import type {
  InventoryItem,
  SalesInvoice,
  PurchaseInvoice,
  Supplier,
  Customer,
  Expense,
  CashierDay,
} from '../types/erp';
import { businessDate } from './dates';
export function downloadFullBackupJson(statePayload: Record<string, unknown>) {
  const dateStr = businessDate();
  const blob = new Blob(
    [
      JSON.stringify(
        statePayload,
        (key, value) => (key === 'password' ? undefined : value),
        2,
      ),
    ],
    {
      type: 'application/json;charset=utf-8',
    },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `نسخة_احتياطية_بن_العجوز_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportFullStoreExcel(
  items: InventoryItem[],
  salesInvoices: SalesInvoice[],
  purchaseInvoices: PurchaseInvoice[],
  suppliers: Supplier[],
  customers: Customer[],
  expenses: Expense[],
  cashierDays:CashierDay[]=[],
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // 1. شيت المخزن والأصناف
  const itemsSheet = XLSX.utils.json_to_sheet(
    items.map((i) => ({
      الكود: i.code,
      الصنف: i.name,
      الرصيد: i.stock,
      الوحدة:
        i.baseUnit === 'kg' ? 'كجم' : i.baseUnit === 'liter' ? 'لتر' : 'قطعة',
      التكلفة: i.costPrice,
      'سعر القطاعي': i.retailPrice,
      'سعر الجملة': i.wholesalePrice,
    })),
  );
  XLSX.utils.book_append_sheet(wb, itemsSheet, 'المخزن_والأصناف');

  // 2. شيت فواتير البيع
  const salesSheet = XLSX.utils.json_to_sheet(
    salesInvoices.map((s) => ({
      'رقم الفاتورة': s.invoiceNumber,
      التاريخ: s.date,
      النوع:
        s.saleType === 'wholesale'
          ? 'جملة'
          : s.saleType === 'retail'
            ? 'محل'
            : 'كاشير',
      العميل: s.customerName,
      الإجمالي: s.totalAmount,
      التكلفة: s.totalCost,
      'صافي الربح': s.netProfit,
      المدفوع: s.paidAmount,
      المتبقي: s.remainingAmount,
      المسؤول: s.partnerName,
    })),
  );
  XLSX.utils.book_append_sheet(wb, salesSheet, 'فواتير_البيع');
  const daySheet=XLSX.utils.json_to_sheet(cashierDays.map(d=>({التاريخ:d.date,الحالة:d.status==='approved'?'معتمد':'معلق','ملف الأرقام المالية':d.financialReport?.fileName??'','ملف الأصناف':d.itemsReport?.fileName??'',الإيراد:d.financialReport?.totalRevenue??'',التكلفة:d.totalCost??'لم تعتمد','عدد أصناف العجز':d.shortages?.length??'',المسؤول:d.partnerName??''})));
  XLSX.utils.book_append_sheet(wb,daySheet,'أيام_الكاشير');

  // 3. شيت فواتير الشراء
  const purchaseSheet = XLSX.utils.json_to_sheet(
    purchaseInvoices.map((p) => ({
      'رقم الفاتورة': p.invoiceNumber,
      التاريخ: p.date,
      المورد: p.supplierName,
      'قيمة الأصناف قبل الضريبة':p.netAmount??p.totalAmount,
      الضريبة:p.taxAmount??0,
      الإجمالي: p.totalAmount,
      المدفوع: p.paidAmount,
      المتبقي: p.remainingAmount,
      المسؤول: p.partnerName,
    })),
  );
  XLSX.utils.book_append_sheet(wb, purchaseSheet, 'فواتير_الشراء');

  // 4. شيت الموردين والعملاء
  const accountsSheet = XLSX.utils.json_to_sheet([
    ...suppliers.map((s) => ({
      النوع: 'مورد',
      الاسم: s.name,
      الموبايل: s.phone,
      العنوان:s.address??'',
      المندوب:s.representativeName??'',
      'إجمالي التعامل': s.totalPurchases,
      'الرصيد المتبقي': s.balance,
    })),
    ...customers.map((c) => ({
      النوع: 'عميل',
      الاسم: c.name,
      الموبايل: c.phone,
      المنطقة:c.area??'',
      'إجمالي التعامل': c.totalSales,
      'الرصيد المتبقي': c.balance,
    })),
  ]);
  XLSX.utils.book_append_sheet(wb, accountsSheet, 'الموردين_والعملاء');

  // 5. شيت المصروفات
  const expSheet = XLSX.utils.json_to_sheet(
    expenses.map((e) => ({
      التاريخ: e.date,
      البند: e.category,
      البيان: e.title,
      المبلغ: e.amount,
      'جهة الصرف': e.paidFrom,
      الشريك: e.partnerName,
    })),
  );
  XLSX.utils.book_append_sheet(wb, expSheet, 'المصروفات');

  const dateStr = businessDate();
  XLSX.writeFile(wb, `سجل_محل_بن_العجوز_الشامل_${dateStr}.xlsx`);
}
