import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ShoppingBag,
  Users,
  Search,
  Plus,
  Minus,
  Trash2,
  Check,
  FileSpreadsheet,
  Upload,
  Download,
  Sparkles,
  CheckCircle2,
  FolderSync,
  Coffee,
  Scale,
} from 'lucide-react';
import {
  InventoryItem,
  Customer,
  SalesInvoice,
  SalesInvoiceItem,
} from '../types/erp';
import {
  parseCashierExcelBuffer,
  downloadSampleCashierExcel,
  ParsedCashierRow,
} from '../lib/cashierExcelParser';

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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id || ''
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'نقدي' | 'آجل' | 'محفظة/انستا باي'
  >('نقدي');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [discountInput, setDiscountInput] = useState<string>('0');

  const sellableItems = useMemo(
    () => items.filter((i) => i.canSellDirectly),
    [items]
  );

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
      qtyInBaseUnit: number; // بالكيلو للبن أو بالقطعة/الكوب للمشروبات
      weightLabel: string;
      customUnitPrice: number;
    }[]
  >([]);

  const addToCart = (
    item: InventoryItem,
    presetKgOrCount?: number,
    label?: string
  ) => {
    const defaultPrice =
      saleMode === 'wholesale' ? item.wholesalePrice : item.retailPrice;
    const qtyToAdd =
      presetKgOrCount ?? (item.baseUnit === 'kg' ? (saleMode === 'wholesale' ? 5 : 0.25) : 1);
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
        : 'قطعة');

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
            : c
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
        customUnitPrice:
          mode === 'wholesale' ? c.item.wholesalePrice : c.item.retailPrice,
      }))
    );
    if (mode === 'retail') {
      setSelectedCustomerId('cust-cash');
      setPaymentMethod('نقدي');
    } else if (customers[0]) {
      setSelectedCustomerId(customers[0].id);
    }
  };

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, c) =>
          sum + Number((c.qtyInBaseUnit * c.customUnitPrice).toFixed(2)),
        0
      ),
    [cart]
  );

  const discount = parseFloat(discountInput) || 0;
  const totalAmount = Math.max(0, subtotal - discount);

  const handleCompleteSale = () => {
    if (cart.length === 0) return;
    const customer =
      customers.find((c) => c.id === selectedCustomerId) || customers[0];

    const invoiceItems: SalesInvoiceItem[] = cart.map((c) => {
      const linePrice = Number((c.qtyInBaseUnit * c.customUnitPrice).toFixed(2));
      const lineCost = Number((c.qtyInBaseUnit * c.item.costPrice).toFixed(2));
      const deductionNote =
        c.item.category === 'drink_recipe' && c.item.recipe
          ? `فك وصفة المشروب وخصم: ${c.item.recipe
              .map(
                (r) =>
                  `${r.quantity * c.qtyInBaseUnit} ${
                    r.unit === 'gram' ? 'جم' : r.unit === 'ml' ? 'مل' : 'قطعة'
                  } ${r.ingredientName.split('(')[0]}`
              )
              .join(' + ')}`
          : `خصم مباشر: ${c.qtyInBaseUnit} ${
              c.item.baseUnit === 'kg' ? 'كجم' : 'قطعة'
            } من المخزن`;

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
        profit: Number((linePrice - lineCost).toFixed(2)),
        deductionDetails: deductionNote,
      };
    });

    const totalCost = invoiceItems.reduce((s, i) => s + i.totalCost, 0);
    const netProfit = Number((totalAmount - totalCost).toFixed(2));
    const paid =
      paymentMethod === 'نقدي' || paymentMethod === 'محفظة/انستا باي'
        ? totalAmount
        : Math.min(totalAmount, parseFloat(paidAmountInput) || 0);

    onSaveSale({
      date: new Date().toISOString().slice(0, 10),
      saleType: saleMode,
      customerId: customer?.id,
      customerName:
        saleMode === 'retail'
          ? 'عميل نقدي (مبيعات المحل)'
          : customer?.name || 'عميل جملة',
      items: invoiceItems,
      subtotal,
      discount,
      totalAmount,
      totalCost,
      netProfit,
      paidAmount: paid,
      remainingAmount: Number((totalAmount - paid).toFixed(2)),
      paymentMethod,
      partnerName: currentPartnerName,
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-36">
      {/* الهيدر */}
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <div className="text-center">
          <h1 className="text-base font-extrabold">
            {saleMode === 'wholesale'
              ? 'فاتورة بيع جملة (بُن العجوز)'
              : 'نقطة بيع المحل (قطاعي ومشروبات)'}
          </h1>
        </div>
        <button
          onClick={onNavigateToCashierSync}
          className="bg-gradient-to-l from-[#D4AF37] to-[#B38728] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
          title="استيراد شيت إكسيل الكاشير"
        >
          <FileSpreadsheet className="w-4 h-4" />
          شيت الكاشير
        </button>
      </div>

      <div className="p-3.5 space-y-3.5">
        {/* التبديل بين بيع الجملة وبيع المحل */}
        <div className="bg-white p-1.5 rounded-2xl border border-[#E6DEC8] grid grid-cols-2 gap-1.5 shadow-sm">
          <button
            onClick={() => handleModeSwitch('wholesale')}
            className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
              saleMode === 'wholesale'
                ? 'bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] shadow'
                : 'text-[#5C4B3E] hover:bg-[#FAF8F4]'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-[#D4AF37]" />
            بيع جملة
          </button>
          <button
            onClick={() => handleModeSwitch('retail')}
            className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
              saleMode === 'retail'
                ? 'bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] shadow'
                : 'text-[#5C4B3E] hover:bg-[#FAF8F4]'
            }`}
          >
            <Coffee className="w-4 h-4 text-[#D4AF37]" />
            بيع المحل
          </button>
        </div>

        {/* اختيار عميل الجملة */}
        {saleMode === 'wholesale' && (
          <div className="bg-white rounded-2xl border border-blue-200 p-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-slate-400 font-bold">
                عميل الجملة (كافيه / ماركت / تاجر)
              </div>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full text-sm font-extrabold text-slate-900 bg-transparent focus:outline-none"
              >
                {customers
                  .filter((c) => c.id !== 'cust-cash')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type}) — عليه: {c.balance} ج.م
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {/* فلاتر الأقسام السريعة */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'manufactured_blend', label: '☕ توليفات بُن العجوز' },
            { id: 'raw_bean', label: '🫘 حبوب بن محمصة' },
            { id: 'drink_recipe', label: '🥤 مشروبات ساخنة' },
            { id: 'direct_product', label: '💧 مياه ومعلبات' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold shrink-0 border transition ${
                categoryFilter === cat.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* البحث */}
        <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2 flex items-center gap-2 shadow-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن توليفة أو بن أو مشروب..."
            className="w-full text-xs font-bold bg-transparent focus:outline-none"
          />
        </div>

        {/* شبكة الأصناف السريعة للإضافة (مع أزرار ثمن / ربع / نصف / كيلو للبن) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filteredItems.map((item) => {
            const activePrice =
              saleMode === 'wholesale' ? item.wholesalePrice : item.retailPrice;
            const isKg = item.baseUnit === 'kg';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-slate-900">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {item.category === 'drink_recipe'
                        ? 'يحضر بالوصفة ويخصم الخامات تلقائياً'
                        : `الرصيد المتاح: ${item.stock} ${isKg ? 'كجم' : 'قطعة'}`}
                    </div>
                  </div>
                  <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg shrink-0">
                    {activePrice} ج.م/{isKg ? 'كجم' : 'وحدة'}
                  </span>
                </div>

                {isKg ? (
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    <button
                      onClick={() => addToCart(item, 0.125, 'ثمن كيلو (125 جم)')}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg py-1 text-[11px] font-extrabold"
                    >
                      + ثمن
                    </button>
                    <button
                      onClick={() => addToCart(item, 0.25, 'ربع كيلو (250 جم)')}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg py-1 text-[11px] font-extrabold"
                    >
                      + ربع
                    </button>
                    <button
                      onClick={() => addToCart(item, 0.5, 'نصف كيلو (500 جم)')}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg py-1 text-[11px] font-extrabold"
                    >
                      + نصف
                    </button>
                    <button
                      onClick={() =>
                        addToCart(
                          item,
                          saleMode === 'wholesale' ? 5 : 1,
                          saleMode === 'wholesale' ? '5 كجم جملة' : '1 كيلو'
                        )
                      }
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-1 text-[11px] font-extrabold"
                    >
                      + {saleMode === 'wholesale' ? '5 كجم' : '1 كجم'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addToCart(item, 1)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-1.5 text-xs font-extrabold"
                  >
                    + إضافة للفاتورة ({activePrice} ج.م)
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* سلة الفاتورة الحالية */}
        {cart.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-md border-2 border-blue-600/20 space-y-3.5">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm font-extrabold text-slate-900">
                أصناف الفاتورة ({cart.length})
              </span>
              <span className="text-xs font-black text-emerald-700">
                الربح المتوقع: +
                {cart
                  .reduce(
                    (s, c) =>
                      s +
                      c.qtyInBaseUnit * (c.customUnitPrice - c.item.costPrice),
                    0
                  )
                  .toFixed(1)}{' '}
                ج.م
              </span>
            </div>

            <div className="space-y-2.5">
              {cart.map((c) => (
                <div
                  key={c.item.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">
                      {c.item.name}
                    </span>
                    <button
                      onClick={() =>
                        setCart((prev) =>
                          prev.filter((x) => x.item.id !== c.item.id)
                        )
                      }
                      className="text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">
                        الكمية ({c.item.baseUnit === 'kg' ? 'كجم' : 'عدد'}):
                      </span>
                      <input
                        type="number"
                        step="0.125"
                        value={c.qtyInBaseUnit}
                        onChange={(e) => {
                          const val = Math.max(
                            0.05,
                            parseFloat(e.target.value) || 0.125
                          );
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
                                : x
                            )
                          );
                        }}
                        className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-extrabold text-center bg-white"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-500">السعر:</span>
                      <input
                        type="number"
                        value={c.customUnitPrice}
                        onChange={(e) => {
                          const p = Math.max(0, parseFloat(e.target.value) || 0);
                          setCart((prev) =>
                            prev.map((x) =>
                              x.item.id === c.item.id
                                ? { ...x, customUnitPrice: p }
                                : x
                            )
                          );
                        }}
                        className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-extrabold text-center bg-white"
                      />
                    </div>
                    <div className="text-xs font-black text-blue-800">
                      {(c.qtyInBaseUnit * c.customUnitPrice).toFixed(2)} ج.م
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* الخصم وطريقة التحصيل */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  خصم خاص على الفاتورة (ج.م)
                </label>
                <input
                  type="number"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  طريقة الدفع
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(
                      e.target.value as 'نقدي' | 'آجل' | 'محفظة/انستا باي'
                    )
                  }
                  className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold bg-white"
                >
                  <option value="نقدي">نقدي (كاش)</option>
                  <option value="آجل">آجل (على حساب العميل)</option>
                  <option value="محفظة/انستا باي">محفظة / إنستا باي</option>
                </select>
              </div>
            </div>

            {paymentMethod === 'آجل' && (
              <div className="flex items-center justify-between bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                <span className="text-xs font-bold text-amber-900">
                  المبلغ المدفوع تحت الحساب الآن:
                </span>
                <input
                  type="number"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="w-28 border border-amber-300 rounded-lg px-2 py-1 text-xs font-bold text-center bg-white"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* شريط الحفظ السفلي فوق شريط القوائم المثبت */}
      <div className="fixed bottom-[58px] left-0 right-0 bg-white border-t border-[#E6DEC8] p-3 flex items-center gap-2.5 z-30 max-w-[445px] mx-auto shadow-md">
        <button
          onClick={handleCompleteSale}
          disabled={cart.length === 0}
          className="flex-[2] bg-[#1E1612] hover:bg-[#2E221A] disabled:opacity-50 text-[#FBF5B7] border border-[#C59B27] font-extrabold py-3 rounded-xl shadow-md flex items-center justify-center gap-2 text-xs"
        >
          <Check className="w-4 h-4 text-[#D4AF37]" />
          <span>
            حفظ الفاتورة ({totalAmount.toLocaleString('ar-EG')} ج.م)
          </span>
        </button>
        <button
          onClick={onBack}
          className="flex-1 border border-[#DFD7C6] text-[#5C4B3E] font-bold py-3 rounded-xl text-xs"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// شاشة مزامنة واستيراد شيت إكسيل كاشير المحل (CashierSyncScreen)
// ============================================================================
interface CashierSyncScreenProps {
  items: InventoryItem[];
  onImportCashierRows: (
    rows: ParsedCashierRow[],
    sourceFileName: string
  ) => void;
  onBack: () => void;
}

export const CashierSyncScreen: React.FC<CashierSyncScreenProps> = ({
  items,
  onImportCashierRows,
  onBack,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedCashierRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string>('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const rows = parseCashierExcelBuffer(buffer, items);
    setParsedRows(rows);
    setSyncSuccessMsg('');
  };

  // محاكاة سريعة لشيت خارج من كاشير المحل ليوم كامل بضغطة زر
  const handleSimulateCashierSheet = () => {
    setFileName(`cashier_auto_sync_${new Date().toISOString().slice(0, 10)}.xlsx`);
    const mahoug = items.find((i) => i.id === 'blend-mahoug-special');
    const sada = items.find((i) => i.id === 'blend-sada-light');
    const turkishDbl = items.find((i) => i.id === 'drink-turkish-double');
    const french = items.find((i) => i.id === 'drink-french-coffee');
    const espresso = items.find((i) => i.id === 'drink-espresso-double');
    const water = items.find((i) => i.id === 'direct-water-small');

    setParsedRows([
      {
        rawName: 'توليفة بُن العجوز تركي محوج مخصوص (أوزان كاشير)',
        rawCode: 'BL-302',
        quantity: 4.25,
        unitHint: 'kg',
        totalPrice: 2550,
        matchedItem: mahoug,
      },
      {
        rawName: 'ربع بن تركي سادة فاتح (12 عبوة × 250 جم)',
        rawCode: 'BL-301',
        quantity: 3000,
        unitHint: 'gram',
        totalPrice: 1620,
        matchedItem: sada,
      },
      {
        rawName: 'فنجان قهوة تركي دبل',
        rawCode: 'DR-402',
        quantity: 28,
        unitHint: 'piece',
        totalPrice: 980,
        matchedItem: turkishDbl,
      },
      {
        rawName: 'قهوة فرنساوي بالحليب',
        rawCode: 'DR-403',
        quantity: 15,
        unitHint: 'piece',
        totalPrice: 675,
        matchedItem: french,
      },
      {
        rawName: 'إسبريسو دبل شوت إيطالي',
        rawCode: 'DR-404',
        quantity: 12,
        unitHint: 'piece',
        totalPrice: 480,
        matchedItem: espresso,
      },
      {
        rawName: 'زجاجة مياه معدنية صغيرة',
        rawCode: 'PR-501',
        quantity: 20,
        unitHint: 'piece',
        totalPrice: 160,
        matchedItem: water,
      },
    ]);
    setSyncSuccessMsg('');
  };

  const handleConfirmImport = () => {
    if (parsedRows.length === 0) return;
    onImportCashierRows(parsedRows, fileName || 'cashier_sheet.xlsx');
    setSyncSuccessMsg(
      'تم استيراد مبيعات الكاشير وخصم التوليفات (بالكيلو والجرام) وفك وصفات المشروبات وخصم خاماتها بنجاح!'
    );
    setParsedRows([]);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-4 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <div className="text-center">
          <h1 className="text-base font-extrabold flex items-center justify-center gap-1.5">
            <FolderSync className="w-5 h-5 text-[#D4AF37]" />
            ربط ومزامنة شيت كاشير المحل
          </h1>
          <p className="text-[11px] text-[#D4AF37]">
            خصم تلقائي للمنتجات المباشرة وتوليفات البن ووصفات المشروبات
          </p>
        </div>
        <button
          onClick={downloadSampleCashierExcel}
          className="bg-[#C59B27] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1"
          title="تحميل نموذج إكسيل الكاشير"
        >
          <Download className="w-4 h-4" />
          قالب Excel
        </button>
      </div>

      <div className="p-3.5 space-y-4">
        {/* كارت حالة الربط الأوتوماتيكي للفولدر */}
        <div className="bg-slate-900 text-white rounded-3xl p-4 shadow-lg space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              أداة مراقبة فولدر الكاشير التلقائية (Cashier Watcher)
            </span>
            <span className="text-[10px] bg-white/10 px-2.5 py-0.5 rounded-full">
              Supabase Realtime
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            على جهاز كاشير المحل، شغّل ملف{' '}
            <code className="bg-black/40 text-amber-300 px-1.5 py-0.5 rounded">
              cashier-watcher/START_CASHIER_SYNC.bat
            </code>{' '}
            ليقوم بمراقبة فولدر الكاشير، وبمجرد خروج شيت الإكسيل يرفعه تلقائياً ويخصم
            الأصناف والوصفات!
          </p>
        </div>

        {syncSuccessMsg && (
          <div className="bg-emerald-50 border-2 border-emerald-400 text-emerald-900 rounded-2xl p-4 flex items-center gap-3 text-xs font-extrabold">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}

        {/* رفع ملف إكسيل أو تجربة فورية */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="text-sm font-extrabold text-slate-800">
            رفع شيت مبيعات الكاشير يدوياً أو محاكاة فورية:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="border-2 border-dashed border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 rounded-2xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition">
              <Upload className="w-6 h-6 text-emerald-700" />
              <span className="text-xs font-extrabold text-emerald-900">
                اختر شيت إكسيل الكاشير (.xlsx / .csv)
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              onClick={handleSimulateCashierSheet}
              className="border-2 border-amber-400 bg-amber-50/70 hover:bg-amber-100/70 rounded-2xl p-4 flex flex-col items-center justify-center gap-1.5 transition"
            >
              <Sparkles className="w-6 h-6 text-amber-800" />
              <span className="text-xs font-extrabold text-amber-950">
                محاكاة وصول شيت كاشير اليوم أوتوماتيك
              </span>
              <span className="text-[10px] text-amber-800">
                (توليفات بالكيلو/الربع + مشروبات بوصفة + مياه)
              </span>
            </button>
          </div>
        </div>

        {/* معاينة الأصناف المقروءة من الشيت وكيفية خصمها من المخزن والوصفات */}
        {parsedRows.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between border-b pb-2.5">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  معاينة شيت الكاشير قبل الخصم ({parsedRows.length} سطر)
                </div>
                <div className="text-[11px] text-slate-500">الملف: {fileName}</div>
              </div>
              <span className="text-xs font-black text-emerald-700">
                الإجمالي:{' '}
                {parsedRows
                  .reduce((s, r) => s + (r.totalPrice || 0), 0)
                  .toLocaleString('ar-EG')}{' '}
                ج.م
              </span>
            </div>

            <div className="space-y-2.5">
              {parsedRows.map((row, idx) => {
                const matched = row.matchedItem;
                const isDrink = matched?.category === 'drink_recipe';
                const qtyInBase =
                  row.unitHint === 'gram' ? row.quantity / 1000 : row.quantity;

                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900">
                        {row.rawName}
                      </span>
                      <span className="text-xs font-black text-blue-700">
                        {row.quantity}{' '}
                        {row.unitHint === 'gram'
                          ? 'جرام'
                          : row.unitHint === 'kg'
                          ? 'كجم'
                          : 'وحدة'}
                      </span>
                    </div>

                    {matched ? (
                      <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-200/80 space-y-1">
                        <div className="text-emerald-700 font-bold">
                          ✓ مطابق لـ: {matched.name}
                        </div>
                        {isDrink && matched.recipe ? (
                          <div className="text-amber-800 font-semibold">
                            ⚡ منتج له وصفة مشروب — سيخصم من المخزون:{' '}
                            {matched.recipe
                              .map(
                                (ing) =>
                                  `${ing.quantity * qtyInBase} ${
                                    ing.unit === 'gram'
                                      ? 'جم'
                                      : ing.unit === 'ml'
                                      ? 'مل'
                                      : 'قطعة'
                                  } (${ing.ingredientName.split('(')[0]})`
                              )
                              .join(' + ')}
                          </div>
                        ) : (
                          <div className="text-blue-800 font-semibold">
                            📦 منتج / توليفة جاهزة — سيخصم مباشرة: {qtyInBase}{' '}
                            {matched.baseUnit === 'kg' ? 'كجم' : 'قطعة'} من رصيد الصنف
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-red-600 font-bold">
                        ⚠️ لم يتم العثور على صنف مطابق تلقائياً
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleConfirmImport}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              <span>اعتماد مبيعات الكاشير وخصم المخزون والوصفات الآن</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
