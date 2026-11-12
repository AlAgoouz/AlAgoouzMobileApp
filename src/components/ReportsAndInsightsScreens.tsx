import {Sparkles as HeaderSparkles,ChartNoAxesCombined as HeaderChartNoAxesCombined} from 'lucide-react';
import {ReportExportButtons} from './ReportExportButtons';
import {FinancialOpeningPanel} from './FinancialOpeningPanel';
import type {StoreState} from '../lib/storeState';
import {ReportEvidence} from './ReportEvidence';
import {OperationHeader} from './OperationHeader';
import {initialPeriod,reportRange,inReportRange,buildReport,type PeriodSelection} from '../lib/reporting';
import {PeriodSelector} from './PeriodSelector';
import {TrendChart} from './FinancialCharts';
import type {ReportSale} from '../lib/cashierDays';
const amountText=(v:number|null,digits=2)=>v===null?'بانتظار تكلفة الأصناف':v.toFixed(digits)+' ج.م';
import {isStockItem} from '../lib/itemPolicy';
import { operatingExpenses } from '../lib/ledger';
import React, { useState, useMemo } from 'react';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {Share2, Users, TrendingUp, PiggyBank, FileText, Package, Download, LayoutGrid, Sparkles, Award} from 'lucide-react';
import {
  InventoryItem,
  Expense,
  Customer,
  Partner,
} from '../types/erp';

interface SmartInsightsProps {
  period?:PeriodSelection;onPeriod?:(next:PeriodSelection)=>void;
  items: InventoryItem[];
  salesInvoices: ReportSale[];
  customers: Customer[];
  onNavigate: (screen: string) => void;
  onBack: () => void;
}

export const SmartInsightsScreen: React.FC<SmartInsightsProps> = ({
  period,onPeriod,
  items,
  salesInvoices,
  customers,
  onNavigate,
  onBack,
}) => {
  const [localPeriod,setLocalPeriod]=useState(initialPeriod);
  const selection=period??localPeriod,range=reportRange(selection);

  // حسابات حقيقية 100% من بيانات المتجر
  const activeInvoices = useMemo(
    () =>
      salesInvoices.filter((i) => !i.isReturned && inReportRange(i.date,range)),
    [salesInvoices, range.from,range.to,range.valid],
  );

  const totalSales = useMemo(
    () => activeInvoices.reduce((s, inv) => s + inv.totalAmount, 0),
    [activeInvoices],
  );

  const grossProfit = useMemo(
    () => activeInvoices.some(i=>i.netProfit===null)?null:activeInvoices.reduce((s, inv) => s + inv.netProfit!, 0),
    [activeInvoices],
  );

  const profitMarginPercent = useMemo(
    () => (grossProfit===null?null:totalSales > 0 ? (grossProfit / totalSales) * 100 : 0),
    [grossProfit, totalSales],
  );

  const totalInventoryValue = useMemo(
    () =>
      items
        .filter((i) => isStockItem(i))
        .reduce((sum, i) => sum + i.stock * i.costPrice, 0),
    [items],
  );

  const totalExpectedRetailValue = useMemo(
    () =>
      items
        .filter((i) => isStockItem(i))
        .reduce((sum, i) => sum + i.stock * i.retailPrice, 0),
    [items],
  );

  const expectedStockProfit = totalExpectedRetailValue-totalInventoryValue;
  const estimateAvailable=!items.some(i=>isStockItem(i)&&(i.stock<0||i.stock>0&&i.retailPrice<=0));

  const totalCustomerDebts = useMemo(
    () => customers.reduce((sum, c) => sum + c.balance, 0),
    [customers],
  );

  const lowStockItems = useMemo(
    () =>
      items.filter(
        (i) => isStockItem(i) && i.stock <= i.minStock,
      ),
    [items],
  );

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-20">
      {/* هيدر إسبريسو وذهبي راقي */}
      <OperationHeader title={<>تحليلات وذكاء بُن العجوز</>} description={<>قراءة أداء المحل والتنبيهات خلال الفترة المختارة.</>} icon={HeaderSparkles} onBack={onBack}><div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('partners')}
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
        </div></OperationHeader>

      <div className="p-4 space-y-4">
        <PeriodSelector value={selection} onChange={onPeriod??setLocalPeriod}/>
        <p className="report-period-note">المبيعات ومجمل الربح للفترة المختارة. المخزون ومديونيات العملاء أرصدة حالية؛ مجمل الربح هنا قبل المصروفات.</p>

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
              {profitMarginPercent===null?'بانتظار تكلفة الأصناف':totalSales>0?`هامش مجمل الربح ${profitMarginPercent.toFixed(1)}%`:'الهامش غير متاح دون مبيعات'}
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
                  المخزون ومستحقات العملاء
                </div>
                <div className="text-[11px] text-[#7A6855]">
                  أرصدة حالية منفصلة عن فترة المبيعات
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
                ج.م مخزون ومديونيات عملاء
              </span>
            </div>
          </div>

          <div className="bg-[#FAF8F4] rounded-2xl p-3.5 space-y-2.5 text-xs border border-[#EAE2D3]">
            <div className="flex items-center justify-between">
              <span className="text-[#5C4B3E] font-semibold">
                • تكلفة البضاعة الموجودة بالمخزن حاليًا:
              </span>
              <span className="font-black text-[#1E1612]">
                {Math.round(totalInventoryValue).toLocaleString('ar-EG')} ج.م
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C4B3E] font-semibold">
                • فارق أسعار البيع المسجلة عن تكلفة المخزون:
              </span>
              <span className={estimateAvailable&&expectedStockProfit<0?'font-black value-negative':'font-black text-[#80673e]'}>
                {estimateAvailable?Math.round(expectedStockProfit).toLocaleString('ar-EG')+' ج.م':'غير متاح: أسعار ناقصة أو رصيد سالب'}
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
              {amountText(grossProfit)}
            </div>
            <div className="text-[11px] font-bold text-[#7A6855]">
              {profitMarginPercent===null?'بانتظار تكلفة الأصناف':totalSales>0?`هامش ${profitMarginPercent.toFixed(1)}%`:'غير متاح دون مبيعات'}
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
  financeState?:StoreState;
  onSaveOpening?:(date:string,amount:number,reason:string)=>Promise<void>;
  period?:PeriodSelection;onPeriod?:(next:PeriodSelection)=>void;
  onInsights?:()=>void;
  onOpenRecord?:(kind:"sale"|"expense",id:string)=>void;
  items: InventoryItem[];
  salesInvoices: ReportSale[];
  expenses: Expense[];
  partners?: Partner[];
  onBack: () => void;
}

export const ProfitReportsScreen: React.FC<ProfitReportsProps> = ({
  financeState,onSaveOpening,
  period,onPeriod,
  onInsights,
  onOpenRecord,
  items,
  salesInvoices,
  expenses,
  partners = [],
  onBack,
}) => {
  const [bottomTab, setBottomTab] = useState<
    'summary' | 'partners_share' | 'products' | 'invoices'
  >('summary');
  const [localPeriod,setLocalPeriod]=useState<PeriodSelection>(()=>({...initialPeriod(),kind:'all'}));
  const selection=period??localPeriod,range=reportRange(selection);
  const periodReport=useMemo(()=>buildReport(salesInvoices,expenses,range),[salesInvoices,expenses,range.from,range.to,range.valid]);
  const [invoiceSearch,setInvoiceSearch]=useState('');
  const matchingInvoices=useMemo(()=>{
    const q=invoiceSearch.trim().toLocaleLowerCase();
    return q?periodReport.invoices.filter(inv=>[inv.invoiceNumber,inv.customerName,inv.date].some(text=>text.toLocaleLowerCase().includes(q))):periodReport.invoices;
  },[periodReport.invoices,invoiceSearch]);
  const invoicePage=useRecordPage(matchingInvoices,invoiceSearch+'|'+range.from+'|'+range.to);
  const stats=useMemo(()=>({sales:periodReport.revenue,cost:periodReport.cost,grossProfit:periodReport.gross,expenses:periodReport.spent,netProfit:periodReport.net,
    marginPercent:periodReport.gross===null?null:periodReport.revenue?periodReport.gross/periodReport.revenue*100:0,markupPercent:periodReport.gross===null?null:periodReport.cost?periodReport.gross/periodReport.cost*100:0,
    invoicesCount:periodReport.active.length,itemsCount:periodReport.active.reduce((s,i)=>s+i.items.length,0),
    cashierSales:periodReport.active.filter(i=>i.saleType!=='wholesale').reduce((s,i)=>s+i.totalAmount,0),wholesaleSales:periodReport.active.filter(i=>i.saleType==='wholesale').reduce((s,i)=>s+i.totalAmount,0)}),[periodReport]);
  const cumulativeNet=useMemo(()=>salesInvoices.some(i=>!i.isReturned&&i.netProfit===null)?null:salesInvoices.filter(i=>!i.isReturned).reduce((sum,i)=>sum+i.netProfit!,0)-operatingExpenses(expenses),[salesInvoices,expenses]);

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24 flex flex-col">
      {/* الهيدر */}
      <OperationHeader title={<>تقارير الأرباح وحصص الشركاء</>} description={<>النتائج المالية وحصص الشركاء وربحية الأصناف.</>} icon={HeaderChartNoAxesCombined} onBack={onBack}><button
          onClick={() => window.print()}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
          title={bottomTab === 'invoices' ? 'طباعة الصفحة الحالية' : 'طباعة التقرير'}
        >
          <Download className="w-5 h-5" />
        </button></OperationHeader>

      <div className="report-tabs bg-white border-b border-[#E6DEC8] py-2 px-3 grid grid-cols-4" aria-label="أقسام التقرير">
        <button
          onClick={() => setBottomTab('summary')} aria-pressed={bottomTab==='summary'}
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
          onClick={() => setBottomTab('partners_share')} aria-pressed={bottomTab==='partners_share'}
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
          onClick={() => setBottomTab('products')} aria-pressed={bottomTab==='products'}
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
          onClick={() => setBottomTab('invoices')} aria-pressed={bottomTab==='invoices'}
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
      <div className="report-period"><PeriodSelector value={selection} onChange={onPeriod??setLocalPeriod}/><p className="report-period-note">الفترة تطبّق على الملخص والفواتير والرسم الزمني. تسوية الشركاء تراكمية، وربحية سعر الصنف مبنية على الأسعار الحالية.</p></div>
      <div className={`report-content p-4 space-y-4 flex-1 ${bottomTab==='summary'?'report-summary':''}`}>
        {onInsights&&<button type="button" onClick={onInsights} className="text-xs border border-[#E6DEC8] bg-white rounded-xl px-4 py-3 flex items-center gap-2"><Sparkles size={16}/>تحليلات المحل والتنبيهات</button>}
        {periodReport.pendingCostDays>0&&<p role="status" className="record-state">{periodReport.pendingCostDays} أيام مبيعات مسجلة ماليًا؛ الربح وتوزيع حصصه ينتظران استكمال تكلفة الأصناف. رفع الأصناف لا يكرر الإيراد.</p>}
        {bottomTab === 'summary' && (
          <>
            {/* كارت صافي الربح الرئيسي بهوية بُن العجوز (إسبريسو وذهبي وأخضر زمردي) */}
            <div className="rounded-3xl bg-gradient-to-br from-[#1E1612] via-[#2B201A] to-[#1A130F] text-white p-5 shadow-lg border-2 border-[#C59B27] space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-extrabold">
                    <TrendingUp className="w-4 h-4" />
                    <span>صافي ربح الفترة (بعد خصم المصروفات)</span>
                  </div>
                  <output aria-label="صافي ربح الفترة" className={`block text-3xl font-black tracking-tight ${stats.netProfit!==null&&stats.netProfit<0?'text-rose-300':'text-[#FBF5B7]'}`}>
                    {amountText(stats.netProfit)}
                  </output>
                  <div className="text-xs text-stone-300 font-semibold">
                    هامش مجمل الربح: {stats.marginPercent!==null&&stats.sales>0?stats.marginPercent.toFixed(1)+'%':'غير متاح'} • العائد على
                    التكلفة: {stats.markupPercent!==null&&stats.cost!==null&&stats.cost>0?stats.markupPercent.toFixed(1)+'%':'غير متاح'}
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
                    {amountText(stats.cost)}
                  </div>
                </div>
                <div>
                  <div className="text-[#D4AF37]">
                    مجمل الربح (قبل المصروفات)
                  </div>
                  <div className="text-base font-black text-emerald-400">
                    {amountText(stats.grossProfit)}
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
                    {amountText(stats.netProfit===null?null:stats.netProfit*(partners[0]?.sharePercent??0)/100)}
                  </span>
                </div>
              </div>
            </div>

            {/* كارت الرسم البياني اليومي */}
            {financeState&&<FinancialOpeningPanel state={financeState} range={range} onSave={onSaveOpening}/>}
            <ReportExportButtons range={range}/><TrendChart points={periodReport.points}/><ReportEvidence onOpenRecord={onOpenRecord} sales={salesInvoices} expenses={expenses} range={range}/>

          </>
        )}

        {/* تبويب تسوية وتوزيع أرباح الشركاء الأربعة */}
        {bottomTab === 'partners_share' && (
          <div className="space-y-3">
            <div className="bg-[#FDF8EB] border border-[#E8D8A8] rounded-2xl p-3.5 text-xs text-[#5C4B3E] leading-relaxed">
              <b className="text-[#1E1612] block mb-1">
                تسوية تراكمية لحسابات الشركاء — كل السجل:
              </b>
              يتم احتساب حصة كل شريك من صافي الربح ({amountText(cumulativeNet)})، ثم يُضاف إليها ما دفعه الشريك من جيبه للمحل، ويُخصم منها
              مسحوباته الشخصية.
            </div>

            {partners.map((p) => {
              const profitShare = cumulativeNet===null?null:(cumulativeNet * p.sharePercent) / 100;
              const finalEntitlement =
                profitShare===null?null:profitShare + p.totalPaidFromPocket - p.totalWithdrawals;

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
                          حصة الشراكة: {p.sharePercent}%
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-[#7A6855]">
                        الصافي المستحق له
                      </div>
                      <div className={`text-sm font-black ${finalEntitlement!==null&&finalEntitlement<0?'value-negative':'value-positive'}`}>
                        {amountText(finalEntitlement)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center bg-[#FAF8F4] p-2.5 rounded-xl border border-[#EDE6D8] text-xs">
                    <div>
                      <div className="text-[10px] text-[#7A6855]">
                        نصيبه من الربح
                      </div>
                      <div className="font-black text-[#1E1612]">
                        {amountText(profitShare,1)}
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
          <div className="space-y-2.5"><p className="operation-note">هامش السعر الحالي للصنف؛ ليس الربح المحقق خلال الفترة. تكلفة وصفة المشروب تُراجع مع مكوناتها.</p>
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
                          {unitProfitRetail.toFixed(2)} ج.م
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#7A6855]">
                          ربح الجملة
                        </div>
                        <div className="font-black text-[#9E7918]">
                          {unitProfitWholesale.toFixed(2)} ج.م
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
                      {amountText(inv.totalCost,1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#7A6855]">صافي الربح</div>
                    <div className="font-black text-emerald-700">
                      {amountText(inv.netProfit,1)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <RecordPagination {...invoicePage} />
          </div>
        )}
      </div>


    </div>
  );
};
