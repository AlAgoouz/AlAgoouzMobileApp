import {multiplyMoney, sumMoney} from '../lib/money';
import { unitLabel as displayUnit } from '../lib/units';
import { ReceiptText as HeaderReceiptText, FolderSync as HeaderFolderSync } from 'lucide-react';
import { OperationHeader } from './OperationHeader';
import { businessDate } from '../lib/dates';
import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Users,
  Search,
  Trash2,
  Check,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  Coffee,
  AlertTriangle,
} from 'lucide-react';
import { InventoryItem, Customer, SalesInvoice, SalesInvoiceItem } from '../types/erp';
import { parseCashierExcelBuffer, downloadSampleCashierExcel, ParsedCashierRow } from '../lib/cashierExcelParser';
import { EmptyState } from './EmptyState';

interface SalesPosScreenProps {
  items: InventoryItem[];
  customers: Customer[];
  currentPartnerName: string;
  onSaveSale: (invoice: Omit<SalesInvoice, 'id' | 'invoiceNumber'>) => void;
  onNavigateToCashierSync: () => void;
  onBack: () => void;
}

export const SalesPosScreen: React.FC<SalesPosScreenProps> = ({
  items,
  customers,
  currentPartnerName,
  onSaveSale,
  onNavigateToCashierSync,
  onBack,
}) => {
  const [saleMode, setSaleMode] = useState<'wholesale' | 'retail'>('wholesale');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'نقدي' | 'آجل' | 'محفظة/انستا باي'>('نقدي');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [discountInput, setDiscountInput] = useState<string>('0');
  const [saleError, setSaleError] = useState('');

  const sellableItems = useMemo(() => items.filter((i) => i.canSellDirectly), [items]);

  const filteredItems = useMemo(() => {
    return sellableItems.filter((i) => {
      if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
      if (
        searchQuery.trim() &&
        !i.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !i.code.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [sellableItems, categoryFilter, searchQuery]);

  const [cart, setCart] = useState<
    {
      item: InventoryItem;
      qtyInBaseUnit: number;
      weightLabel: string;
      customUnitPrice: number;
    }[]
  >([]);

  const addToCart = (item: InventoryItem, presetKgOrCount?: number, label?: string) => {
    const defaultPrice = saleMode === 'wholesale' ? item.wholesalePrice : item.retailPrice;
    const qtyToAdd = presetKgOrCount ?? (item.baseUnit === 'kg' ? (saleMode === 'wholesale' ? 5 : 0.25) : 1);
    const unitLabel =
      label ??
      (item.baseUnit === 'kg'
        ? qtyToAdd === 0.125
          ? 'ثمن كيلو (125 جم)'
          : qtyToAdd === 0.25
            ? 'ربع كيلو (250 جم)'
            : qtyToAdd === 0.5
              ? 'نصف كيلو (500 جم)'
              : `${qtyToAdd} كجم`
        : item.category === 'drink_recipe'
          ? 'كوب'
          : displayUnit(item.baseUnit));

    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        const nextQty = Number((existing.qtyInBaseUnit + qtyToAdd).toFixed(3));
        return prev.map((c) =>
          c.item.id === item.id
            ? {
                ...c,
                qtyInBaseUnit: nextQty,
                weightLabel:
                  item.baseUnit === 'kg'
                    ? `${nextQty} كجم (${Math.round(nextQty * 1000)} جم)`
                    : `${nextQty} ${unitLabel}`,
              }
            : c,
        );
      }
      return [
        ...prev,
        {
          item,
          qtyInBaseUnit: qtyToAdd,
          weightLabel: unitLabel,
          customUnitPrice: defaultPrice,
        },
      ];
    });
  };

  const handleModeSwitch = (mode: 'wholesale' | 'retail') => {
    setSaleMode(mode);
    setCart((prev) =>
      prev.map((c) => ({
        ...c,
        customUnitPrice: mode === 'wholesale' ? c.item.wholesalePrice : c.item.retailPrice,
      })),
    );
    if (mode === 'retail') {
      setSelectedCustomerId('cust-cash');
      setPaymentMethod('نقدي');
    } else if (customers[0]) {
      setSelectedCustomerId(customers[0].id);
    }
  };

  const subtotal = useMemo(
    () => sumMoney(cart.map(c => multiplyMoney(c.qtyInBaseUnit, c.customUnitPrice))),
    [cart],
  );

  const discount = Math.min(Math.max(0, parseFloat(discountInput) || 0), subtotal);
  const totalAmount = Math.max(0, subtotal - discount);

  const handleCompleteSale = () => {
    if (cart.length === 0) return;
    setSaleError('');
    const enteredDiscount = Number(discountInput);
    const enteredPaid = Number(paidAmountInput);
    if (!discountInput.trim() || !Number.isFinite(enteredDiscount) || enteredDiscount < 0 || enteredDiscount > subtotal) {
      setSaleError(`أدخل خصمًا صحيحًا بين صفر و${subtotal.toFixed(2)} ج.م`);
      return;
    }
    if (paymentMethod === 'آجل' && (!Number.isFinite(enteredPaid) || enteredPaid < 0 || enteredPaid > totalAmount)) {
      setSaleError(`أدخل مدفوعًا بين صفر و${totalAmount.toFixed(2)} ج.م`);
      return;
    }
    const customer = saleMode === 'wholesale' ? customers.find((c) => c.id === selectedCustomerId) : undefined;
    if (saleMode === 'wholesale' && !customer) {
      setSaleError('اختر عميل الجملة قبل حفظ الفاتورة');
      return;
    }

    const invoiceItems: SalesInvoiceItem[] = cart.map((c) => {
      const linePrice = multiplyMoney(c.qtyInBaseUnit, c.customUnitPrice);
      const lineCost = multiplyMoney(c.qtyInBaseUnit, c.item.costPrice);
      const deductionNote =
        c.item.category === 'drink_recipe' && c.item.recipe
          ? `فك وصفة المشروب وخصم: ${c.item.recipe
              .map((r) => `${r.quantity * c.qtyInBaseUnit} ${displayUnit(r.unit)} ${r.ingredientName.split('(')[0]}`)
              .join(' + ')}`
          : `خصم مباشر: ${c.qtyInBaseUnit} ${displayUnit(c.item.baseUnit)} من المخزن`;

      return {
        itemId: c.item.id,
        itemName: c.item.name,
        category: c.item.category,
        quantity: c.qtyInBaseUnit,
        unitLabel: c.weightLabel,
        normalizedQtyInBaseUnit: c.qtyInBaseUnit,
        unitPrice: c.customUnitPrice,
        unitCost: c.item.costPrice,
        totalPrice: linePrice,
        totalCost: lineCost,
        profit: sumMoney([linePrice, -lineCost]),
        deductionDetails: deductionNote,
      };
    });

    const totalCost = invoiceItems.reduce((s, i) => s + i.totalCost, 0);
    const netProfit = sumMoney([totalAmount, -totalCost]);
    const paid =
      paymentMethod === 'نقدي' || paymentMethod === 'محفظة/انستا باي'
        ? totalAmount
        : Math.min(totalAmount, Math.max(0, parseFloat(paidAmountInput) || 0));

    onSaveSale({
      date: businessDate(),
      saleType: saleMode,
      customerId: customer?.id,
      customerName: saleMode === 'retail' ? 'عميل نقدي (مبيعات المحل)' : customer?.name || 'عميل جملة',
      items: invoiceItems,
      subtotal,
      discount,
      totalAmount,
      totalCost,
      netProfit,
      paidAmount: paid,
      remainingAmount: sumMoney([totalAmount, -paid]),
      paymentMethod,
      partnerName: currentPartnerName,
    });
  };

  return (
    <div className="operation-screen min-h-screen bg-surface-page text-ink-strong pb-6">
      <OperationHeader
        title={saleMode === 'wholesale' ? 'فاتورة بيع جملة (بُن العجوز)' : 'نقطة بيع المحل (قطاعي ومشروبات)'}
        description="اختيار الأصناف ومراجعة الفاتورة قبل الاعتماد."
        icon={HeaderReceiptText}
        onBack={onBack}
      >
        <button type="button" onClick={onNavigateToCashierSync} title="استيراد شيت إكسيل الكاشير">
          <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
          <span>شيت الكاشير</span>
        </button>
      </OperationHeader>

      <div className="record-workspace space-y-4">
        {saleError && (
          <p role="alert" className="text-status-danger bg-status-danger-bg border border-status-danger-line rounded-md p-3 font-bold">
            {saleError}
          </p>
        )}

        {/* التبديل بين بيع الجملة وبيع المحل */}
        <div className="record-tabs">
          <button
            type="button"
            aria-pressed={saleMode === 'wholesale'}
            onClick={() => handleModeSwitch('wholesale')}
            className="inline-flex items-center justify-center gap-1.5"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>بيع جملة</span>
          </button>
          <button
            type="button"
            aria-pressed={saleMode === 'retail'}
            onClick={() => handleModeSwitch('retail')}
            className="inline-flex items-center justify-center gap-1.5"
          >
            <Coffee className="w-4 h-4" aria-hidden="true" />
            <span>بيع المحل</span>
          </button>
        </div>

        {/* اختيار عميل الجملة */}
        {saleMode === 'wholesale' && (
          <div className="operation-surface flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gold-tint border border-gold-edge text-gold flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" aria-hidden="true" />
            </div>
            <label className="flex-1 min-w-0 text-xs font-bold text-ink-default">
              عميل الجملة (كافيه / ماركت / تاجر)
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="operation-input"
              >
                {customers
                  .filter((c) => c.id !== 'cust-cash')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type}) — عليه: {c.balance} ج.م
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}

        {/* فلاتر الأقسام السريعة */}
        <div className="filter-pills">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'manufactured_blend', label: 'توليفات بُن العجوز' },
            { id: 'raw_bean', label: 'حبوب بن محمصة' },
            { id: 'drink_recipe', label: 'مشروبات ساخنة' },
            { id: 'direct_product', label: 'مياه ومعلبات' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={categoryFilter === cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className="filter-pill"
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* البحث */}
        <div className="picker-search">
          <Search className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن توليفة أو بن أو مشروب..."
            aria-label="ابحث عن صنف للبيع"
            className="min-h-[44px] w-full text-sm font-bold text-ink-strong"
          />
        </div>

        {/* شبكة الأصناف */}
        {!filteredItems.length ? (
          <EmptyState icon={Coffee} title="لا توجد أصناف مطابقة" description="غيّر الفئة المختارة أو عبارة البحث." />
        ) : (
          <div className="record-grid">
            {filteredItems.map((item) => {
              const activePrice = saleMode === 'wholesale' ? item.wholesalePrice : item.retailPrice;
              const isKg = item.baseUnit === 'kg';

              return (
                <article key={item.id} className="record-card flex flex-col justify-between gap-3">
                  <div className="record-heading mb-0">
                    <div>
                      <h2>{item.name}</h2>
                      <p>
                        {item.category === 'drink_recipe'
                          ? 'يحضر بالوصفة ويخصم الخامات تلقائيًا'
                          : `الرصيد المتاح: ${item.stock} ${displayUnit(item.baseUnit)}`}
                      </p>
                    </div>
                    <span className="record-badge [font-variant-numeric:tabular-nums]">
                      {activePrice} ج.م/{isKg ? 'كجم' : 'وحدة'}
                    </span>
                  </div>

                  {isKg ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => addToCart(item, 0.125, 'ثمن كيلو (125 جم)')}
                        className="action-button text-xs"
                      >
                        + ثمن
                      </button>
                      <button
                        type="button"
                        onClick={() => addToCart(item, 0.25, 'ربع كيلو (250 جم)')}
                        className="action-button text-xs"
                      >
                        + ربع
                      </button>
                      <button
                        type="button"
                        onClick={() => addToCart(item, 0.5, 'نصف كيلو (500 جم)')}
                        className="action-button text-xs"
                      >
                        + نصف
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addToCart(
                            item,
                            saleMode === 'wholesale' ? 5 : 1,
                            saleMode === 'wholesale' ? '5 كجم جملة' : '1 كيلو',
                          )
                        }
                        className="operation-primary text-xs"
                      >
                        + {saleMode === 'wholesale' ? '5 كجم' : '1 كجم'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => addToCart(item, 1)} className="operation-primary w-full text-xs">
                      + إضافة للفاتورة ({activePrice} ج.م)
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* سلة الفاتورة الحالية */}
        {cart.length > 0 && (
          <section className="operation-surface space-y-3.5" aria-label="أصناف الفاتورة">
            <div className="flex items-center justify-between border-b border-line-subtle pb-2.5">
              <span className="text-sm font-extrabold text-ink-strong">أصناف الفاتورة ({cart.length})</span>
              <span className="text-xs font-extrabold text-status-ok [font-variant-numeric:tabular-nums]">
                الربح المتوقع: +
                {cart.reduce((s, c) => s + c.qtyInBaseUnit * (c.customUnitPrice - c.item.costPrice), 0).toFixed(1)} ج.م
              </span>
            </div>

            <div className="space-y-2.5">
              {cart.map((c) => (
                <div key={c.item.id} className="p-3 rounded-md bg-surface-sunken border border-line space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-ink-strong">{c.item.name}</span>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((x) => x.item.id !== c.item.id))}
                      className="action-button min-h-[44px] min-w-[44px] border-status-danger-line bg-status-danger-bg text-status-danger"
                      aria-label={`حذف ${c.item.name} من السلة`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-ink-default font-bold">
                      <span>الكمية ({displayUnit(c.item.baseUnit)}):</span>
                      <input
                        type="number"
                        step="0.125"
                        value={c.qtyInBaseUnit}
                        onChange={(e) => {
                          const val = Math.max(0.05, parseFloat(e.target.value) || 0.125);
                          setCart((prev) =>
                            prev.map((x) =>
                              x.item.id === c.item.id
                                ? {
                                    ...x,
                                    qtyInBaseUnit: val,
                                    weightLabel:
                                      c.item.baseUnit === 'kg'
                                        ? `${val} كجم (${Math.round(val * 1000)} جم)`
                                        : `${val} وحدة`,
                                  }
                                : x,
                            ),
                          );
                        }}
                        className="w-20 min-h-[44px] border border-line-control rounded-sm px-2 py-1 text-xs font-extrabold text-center bg-surface-control"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-ink-default font-bold">
                      <span>السعر:</span>
                      <input
                        type="number"
                        value={c.customUnitPrice}
                        onChange={(e) => {
                          const p = Math.max(0, parseFloat(e.target.value) || 0);
                          setCart((prev) => prev.map((x) => (x.item.id === c.item.id ? { ...x, customUnitPrice: p } : x)));
                        }}
                        className="w-20 min-h-[44px] border border-line-control rounded-sm px-2 py-1 text-xs font-extrabold text-center bg-surface-control"
                      />
                    </label>
                    <div className="text-sm font-extrabold text-gold [font-variant-numeric:tabular-nums]">
                      {multiplyMoney(c.qtyInBaseUnit, c.customUnitPrice).toFixed(2)} ج.م
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="operation-fields pt-2 border-t border-line-subtle">
              <label>
                خصم خاص على الفاتورة (ج.م)
                <input
                  type="number"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="operation-input"
                />
              </label>
              <label>
                طريقة الدفع
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'نقدي' | 'آجل' | 'محفظة/انستا باي')}
                  className="operation-input"
                >
                  <option value="نقدي">نقدي (كاش)</option>
                  {saleMode === 'wholesale' && <option value="آجل">آجل (على حساب العميل)</option>}
                  <option value="محفظة/انستا باي">محفظة / إنستا باي</option>
                </select>
              </label>
            </div>

            {paymentMethod === 'آجل' && (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-status-warn-bg p-3 rounded-md border border-status-warn-line">
                <label className="text-xs font-bold text-status-warn">
                  المبلغ المدفوع تحت الحساب الآن:
                  <input
                    type="number"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="operation-input w-32 text-center"
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {/* شريط الحفظ الموحد */}
        <footer className="action-bar rounded-lg p-3 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleCompleteSale}
            disabled={cart.length === 0}
            className="operation-primary flex-2 min-w-[200px]"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>حفظ الفاتورة ({totalAmount.toLocaleString('ar-EG')} ج.م)</span>
          </button>
          <button type="button" onClick={onBack} className="action-button flex-1 min-w-[100px]">
            إلغاء
          </button>
        </footer>
      </div>
    </div>
  );
};

// ============================================================================
// شاشة مزامنة واستيراد شيت إكسيل كاشير المحل (CashierSyncScreen)
// ============================================================================
interface CashierSyncScreenProps {
  items: InventoryItem[];
  onImportCashierRows: (rows: ParsedCashierRow[], sourceFileName: string, saleDate?: string) => Promise<boolean>;
  onBack: () => void;
}

export const CashierSyncScreen: React.FC<CashierSyncScreenProps> = ({
  items,
  onImportCashierRows,
  onBack,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedCashierRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [saleDate, setSaleDate] = useState(businessDate());
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string>('');
  const [syncMsgKind, setSyncMsgKind] = useState<'success' | 'error'>('success');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsedRows([]);
    try {
      const buffer = await file.arrayBuffer();
      const rows = await parseCashierExcelBuffer(buffer, items);
      setParsedRows(rows);
      setSyncSuccessMsg('');
    } catch (error) {
      setSyncSuccessMsg((error as Error).message);
      setSyncMsgKind('error');
    }
    e.target.value = '';
  };

  const [importing, setImporting] = useState(false);
  const handleConfirmImport = async () => {
    if (!parsedRows.length || importing) return;
    setImporting(true);
    try {
      if (await onImportCashierRows(parsedRows, fileName || 'cashier_sheet.xlsx', saleDate)) {
        setSyncSuccessMsg('تم حفظ المبيعات على السحابة وخصم المخزون.');
        setSyncMsgKind('success');
        setParsedRows([]);
      }
    } catch (error) {
      setSyncSuccessMsg((error as Error).message);
      setSyncMsgKind('error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="operation-screen min-h-screen bg-surface-page text-ink-strong pb-10">
      <OperationHeader
        title="ربط ومزامنة شيت كاشير المحل"
        description="خصم تلقائي للمنتجات المباشرة وتوليفات البن ووصفات المشروبات"
        icon={HeaderFolderSync}
        onBack={onBack}
      >
        <button type="button" onClick={downloadSampleCashierExcel} title="تحميل نموذج إكسيل الكاشير">
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>قالب Excel</span>
        </button>
      </OperationHeader>

      <div className="record-workspace space-y-4">
        <label className="block text-sm font-bold text-ink">
          تاريخ مبيعات الملف
          <input
            aria-label="تاريخ مبيعات الملف"
            type="date"
            required
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className="operation-input max-w-xs"
          />
        </label>

        {/* كارت حالة الربط الأوتوماتيكي للفولدر */}
        <div className="summary-banner-dark space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-gold-highlight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-status-ok" aria-hidden="true" />
              أداة مراقبة فولدر الكاشير التلقائية (Cashier Watcher)
            </span>
            <span className="text-xs bg-white/10 text-gold-soft px-2.5 py-0.5 rounded-full">Supabase Realtime</span>
          </div>
          <p className="text-xs text-ink-on-dark leading-relaxed">
            على جهاز كاشير المحل، شغّل ملف{' '}
            <code className="bg-black/40 text-gold-highlight px-1.5 py-0.5 rounded">
              cashier-watcher/START_CASHIER_SYNC.bat
            </code>{' '}
            ليقوم بمراقبة فولدر الكاشير، وبمجرد خروج شيت الإكسيل يرفعه تلقائيًا ويخصم الأصناف والوصفات.
          </p>
        </div>

        {syncSuccessMsg && (
          <div
            role="alert"
            className={`rounded-lg p-4 flex items-center gap-3 text-xs font-extrabold border ${
              syncMsgKind === 'success'
                ? 'bg-status-ok-bg border-status-ok-line text-status-ok'
                : 'bg-status-danger-bg border-status-danger-line text-status-danger'
            }`}
          >
            {syncMsgKind === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
            )}
            <span>{syncSuccessMsg}</span>
          </div>
        )}

        <section className="operation-surface space-y-3">
          <h2 className="text-sm font-extrabold text-ink-strong">رفع شيت مبيعات الكاشير:</h2>
          <label className="border-2 border-dashed border-line-control bg-surface-sunken hover:bg-surface-raised rounded-lg p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition min-h-[96px]">
            <Upload className="w-6 h-6 text-gold" aria-hidden="true" />
            <span className="text-xs font-extrabold text-ink-strong">اختر شيت إكسيل الكاشير (.xlsx / .csv)</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="sr-only" />
          </label>
        </section>

        {parsedRows.length > 0 && (
          <section className="operation-surface space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-2.5">
              <div>
                <h2 className="text-sm font-extrabold text-ink-strong">
                  معاينة شيت الكاشير قبل الخصم ({parsedRows.length} سطر)
                </h2>
                <div className="text-xs text-ink-faint">الملف: {fileName}</div>
              </div>
              <span className="text-xs font-extrabold text-status-ok [font-variant-numeric:tabular-nums]">
                الإجمالي:{' '}
                {parsedRows.reduce((s, r) => s + (r.totalPrice || 0), 0).toLocaleString('ar-EG')} ج.م
              </span>
            </div>

            <div className="space-y-2.5">
              {parsedRows.map((row, idx) => {
                const matched = row.matchedItem;
                const isDrink = matched?.category === 'drink_recipe';
                const qtyInBase = ['gram', 'ml'].includes(row.unitHint) ? row.quantity / 1000 : row.quantity;

                return (
                  <div key={idx} className="p-3 rounded-md bg-surface-sunken border border-line space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-ink-strong">{row.rawName}</span>
                      <span className="text-xs font-extrabold text-gold [font-variant-numeric:tabular-nums]">
                        {row.quantity} {displayUnit(row.unitHint)}
                      </span>
                    </div>

                    {row.error && (
                      <div role="alert" className="text-xs text-status-danger font-bold">
                        {row.error}
                      </div>
                    )}
                    {matched && !row.error ? (
                      <div className="text-xs bg-surface-card p-2.5 rounded-sm border border-line-subtle space-y-1">
                        <div className="text-status-ok font-bold">مطابق لـ: {matched.name}</div>
                        {isDrink && matched.recipe ? (
                          <div className="text-status-warn font-semibold">
                            منتج له وصفة مشروب — سيخصم من المخزون:{' '}
                            {matched.recipe
                              .map((ing) => `${ing.quantity * qtyInBase} ${displayUnit(ing.unit)} (${ing.ingredientName.split('(')[0]})`)
                              .join(' + ')}
                          </div>
                        ) : (
                          <div className="text-status-info font-semibold">
                            منتج / توليفة جاهزة — سيخصم مباشرة: {qtyInBase} {displayUnit(matched.baseUnit)} من رصيد الصنف
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-status-danger font-bold">لم يتم العثور على صنف مطابق تلقائيًا</div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!saleDate || importing || parsedRows.some((r) => Boolean(r.error) || !r.matchedItem)}
              className="operation-primary w-full"
            >
              <Check className="w-5 h-5" aria-hidden="true" />
              <span>اعتماد مبيعات الكاشير وخصم المخزون والوصفات الآن</span>
            </button>
          </section>
        )}
      </div>
    </div>
  );
};
