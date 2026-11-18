import {RecordTabs} from './RecordTabs';
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
    <div className="operation-screen min-h-screen pb-20">
      {/* هيدر إسبريسو وذهبي راقي */}
      <OperationHeader title={<>تحليلات وذكاء بُن العجوز</>} description={<>قراءة أداء المحل والتنبيهات خلال الفترة المختارة.</>} icon={HeaderSparkles} onBack={onBack}><div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('partners')}
            title="الشركاء"
            aria-label="الشركاء"
          >
            <Users className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="طباعة التحليل"
            aria-label="طباعة التحليل"
          >
            <Share2 className="w-5 h-5" aria-hidden="true" />
          </button>
        </div></OperationHeader>

      <div className="record-workspace">
        <PeriodSelector value={selection} onChange={onPeriod??setLocalPeriod}/>
        <p className="report-period-note">المبيعات ومجمل الربح للفترة المختارة. المخزون ومديونيات العملاء أرصدة حالية؛ مجمل الربح هنا قبل المصروفات.</p>

        <div className="workspace-split-layout">
          {/* كارت التوصية الذكية الذهبي والداكن */}
          <div className="summary-banner-dark space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-md bg-white/10 border border-gold-edge flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5 text-gold-highlight" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-gold-soft">
                    ملخص الأداء الفعلي للمحل والجملة
                  </div>
                  <div className="text-xs text-ink-on-dark/80">
                    بناءً على الفواتير والتشغيلات المسجلة
                  </div>
                </div>
              </div>
              <span className="record-badge bg-gold-soft text-ink-on-gold border-gold-edge font-black">
                {profitMarginPercent===null?'بانتظار تكلفة الأصناف':totalSales>0?`هامش مجمل الربح ${profitMarginPercent.toFixed(1)}%`:'الهامش غير متاح دون مبيعات'}
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-gold-highlight">
                إجمالي المبيعات: {totalSales.toLocaleString('ar-EG')} ج.م
              </h2>
              <p className="text-xs text-ink-on-dark leading-relaxed">
                تستند الأرقام إلى الفواتير المسجلة خلال الفترة المختارة. يوجد
                حالياً <b>{lowStockItems.length} أصناف</b> وصلت لحد الطلب تحتاج
                للتوريد أو التصنيع.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="operation-primary w-full"
            >
              فتح تقارير الأرباح وتوزيعات الشركاء
            </button>
          </div>

          {/* كارت تحليل رأس المال والسيولة */}
          <section className="operation-surface space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="card-icon">
                  <PiggyBank className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-ink-strong">
                    المخزون ومستحقات العملاء
                  </div>
                  <div className="text-xs text-ink">
                    أرصدة حالية منفصلة عن فترة المبيعات
                  </div>
                </div>
              </div>
            </div>

            <div className="text-2xl font-black text-ink-strong">
              {Math.round(
                totalInventoryValue + totalCustomerDebts,
              ).toLocaleString('ar-EG')}{' '}
              <span className="text-sm font-bold text-gold">
                ج.م مخزون ومديونيات عملاء
              </span>
            </div>

            <div className="bg-surface-sunken rounded-md p-3.5 space-y-2.5 text-xs border border-line-subtle">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink font-semibold">
                  • تكلفة البضاعة الموجودة بالمخزن حاليًا:
                </span>
                <span className="font-black text-ink-strong">
                  {Math.round(totalInventoryValue).toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink font-semibold">
                  • فارق أسعار البيع المسجلة عن تكلفة المخزون:
                </span>
                <span className={estimateAvailable&&expectedStockProfit<0?'font-black value-negative':'font-black text-gold'}>
                  {estimateAvailable?Math.round(expectedStockProfit).toLocaleString('ar-EG')+' ج.م':'غير متاح: أسعار ناقصة أو رصيد سالب'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink font-semibold">
                  • مديونيات عملاء الجملة المستحقة للتحصيل:
                </span>
                <span className="font-black text-gold">
                  {totalCustomerDebts.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('shortages')}
              className="action-button w-full text-gold"
            >
              مراجعة نواقص المخزن ({lowStockItems.length} أصناف) &gt;
            </button>
          </section>
        </div>

        {/* الكروت الأربعة السفلية */}
        <div className="metric-grid">
          <article className="metric-card metric-gold">
            <span className="metric-icon">
              <FileText className="w-5 h-5" aria-hidden="true" />
            </span>
            <p>صافي المبيعات</p>
            <strong>
              {Math.round(totalSales).toLocaleString('ar-EG')} <small>ج.م</small>
            </strong>
            <span className="metric-detail">
              {activeInvoices.length} فاتورة مسجلة
            </span>
          </article>

          <article className="metric-card metric-positive">
            <span className="metric-icon">
              <TrendingUp className="w-5 h-5" aria-hidden="true" />
            </span>
            <p>مجمل الربح</p>
            <strong>{amountText(grossProfit)}</strong>
            <span className="metric-detail">
              {profitMarginPercent===null?'بانتظار تكلفة الأصناف':totalSales>0?`هامش ${profitMarginPercent.toFixed(1)}%`:'غير متاح دون مبيعات'}
            </span>
          </article>

          <article className="metric-card metric-neutral">
            <span className="metric-icon">
              <Package className="w-5 h-5" aria-hidden="true" />
            </span>
            <p>رأس مال المخزن</p>
            <strong>
              {Math.round(totalInventoryValue).toLocaleString('ar-EG')} <small>ج.م</small>
            </strong>
            <span className="metric-detail">
              {items.length} صنف وتوليفة
            </span>
          </article>

          <article className="metric-card metric-amber">
            <span className="metric-icon">
              <Users className="w-5 h-5" aria-hidden="true" />
            </span>
            <p>عملاء الجملة</p>
            <strong>{customers.length} <small>عملاء</small></strong>
            <span className="metric-detail">
              آجل: {totalCustomerDebts.toLocaleString('ar-EG')} ج.م
            </span>
          </article>
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
    <div className="operation-screen min-h-screen pb-24 flex flex-col">
      {/* الهيدر */}
      <OperationHeader title={<>تقارير الأرباح وحصص الشركاء</>} description={<>النتائج المالية وحصص الشركاء وربحية الأصناف.</>} icon={HeaderChartNoAxesCombined} onBack={onBack}><button
          type="button"
          onClick={() => window.print()}
          title={bottomTab === 'invoices' ? 'طباعة الصفحة الحالية' : 'طباعة التقرير'}
          aria-label={bottomTab === 'invoices' ? 'طباعة الصفحة الحالية' : 'طباعة التقرير'}
        >
          <Download className="w-5 h-5" aria-hidden="true" />
        </button></OperationHeader>

      <div className="operation-tab-strip">
        <RecordTabs label="أقسام التقرير" value={bottomTab} onChange={setBottomTab} tabs={[
          {id:'summary',label:'الملخص'},{id:'partners_share',label:'حصص الشركاء'},
          {id:'products',label:'ربحية الأصناف'},{id:'invoices',label:'الفواتير'},
        ]}/>
      </div>
      <div className="report-period"><PeriodSelector value={selection} onChange={onPeriod??setLocalPeriod}/><p className="report-period-note">الفترة تطبّق على الملخص والفواتير والرسم الزمني. تسوية الشركاء تراكمية، وربحية سعر الصنف مبنية على الأسعار الحالية.</p></div>
      <div className={`report-content p-4 space-y-4 flex-1 ${bottomTab==='summary'?'report-summary':''}`}>
        {onInsights&&<button type="button" onClick={onInsights} className="action-button"><Sparkles size={16} aria-hidden="true"/>تحليلات المحل والتنبيهات</button>}
        {periodReport.pendingCostDays>0&&<p role="status" className="record-state">{periodReport.pendingCostDays} أيام مبيعات مسجلة ماليًا؛ الربح وتوزيع حصصه ينتظران استكمال تكلفة الأصناف. رفع الأصناف لا يكرر الإيراد.</p>}
        {bottomTab === 'summary' && (
          <>
            {/* كارت صافي الربح الرئيسي بهوية بُن العجوز */}
            <div className="summary-banner-dark space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-gold-soft text-xs font-extrabold">
                    <TrendingUp className="w-4 h-4" aria-hidden="true" />
                    <span>صافي ربح الفترة (بعد خصم المصروفات)</span>
                  </div>
                  <output aria-label="صافي ربح الفترة" className={`block text-3xl font-black tracking-tight ${stats.netProfit!==null&&stats.netProfit<0?'text-rose-300':'text-gold-highlight'}`}>
                    {amountText(stats.netProfit)}
                  </output>
                  <div className="text-xs text-ink-on-dark font-semibold">
                    هامش مجمل الربح: {stats.marginPercent!==null&&stats.sales>0?stats.marginPercent.toFixed(1)+'%':'غير متاح'} • العائد على
                    التكلفة: {stats.markupPercent!==null&&stats.cost!==null&&stats.cost>0?stats.markupPercent.toFixed(1)+'%':'غير متاح'}
                  </div>
                </div>
              </div>

              <div className="border-t border-gold-edge/40 pt-3.5 grid grid-cols-2 gap-y-3 text-xs">
                <div>
                  <div className="text-gold-soft">إجمالي المبيعات</div>
                  <div className="text-base font-black text-white">
                    {stats.sales.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-gold-soft">تكلفة البضاعة المباعة</div>
                  <div className="text-base font-black text-white">
                    {amountText(stats.cost)}
                  </div>
                </div>
                <div>
                  <div className="text-gold-soft">
                    مجمل الربح (قبل المصروفات)
                  </div>
                  <div className="text-base font-black text-emerald-300">
                    {amountText(stats.grossProfit)}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-gold-soft">إجمالي المصروفات</div>
                  <div className="text-base font-black text-amber-300">
                    - {stats.expenses.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-md p-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-ink-on-dark">
                    • مبيعات كاشير المحل (قطاعي ومشروبات):
                  </span>
                  <span className="font-extrabold text-gold-highlight">
                    {stats.cashierSales.toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-ink-on-dark">
                    • مبيعات الجملة (توليفات وحبوب بن):
                  </span>
                  <span className="font-extrabold text-gold-highlight">
                    {stats.wholesaleSales.toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
                <div className="border-t border-white/15 pt-1.5 flex justify-between gap-2 text-xs font-black text-emerald-300">
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
            <div className="operation-note">
              <b className="text-ink-strong block mb-1">
                تسوية تراكمية لحسابات الشركاء — كل السجل:
              </b>
              يتم احتساب حصة كل شريك من صافي الربح ({amountText(cumulativeNet)})، ثم يُضاف إليها ما دفعه الشريك من جيبه للمحل، ويُخصم منها
              مسحوباته الشخصية.
            </div>

            <div className="record-grid">
              {partners.map((p) => {
                const profitShare = cumulativeNet===null?null:(cumulativeNet * p.sharePercent) / 100;
                const finalEntitlement =
                  profitShare===null?null:profitShare + p.totalPaidFromPocket - p.totalWithdrawals;

                return (
                  <article
                    key={p.id}
                    className="record-card space-y-3"
                  >
                    <div className="record-heading mb-0">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-md bg-espresso text-gold-highlight font-black flex items-center justify-center shrink-0">
                          {p.avatarLetter}
                        </div>
                        <div>
                          <h2 className="text-sm font-extrabold text-ink-strong">
                            {p.name}
                          </h2>
                          <p>حصة الشراكة: {p.sharePercent}%</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs text-ink">
                          الصافي المستحق له
                        </div>
                        <div className={`text-sm font-black ${finalEntitlement!==null&&finalEntitlement<0?'value-negative':'value-positive'}`}>
                          {amountText(finalEntitlement)}
                        </div>
                      </div>
                    </div>

                    <dl className="record-facts mb-0">
                      <div>
                        <dt>نصيبه من الربح</dt>
                        <dd>{amountText(profitShare,1)}</dd>
                      </div>
                      <div>
                        <dt>دفع من جيبه</dt>
                        <dd className="text-status-ok">+{p.totalPaidFromPocket} ج.م</dd>
                      </div>
                      <div>
                        <dt>مسحوباته</dt>
                        <dd className="text-status-danger">-{p.totalWithdrawals} ج.م</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* تبويب ربحية المنتجات */}
        {bottomTab === 'products' && (
          <div className="space-y-3"><p className="operation-note">هامش السعر الحالي للصنف؛ ليس الربح المحقق خلال الفترة. تكلفة وصفة المشروب تُراجع مع مكوناتها.</p>
            <div className="record-grid-3">
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
                    <article
                      key={item.id}
                      className="record-card space-y-2.5"
                    >
                      <div className="record-heading mb-0">
                        <h2 className="text-sm font-extrabold text-ink-strong">
                          {item.name}
                        </h2>
                        <span className="record-badge">
                          هامش {marginRetail}%
                        </span>
                      </div>
                      <dl className="record-facts mb-0">
                        <div>
                          <dt>التكلفة</dt>
                          <dd>{item.costPrice.toFixed(2)} ج.م</dd>
                        </div>
                        <div>
                          <dt>ربح القطاعي</dt>
                          <dd className="text-status-ok">{unitProfitRetail.toFixed(2)} ج.م</dd>
                        </div>
                        <div>
                          <dt>ربح الجملة</dt>
                          <dd className="text-gold">{unitProfitWholesale.toFixed(2)} ج.م</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
            </div>
          </div>
        )}

        {/* تبويب الفواتير */}
        {bottomTab === 'invoices' && (
          <div className="space-y-3">
            <label className="record-search">البحث في فواتير التقرير
              <input aria-label="بحث في كل فواتير التقرير" value={invoiceSearch} onChange={event=>setInvoiceSearch(event.target.value)} placeholder="رقم الفاتورة أو العميل أو التاريخ" />
            </label>
            <RecordPagination {...invoicePage} />
            <div className="record-grid">
              {invoicePage.visible.map((inv) => (
                <article
                  key={inv.id}
                  className="record-card space-y-2.5"
                >
                  <div className="record-heading mb-0">
                    <div>
                      <p className="font-extrabold text-gold" dir="ltr">
                        #{inv.invoiceNumber} • {inv.date}
                      </p>
                      <h2 className="font-bold text-ink-strong">
                        {inv.customerName}
                      </h2>
                    </div>
                    <span className="record-badge">
                      {inv.saleType === 'wholesale'
                        ? 'فاتورة جملة'
                        : inv.saleType === 'cashier_sync'
                          ? 'مزامنة كاشير المحل'
                          : 'بيع محل'}
                    </span>
                  </div>
                  <dl className="record-facts mb-0">
                    <div>
                      <dt>المبيعات</dt>
                      <dd>{inv.totalAmount} ج.م</dd>
                    </div>
                    <div>
                      <dt>التكلفة</dt>
                      <dd>{amountText(inv.totalCost,1)}</dd>
                    </div>
                    <div>
                      <dt>صافي الربح</dt>
                      <dd className="text-status-ok">{amountText(inv.netProfit,1)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <RecordPagination {...invoicePage} />
          </div>
        )}
      </div>


    </div>
  );
};
