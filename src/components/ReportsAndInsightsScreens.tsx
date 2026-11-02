import { operatingExpenses } from '../lib/ledger';
import { isInPeriod } from '../lib/dates';
import React, { useState, useMemo } from 'react';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {
  ChevronRight,
  Share2,
  RefreshCw,
  Users,
  TrendingUp,
  PiggyBank,
  FileText,
  Package,
  Download,
  BarChart3,
  LayoutGrid,
  Check,
  Sparkles,
  Award,
} from 'lucide-react';
import {
  InventoryItem,
  SalesInvoice,
  Expense,
  Customer,
  Partner,
} from '../types/erp';

interface SmartInsightsProps {
  items: InventoryItem[];
  salesInvoices: SalesInvoice[];
  customers: Customer[];
  onNavigate: (screen: string) => void;
  onBack: () => void;
}

export const SmartInsightsScreen: React.FC<SmartInsightsProps> = ({
  items,
  salesInvoices,
  customers,
  onNavigate,
  onBack,
}) => {
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'all'>(
    '30days',
  );

  // حسابات حقيقية 100% من بيانات المتجر
  const activeInvoices = useMemo(
    () =>
      salesInvoices.filter((i) => !i.isReturned && isInPeriod(i.date, period)),
    [salesInvoices, period],
  );

  const totalSales = useMemo(
    () => activeInvoices.reduce((s, inv) => s + inv.totalAmount, 0),
    [activeInvoices],
  );

  const grossProfit = useMemo(
    () => activeInvoices.reduce((s, inv) => s + inv.netProfit, 0),
    [activeInvoices],
  );

  const profitMarginPercent = useMemo(
    () => (totalSales > 0 ? (grossProfit / totalSales) * 100 : 0),
    [grossProfit, totalSales],
  );

  const totalInventoryValue = useMemo(
    () =>
      items
        .filter((i) => i.category !== 'drink_recipe')
        .reduce((sum, i) => sum + i.stock * i.costPrice, 0),
    [items],
  );

  const totalExpectedRetailValue = useMemo(
    () =>
      items
        .filter((i) => i.category !== 'drink_recipe')
        .reduce((sum, i) => sum + i.stock * i.retailPrice, 0),
    [items],
  );

  const expectedStockProfit = Math.max(
    0,
    totalExpectedRetailValue - totalInventoryValue,
  );

  const totalCustomerDebts = useMemo(
    () => customers.reduce((sum, c) => sum + c.balance, 0),
    [customers],
  );

  const lowStockItems = useMemo(
    () =>
      items.filter(
        (i) => i.category !== 'drink_recipe' && i.stock <= i.minStock,
      ),
    [items],
  );

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-20">
      {/* هيدر إسبريسو وذهبي راقي */}
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <h1 className="text-base font-extrabold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          تحليلات وذكاء بُن العجوز
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('more')}
            className="p-1.5 rounded-xl hover:bg-white/10 text-[#D4AF37]"
            title="الشركاء"
          >
            <Users className="w-5 h-5" />
          </button>
          <button
            onClick={() => window.print()}
            className="p-1.5 rounded-xl hover:bg-white/10 text-[#D4AF37]"
            title="طباعة التحليل"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* أزرار الفلتر باللون الفاتح والذهبي */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto py-1">
          {(
            [
              { id: 'today', label: 'اليوم' },
              { id: '7days', label: 'آخر 7 أيام' },
              { id: '30days', label: 'آخر 30 يوم' },
              { id: 'all', label: 'كل الفترات' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id)}
              className={`px-4 py-2 rounded-full text-xs font-extrabold transition shrink-0 border ${
                period === tab.id
                  ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] shadow-sm'
                  : 'bg-white text-[#5C4B3E] border-[#E6DEC8] hover:border-[#C59B27]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* كارت التوصية الذكية الذهبي والداكن */}
        <div className="rounded-3xl bg-gradient-to-br from-[#231914] via-[#1C1410] to-[#2E2119] text-white p-5 shadow-lg border border-[#C59B27]/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#C59B27]/20 border border-[#C59B27]/40 flex items-center justify-center">
                <Award className="w-5 h-5 text-[#FBF5B7]" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-[#D4AF37]">
                  ملخص الأداء الفعلي للمحل والجملة
                </div>
                <div className="text-[11px] text-stone-300">
                  بناءً على الفواتير والتشغيلات المسجلة
                </div>
              </div>
            </div>
            <span className="bg-[#C59B27] text-[#1E1612] text-xs font-black px-3 py-1 rounded-full">
              هامش ربح {profitMarginPercent.toFixed(1)}%
            </span>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-black text-[#FBF5B7]">
              إجمالي المبيعات: {totalSales.toLocaleString('ar-EG')} ج.م
            </h2>
            <p className="text-xs text-stone-300 leading-relaxed">
              تستند الأرقام إلى الفواتير المسجلة خلال الفترة المختارة. يوجد
              حالياً <b>{lowStockItems.length} أصناف</b> وصلت لحد الطلب تحتاج
              للتوريد أو التصنيع.
            </p>
          </div>

          <button
            onClick={() => onNavigate('reports')}
            className="w-full bg-gradient-to-l from-[#D4AF37] to-[#B38728] text-[#1E1612] font-black text-xs py-3 rounded-2xl shadow hover:opacity-95 transition"
          >
            فتح تقارير الأرباح وتوزيعات الشركاء
          </button>
        </div>

        {/* كارت تحليل رأس المال والسيولة (فاتح بإطار ذهبي فخم) */}
        <div className="rounded-3xl bg-white border-2 border-[#DFD2B4] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-2xl bg-[#FDF8EB] border border-[#E8D8A8] flex items-center justify-center">
                <PiggyBank className="w-6 h-6 text-[#9E7918]" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-[#1E1612]">
                  تحليل رأس المال والأرباح الكامنة بالمخزن
                </div>
                <div className="text-[11px] text-[#7A6855]">
                  حساب حي من أرصدة البن والتوليفات ومديونيات الجملة
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-2xl font-black text-[#1E1612]">
              {Math.round(
                totalInventoryValue + totalCustomerDebts,
              ).toLocaleString('ar-EG')}{' '}
              <span className="text-sm font-bold text-[#9E7918]">
                ج.م إجمالي الأصول
              </span>
            </div>
          </div>

          <div className="bg-[#FAF8F4] rounded-2xl p-3.5 space-y-2.5 text-xs border border-[#EAE2D3]">
            <div className="flex items-center justify-between">
              <span className="text-[#5C4B3E] font-semibold">
                • تكلفة البضاعة الموجودة بالمخزن حالياً (WAC):
              </span>
              <span className="font-black text-[#1E1612]">
                {Math.round(totalInventoryValue).toLocaleString('ar-EG')} ج.م
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C4B3E] font-semibold">
                • الأرباح المتوقعة عند بيع رصيد المخزن الحالي:
              </span>
              <span className="font-black text-emerald-700">
                +{Math.round(expectedStockProfit).toLocaleString('ar-EG')} ج.م
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C4B3E] font-semibold">
                • مديونيات عملاء الجملة المستحقة للتحصيل:
              </span>
              <span className="font-black text-[#B38728]">
                {totalCustomerDebts.toLocaleString('ar-EG')} ج.م
              </span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('shortages')}
            className="w-full text-center text-xs font-extrabold text-[#9E7918] hover:underline pt-1"
          >
            مراجعة نواقص المخزن ({lowStockItems.length} أصناف) &gt;
          </button>
        </div>

        {/* الكروت الأربعة السفلية */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D5] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7A6855]">
                صافي المبيعات
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#FDF8EB] text-[#B38728] flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-[#1E1612]">
              {Math.round(totalSales).toLocaleString('ar-EG')} ج.م
            </div>
            <div className="text-[11px] font-bold text-emerald-700">
              {activeInvoices.length} فاتورة مسجلة
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D5] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7A6855]">
                مجمل الربح
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-emerald-700">
              {Math.round(grossProfit).toLocaleString('ar-EG')} ج.م
            </div>
            <div className="text-[11px] font-bold text-[#7A6855]">
              هامش {profitMarginPercent.toFixed(1)}%
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D5] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7A6855]">
                رأس مال المخزن
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#FDF8EB] text-[#B38728] flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-[#1E1612]">
              {Math.round(totalInventoryValue).toLocaleString('ar-EG')} ج.م
            </div>
            <div className="text-[11px] text-[#7A6855]">
              {items.length} صنف وتوليفة
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D5] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7A6855]">
                عملاء الجملة
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-[#1E1612]">
              {customers.length} عملاء
            </div>
            <div className="text-[11px] text-[#B38728] font-bold">
              آجل: {totalCustomerDebts.toLocaleString('ar-EG')} ج.م
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// شاشة تقارير الأرباح وتوزيع الشركاء الأربعة (ProfitReportsScreen)
// ============================================================================
interface ProfitReportsProps {
  items: InventoryItem[];
  salesInvoices: SalesInvoice[];
  expenses: Expense[];
  partners?: Partner[];
  onBack: () => void;
}

export const ProfitReportsScreen: React.FC<ProfitReportsProps> = ({
  items,
  salesInvoices,
  expenses,
  partners = [],
  onBack,
}) => {
  const [bottomTab, setBottomTab] = useState<
    'summary' | 'partners_share' | 'products' | 'invoices'
  >('summary');
  const [invoiceSearch,setInvoiceSearch]=useState('');
  const matchingInvoices=useMemo(()=>{
    const q=invoiceSearch.trim().toLocaleLowerCase();
    return q?salesInvoices.filter(inv=>[inv.invoiceNumber,inv.customerName,inv.date].some(text=>text.toLocaleLowerCase().includes(q))):salesInvoices;
  },[salesInvoices,invoiceSearch]);
  const invoicePage=useRecordPage(matchingInvoices,invoiceSearch);

  const activeInvoices = useMemo(
    () => salesInvoices.filter((i) => !i.isReturned),
    [salesInvoices],
  );

  // إجماليات حقيقية 100% من الفواتير والمصروفات المسجلة
  const stats = useMemo(() => {
    const sales = activeInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const cost = activeInvoices.reduce((s, i) => s + i.totalCost, 0);
    const grossProfit = activeInvoices.reduce((s, i) => s + i.netProfit, 0);
    const totalExpenses = operatingExpenses(expenses);
    const netProfit = grossProfit - totalExpenses;

    const cashierSales = activeInvoices
      .filter((i) => i.saleType === 'cashier_sync' || i.saleType === 'retail')
      .reduce((s, i) => s + i.totalAmount, 0);
    const wholesaleSales = activeInvoices
      .filter((i) => i.saleType === 'wholesale')
      .reduce((s, i) => s + i.totalAmount, 0);

    return {
      sales,
      cost,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      marginPercent: sales > 0 ? (grossProfit / sales) * 100 : 0,
      markupPercent: cost > 0 ? (grossProfit / cost) * 100 : 0,
      invoicesCount: activeInvoices.length,
      itemsCount: activeInvoices.reduce((s, i) => s + i.items.length, 0),
      cashierSales,
      wholesaleSales,
    };
  }, [activeInvoices, expenses]);

  // تجميع الأرباح حسب التاريخ للرسم البياني
  const dailyChartData = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const inv of activeInvoices) {
      const label = inv.date;
      grouped.set(label, (grouped.get(label) || 0) + Math.round(inv.netProfit));
    }
    const entries = Array.from(grouped.entries()).map(([date, value]) => ({
      date,
      value,
    }));
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [activeInvoices]);

  const maxBarValue = useMemo(
    () => Math.max(...dailyChartData.map((d) => d.value), 1000),
    [dailyChartData],
  );

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24 flex flex-col">
      {/* الهيدر */}
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <h1 className="text-base font-extrabold">
          تقارير الأرباح وحصص الشركاء
        </h1>
        <button
          onClick={() => window.print()}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
          title="طباعة التقرير"
        >
          <Download className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {bottomTab === 'summary' && (
          <>
            {/* كارت صافي الربح الرئيسي بهوية بُن العجوز (إسبريسو وذهبي وأخضر زمردي) */}
            <div className="rounded-3xl bg-gradient-to-br from-[#1E1612] via-[#2B201A] to-[#1A130F] text-white p-5 shadow-lg border-2 border-[#C59B27] space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-extrabold">
                    <TrendingUp className="w-4 h-4" />
                    <span>صافي الربح النهائي (بعد خصم المصروفات)</span>
                  </div>
                  <div className="text-3xl font-black text-[#FBF5B7] tracking-tight">
                    {stats.netProfit.toFixed(2)} ج.م
                  </div>
                  <div className="text-xs text-stone-300 font-semibold">
                    هامش الربح: {stats.marginPercent.toFixed(1)}% • العائد على
                    التكلفة: {stats.markupPercent.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="border-t border-[#C59B27]/30 pt-3.5 grid grid-cols-2 gap-y-3 text-xs">
                <div>
                  <div className="text-[#D4AF37]">إجمالي المبيعات</div>
                  <div className="text-base font-black text-white">
                    {stats.sales.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-[#D4AF37]">تكلفة البضاعة المباعة</div>
                  <div className="text-base font-black text-white">
                    {stats.cost.toFixed(2)} ج.م
                  </div>
                </div>
                <div>
                  <div className="text-[#D4AF37]">
                    مجمل الربح (قبل المصروفات)
                  </div>
                  <div className="text-base font-black text-emerald-400">
                    +{stats.grossProfit.toFixed(2)} ج.م
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-[#D4AF37]">إجمالي المصروفات</div>
                  <div className="text-base font-black text-amber-400">
                    - {stats.expenses.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-stone-300">
                    • مبيعات كاشير المحل (قطاعي ومشروبات):
                  </span>
                  <span className="font-extrabold text-[#FBF5B7]">
                    {stats.cashierSales.toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-300">
                    • مبيعات الجملة (توليفات وحبوب بن):
                  </span>
                  <span className="font-extrabold text-[#FBF5B7]">
                    {stats.wholesaleSales.toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
                <div className="border-t border-white/15 pt-1.5 flex justify-between text-xs font-black text-emerald-300">
                  <span>
                    حصة {partners[0]?.name || 'المالك'} (
                    {partners[0]?.sharePercent || 0}%):
                  </span>
                  <span>
                    {(
                      (stats.netProfit * (partners[0]?.sharePercent ?? 0)) /
                      100
                    ).toFixed(2)}{' '}
                    ج.م
                  </span>
                </div>
              </div>
            </div>

            {/* كارت الرسم البياني اليومي */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-[#E6DEC8] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#1E1612] flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-[#B38728]" />
                  تطور الأرباح اليومية
                </h3>
                <span className="text-[11px] text-[#7A6855]">
                  بالجنيه المصري
                </span>
              </div>

              <div className="h-48 flex items-end justify-between gap-2 pt-6 px-2 overflow-x-auto">
                {dailyChartData.map((bar, idx) => {
                  const heightPercent = Math.max(
                    14,
                    Math.round((bar.value / maxBarValue) * 100),
                  );
                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center flex-1 min-w-[36px] h-full justify-end group"
                    >
                      <span className="text-[10px] font-extrabold text-[#1E1612] mb-1">
                        {bar.value}
                      </span>
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className="w-full max-w-[28px] rounded-t-xl bg-gradient-to-t from-[#1E1612] via-[#8F6D19] to-[#D4AF37] shadow-sm transition-all"
                      />
                      <span className="text-[10px] text-[#7A6855] font-bold mt-1.5">
                        {bar.date}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* تبويب تسوية وتوزيع أرباح الشركاء الأربعة */}
        {bottomTab === 'partners_share' && (
          <div className="space-y-3">
            <div className="bg-[#FDF8EB] border border-[#E8D8A8] rounded-2xl p-3.5 text-xs text-[#5C4B3E] leading-relaxed">
              <b className="text-[#1E1612] block mb-1">
                جدول تصفية حسابات الشركاء الأربعة المالكين:
              </b>
              يتم احتساب حصة كل شريك من صافي الربح ({stats.netProfit.toFixed(2)}{' '}
              ج.م)، ثم يُضاف إليها ما دفعه الشريك من جيبه للمحل، ويُخصم منها
              مسحوباته الشخصية.
            </div>

            {partners.map((p) => {
              const profitShare = (stats.netProfit * p.sharePercent) / 100;
              const finalEntitlement =
                profitShare + p.totalPaidFromPocket - p.totalWithdrawals;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#1E1612] text-[#FBF5B7] font-black flex items-center justify-center">
                        {p.avatarLetter}
                      </div>
                      <div>
                        <div className="text-sm font-extrabold text-[#1E1612]">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-[#7A6855]">
                          حساب: @{p.username} • حصة الشراكة: {p.sharePercent}%
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-[#7A6855]">
                        الصافي المستحق له
                      </div>
                      <div className="text-sm font-black text-emerald-700">
                        {finalEntitlement.toFixed(2)} ج.م
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center bg-[#FAF8F4] p-2.5 rounded-xl border border-[#EDE6D8] text-xs">
                    <div>
                      <div className="text-[10px] text-[#7A6855]">
                        نصيبه من الربح
                      </div>
                      <div className="font-black text-[#1E1612]">
                        {profitShare.toFixed(1)} ج.م
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">
                        دفع من جيبه
                      </div>
                      <div className="font-black text-emerald-700">
                        +{p.totalPaidFromPocket} ج.م
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">مسحوباته</div>
                      <div className="font-black text-red-600">
                        -{p.totalWithdrawals} ج.م
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* تبويب ربحية المنتجات */}
        {bottomTab === 'products' && (
          <div className="space-y-2.5">
            {items
              .filter((i) => i.canSellDirectly)
              .map((item) => {
                const unitProfitRetail = item.retailPrice - item.costPrice;
                const marginRetail =
                  item.retailPrice > 0
                    ? ((unitProfitRetail / item.retailPrice) * 100).toFixed(1)
                    : '0';
                const unitProfitWholesale =
                  item.wholesalePrice - item.costPrice;

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-[#1E1612]">
                        {item.name}
                      </span>
                      <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8]">
                        هامش {marginRetail}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs bg-[#FAF8F4] p-2.5 rounded-xl border border-[#EDE6D8]">
                      <div>
                        <div className="text-[10px] text-[#7A6855]">
                          التكلفة
                        </div>
                        <div className="font-black text-[#1E1612]">
                          {item.costPrice.toFixed(2)} ج.م
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#7A6855]">
                          ربح القطاعي
                        </div>
                        <div className="font-black text-emerald-700">
                          +{unitProfitRetail.toFixed(2)} ج.م
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#7A6855]">
                          ربح الجملة
                        </div>
                        <div className="font-black text-[#9E7918]">
                          +{unitProfitWholesale.toFixed(2)} ج.م
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* تبويب الفواتير */}
        {bottomTab === 'invoices' && (
          <div className="space-y-3">
            <input aria-label="بحث في كل فواتير التقرير" value={invoiceSearch} onChange={event=>setInvoiceSearch(event.target.value)} placeholder="رقم الفاتورة أو العميل أو التاريخ" className="w-full rounded-xl border p-3 text-sm" />
            <RecordPagination {...invoicePage} />
            {invoicePage.visible.map((inv) => (
              <div
                key={inv.id}
                className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#9E7918]">
                    #{inv.invoiceNumber} • {inv.date}
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FDF8EB] text-[#1E1612] border border-[#E8D8A8]">
                    {inv.saleType === 'wholesale'
                      ? 'فاتورة جملة'
                      : inv.saleType === 'cashier_sync'
                        ? 'مزامنة كاشير المحل'
                        : 'بيع محل'}
                  </span>
                </div>
                <div className="text-sm font-bold text-[#1E1612]">
                  {inv.customerName}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs bg-[#FAF8F4] p-2.5 rounded-xl border border-[#EDE6D8]">
                  <div>
                    <div className="text-[10px] text-[#7A6855]">المبيعات</div>
                    <div className="font-extrabold">{inv.totalAmount} ج.م</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#7A6855]">التكلفة</div>
                    <div className="font-extrabold">
                      {inv.totalCost.toFixed(1)} ج.م
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#7A6855]">صافي الربح</div>
                    <div className="font-black text-emerald-700">
                      +{inv.netProfit.toFixed(1)} ج.م
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <RecordPagination {...invoicePage} />
          </div>
        )}
      </div>

      {/* شريط التنقل السفلي داخل التقارير */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E6DEC8] py-2 px-3 grid grid-cols-4 z-30 max-w-md mx-auto">
        <button
          onClick={() => setBottomTab('summary')}
          className={`flex flex-col items-center gap-1 py-1 ${
            bottomTab === 'summary'
              ? 'text-[#1E1612] font-black'
              : 'text-[#9C8B7A]'
          }`}
        >
          <LayoutGrid className="w-5 h-5 text-[#C59B27]" />
          <span className="text-[11px]">الملخص</span>
        </button>
        <button
          onClick={() => setBottomTab('partners_share')}
          className={`flex flex-col items-center gap-1 py-1 ${
            bottomTab === 'partners_share'
              ? 'text-[#1E1612] font-black'
              : 'text-[#9C8B7A]'
          }`}
        >
          <Users className="w-5 h-5 text-[#C59B27]" />
          <span className="text-[11px]">حصص الشركاء</span>
        </button>
        <button
          onClick={() => setBottomTab('products')}
          className={`flex flex-col items-center gap-1 py-1 ${
            bottomTab === 'products'
              ? 'text-[#1E1612] font-black'
              : 'text-[#9C8B7A]'
          }`}
        >
          <Package className="w-5 h-5 text-[#C59B27]" />
          <span className="text-[11px]">ربحية الأصناف</span>
        </button>
        <button
          onClick={() => setBottomTab('invoices')}
          className={`flex flex-col items-center gap-1 py-1 ${
            bottomTab === 'invoices'
              ? 'text-[#1E1612] font-black'
              : 'text-[#9C8B7A]'
          }`}
        >
          <FileText className="w-5 h-5 text-[#C59B27]" />
          <span className="text-[11px]">الفواتير</span>
        </button>
      </div>
    </div>
  );
};
