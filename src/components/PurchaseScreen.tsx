import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  Truck,
  Search,
  AlertTriangle,
  Plus,
  Minus,
  Trash2,
  Edit3,
  Clock,
  Package,
  Tag,
  Check,
  FileText,
  Calendar,
  X,
  ShoppingBag,
  Eye,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import {
  InventoryItem,
  Supplier,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  ItemCategory,
} from '../types/erp';

interface PurchaseScreenProps {
  items: InventoryItem[];
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  currentPartnerName: string;
  onSavePurchase: (
    invoice: Omit<PurchaseInvoice, 'id' | 'invoiceNumber'>,
  ) => boolean;
  onDeletePurchaseInvoice?: (invoiceId: string) => void;
  onQuickAddSupplier?: (supplier: Omit<Supplier, 'id'>) => void;
  onQuickAddItem?: (item: Omit<InventoryItem, 'id'>) => void;
  onBack: () => void;
}

export const PurchaseScreen: React.FC<PurchaseScreenProps> = ({
  items,
  suppliers,
  purchaseInvoices,
  currentPartnerName,
  onSavePurchase,
  onDeletePurchaseInvoice,
  onQuickAddSupplier,
  onQuickAddItem,
  onBack,
}) => {
  // وضع الشاشة: 'list' (قائمة وسجل فواتير المشتريات) | 'create' (إنشاء فاتورة مشتريات جديدة)
  const [viewMode, setViewMode] = useState<'list' | 'create'>('list');

  // فلاتر سجل فواتير المشتريات
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState<
    'all' | 'نقدي' | 'آجل_أو_جزئي'
  >('all');
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] =
    useState<PurchaseInvoice | null>(null);

  // بيانات إنشاء فاتورة مشتريات جديدة
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    suppliers[0]?.id || '',
  );
  const [invoiceDate, setInvoiceDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [itemCategoryFilter, setItemCategoryFilter] = useState<
    'all' | 'raw_bean' | 'raw_spice' | 'direct_product'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showItemPickerModal, setShowItemPickerModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'نقدي' | 'آجل' | 'جزئي'>(
    'نقدي',
  );
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [compareModalItem, setCompareModalItem] =
    useState<InventoryItem | null>(null);

  // نافذة إضافة مورد جديد سريعاً من داخل الفاتورة
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupCategory, setNewSupCategory] = useState('توريد بن وخامات');

  // نافذة تعريف صنف خام جديد سريعاً من داخل الفاتورة
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCat, setNewItemCat] = useState<ItemCategory>('raw_bean');
  const [newItemCost, setNewItemCost] = useState('');
  const [newItemRetail, setNewItemRetail] = useState('');
  const [newItemWholesale, setNewItemWholesale] = useState('');

  // الأصناف القابلة للشراء
  const purchasableItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.category === 'raw_bean' ||
          i.category === 'raw_spice' ||
          i.category === 'direct_product',
      ),
    [items],
  );

  // سلة الفاتورة الجديدة (تبدأ فارغة تماماً ليختار المستخدم الأصناف بنفسه)
  const [cart, setCart] = useState<
    {
      item: InventoryItem;
      quantity: number;
      purchasePrice: number;
      newRetailPrice: string;
      updateCost: boolean;
    }[]
  >([]);

  // إحصائيات قسم المشتريات
  const purchaseStats = useMemo(() => {
    const totalPurchases = purchaseInvoices
      .filter((i) => !i.isCancelled)
      .reduce((s, inv) => s + inv.totalAmount, 0);
    const totalPaid = purchaseInvoices
      .filter((i) => !i.isCancelled)
      .reduce((s, inv) => s + inv.paidAmount, 0);
    const totalRemaining = purchaseInvoices
      .filter((i) => !i.isCancelled)
      .reduce((s, inv) => s + inv.remainingAmount, 0);
    return {
      count: purchaseInvoices.length,
      totalPurchases,
      totalPaid,
      totalRemaining,
    };
  }, [purchaseInvoices]);

  const filteredInvoices = useMemo(() => {
    return purchaseInvoices.filter((inv) => {
      if (invoiceFilter === 'نقدي' && inv.paymentMethod !== 'نقدي')
        return false;
      if (
        invoiceFilter === 'آجل_أو_جزئي' &&
        inv.paymentMethod === 'نقدي' &&
        inv.remainingAmount === 0
      )
        return false;
      if (invoiceSearch.trim()) {
        const q = invoiceSearch.toLowerCase();
        const matchNum = inv.invoiceNumber.toLowerCase().includes(q);
        const matchSup = inv.supplierName.toLowerCase().includes(q);
        const matchItem = inv.items.some((it) =>
          it.itemName.toLowerCase().includes(q),
        );
        return matchNum || matchSup || matchItem;
      }
      return true;
    });
  }, [purchaseInvoices, invoiceFilter, invoiceSearch]);

  const filteredPickerItems = useMemo(() => {
    return purchasableItems.filter((i) => {
      if (itemCategoryFilter !== 'all' && i.category !== itemCategoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          (i.barcode && i.barcode.includes(q))
        );
      }
      return true;
    });
  }, [purchasableItems, itemCategoryFilter, searchQuery]);

  const addItemToCart = (item: InventoryItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          item,
          quantity: 1,
          purchasePrice: item.lastPurchasePrice || item.costPrice,
          newRetailPrice: String(item.retailPrice),
          updateCost: true,
        },
      ];
    });
  };

  const updateCartItem = (
    itemId: string,
    patch: Partial<{
      quantity: number;
      purchasePrice: number;
      newRetailPrice: string;
      updateCost: boolean;
    }>,
  ) => {
    setCart((prev) =>
      prev.map((c) => (c.item.id === itemId ? { ...c, ...patch } : c)),
    );
  };

  const removeCartItem = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const higherThanCheapestCount = useMemo(() => {
    return cart.filter((c) => {
      const prices = c.item.supplierPrices.map((sp) => sp.price);
      const minPrice =
        prices.length > 0 ? Math.min(...prices) : c.item.lastPurchasePrice;
      return c.purchasePrice > minPrice;
    }).length;
  }, [cart]);

  const totalInvoiceAmount = useMemo(
    () =>
      cart.reduce(
        (sum, c) => sum + Number((c.quantity * c.purchasePrice).toFixed(2)),
        0,
      ),
    [cart],
  );

  const handleStartNewInvoice = () => {
    setCart([]);
    setSelectedSupplierId(suppliers[0]?.id || '');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('نقدي');
    setPaidAmountInput('');
    setSearchQuery('');
    setViewMode('create');
  };

  const handleSave = () => {
    if (cart.length === 0) return;
    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    const invoiceItems: PurchaseInvoiceItem[] = cart.map((c) => {
      const prices = c.item.supplierPrices;
      const cheapest =
        prices.length > 0
          ? prices.reduce(
              (min, p) => (p.price < min.price ? p : min),
              prices[0],
            )
          : {
              price: c.item.lastPurchasePrice,
              supplierName: supplier?.name || 'المورد الحالي',
            };

      return {
        itemId: c.item.id,
        itemName: c.item.name,
        quantity: c.quantity,
        unit:
          c.item.baseUnit === 'kg'
            ? 'كجم'
            : c.item.baseUnit === 'liter'
              ? 'لتر'
              : 'قطعة',
        purchasePrice: c.purchasePrice,
        newRetailPrice: parseFloat(c.newRetailPrice) || c.item.retailPrice,
        previousLastPrice: c.item.lastPurchasePrice,
        previousWacCost: c.item.costPrice,
        cheapestSupplierPrice: cheapest.price,
        cheapestSupplierName: cheapest.supplierName,
        updateProductCost: c.updateCost,
      };
    });

    const paid =
      paymentMethod === 'نقدي'
        ? totalInvoiceAmount
        : paymentMethod === 'آجل'
          ? 0
          : Math.min(totalInvoiceAmount, parseFloat(paidAmountInput) || 0);

    const accepted = onSavePurchase({
      date: invoiceDate,
      supplierId: selectedSupplierId,
      supplierName: supplier?.name || 'مورد عام',
      items: invoiceItems,
      totalAmount: totalInvoiceAmount,
      paidAmount: paid,
      remainingAmount: Number((totalInvoiceAmount - paid).toFixed(2)),
      paymentMethod,
      partnerName: currentPartnerName,
    });

    if (accepted === false) return;
    setCart([]);
    setViewMode('list');
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-28 flex flex-col">
      {/* هيدر قسم المشتريات */}
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={() => {
            if (viewMode === 'create') {
              setViewMode('list');
            } else {
              onBack();
            }
          }}
          className="p-1.5 rounded-xl hover:bg-white/10 transition flex items-center text-[#D4AF37]"
          title="رجوع"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        <div className="text-center">
          <h1 className="text-base font-black tracking-wide text-[#FBF5B7]">
            {viewMode === 'list'
              ? 'المشتريات وفواتير التوريد'
              : 'إنشاء فاتورة مشتريات جديدة'}
          </h1>
          <p className="text-[10px] text-[#D4AF37]">
            {viewMode === 'list'
              ? 'سجل فواتير الشراء وتوريدات الموردين'
              : 'اختر المورد والأصناف والكميات لتغذية المخزن'}
          </p>
        </div>

        {viewMode === 'list' ? (
          <button
            onClick={handleStartNewInvoice}
            className="bg-gradient-to-r from-[#C59B27] to-[#E5C158] text-[#1E1612] px-3 py-1.5 rounded-xl text-xs font-black shadow flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة جديدة</span>
          </button>
        ) : (
          <button
            onClick={() => setViewMode('list')}
            className="text-xs font-bold text-[#D4AF37] bg-white/10 px-2.5 py-1.5 rounded-xl border border-[#C59B27]/30"
          >
            الفواتير ({purchaseInvoices.length})
          </button>
        )}
      </div>

      {/* ================= الوضع الأول: شاشة قسم المشتريات الرئيسية (سجل الفواتير + زر إنشاء فاتورة) ================= */}
      {viewMode === 'list' && (
        <div className="p-3.5 space-y-4 flex-1">
          {/* كارت الملخص المالي للمشتريات + زر إنشاء فاتورة مشتريات جديدة */}
          <div className="bg-gradient-to-br from-[#1E1612] via-[#2A1F1A] to-[#17110E] rounded-3xl p-4 text-[#FAF8F4] border border-[#C59B27]/60 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#C59B27]/20 border border-[#C59B27]/50 flex items-center justify-center text-[#FBF5B7]">
                  <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-[#FBF5B7]">
                    إدارة فواتير المشتريات
                  </h2>
                  <p className="text-[10px] text-[#D4AF37]">
                    تحديث تلقائي لرصيد المخزن ومتوسط التكلفة (WAC)
                  </p>
                </div>
              </div>
              <span className="text-xs font-black bg-white/10 border border-[#C59B27]/40 text-[#FBF5B7] px-2.5 py-1 rounded-xl">
                {purchaseStats.count} فاتورة
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5">
                <div className="text-[10px] text-[#D8CBB8]">
                  إجمالي المشتريات
                </div>
                <div className="text-sm font-black text-white mt-0.5">
                  {purchaseStats.totalPurchases.toLocaleString('ar-EG')}{' '}
                  <span className="text-[9px] text-[#D4AF37]">ج.م</span>
                </div>
              </div>
              <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5">
                <div className="text-[10px] text-[#D8CBB8]">المدفوع نقداً</div>
                <div className="text-sm font-black text-emerald-400 mt-0.5">
                  {purchaseStats.totalPaid.toLocaleString('ar-EG')}{' '}
                  <span className="text-[9px]">ج.م</span>
                </div>
              </div>
              <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5">
                <div className="text-[10px] text-[#D8CBB8]">متبقي للموردين</div>
                <div className="text-sm font-black text-amber-400 mt-0.5">
                  {purchaseStats.totalRemaining.toLocaleString('ar-EG')}{' '}
                  <span className="text-[9px]">ج.م</span>
                </div>
              </div>
            </div>

            {/* الزر الرئيسي الواضح لإنشاء فاتورة مشتريات جديدة */}
            <button
              onClick={handleStartNewInvoice}
              className="w-full bg-gradient-to-l from-[#C59B27] via-[#D4AF37] to-[#B38728] hover:opacity-95 text-[#1E1612] font-black text-sm py-3.5 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-[0.99]"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>إنشاء فاتورة مشتريات جديدة</span>
            </button>
          </div>

          {/* البحث والفلترة في فواتير المشتريات */}
          <div className="space-y-2.5">
            <div className="bg-white rounded-2xl border border-[#E6DEC8] px-3.5 py-2.5 flex items-center gap-2 shadow-sm">
              <Search className="w-4 h-4 text-[#9E7918] shrink-0" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="ابحث برقم الفاتورة، اسم المورد، أو اسم الصنف..."
                className="w-full text-xs font-bold bg-transparent focus:outline-none text-[#1E1612]"
              />
              {invoiceSearch && (
                <button
                  onClick={() => setInvoiceSearch('')}
                  className="text-[#8C7A6B]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'all',
                  label: `كل الفواتير (${purchaseInvoices.length})`,
                },
                { id: 'نقدي', label: 'فواتير نقدية' },
                { id: 'آجل_أو_جزئي', label: 'عليها متبقي آجل' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setInvoiceFilter(tab.id as 'all' | 'نقدي' | 'آجل_أو_جزئي')
                  }
                  className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                    invoiceFilter === tab.id
                      ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] shadow-sm'
                      : 'bg-white text-[#6E5D4F] border-[#E6DEC8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* قائمة فواتير المشتريات */}
          <div className="space-y-3">
            {filteredInvoices.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-[#E6DEC8] space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center mx-auto">
                  <FileText className="w-7 h-7" />
                </div>
                <div className="text-sm font-black text-[#1E1612]">
                  لا توجد فواتير مشتريات مسجلة
                </div>
                <p className="text-xs text-[#8C7A6B]">
                  اضغط على زر &quot;إنشاء فاتورة مشتريات جديدة&quot; لإضافة
                  توريد جديد للمخزن
                </p>
              </div>
            ) : (
              filteredInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-white rounded-2xl p-4 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm space-y-3 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-[#1E1612]">
                            #{inv.invoiceNumber}
                            {inv.isCancelled ? ' — ملغاة' : ''}
                            {inv.isCancelled && (
                              <span className="block text-amber-800">
                                مبلغ الاسترداد من المورد: {inv.refundDue ?? 0}{' '}
                                ج.م
                              </span>
                            )}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              inv.remainingAmount > 0
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}
                          >
                            {inv.remainingAmount > 0
                              ? `${inv.paymentMethod} (متبقي ${inv.remainingAmount} ج.م)`
                              : 'مدفوعة بالكامل'}
                          </span>
                        </div>
                        <div className="text-xs font-extrabold text-[#6E5D4F] mt-0.5">
                          المورد: {inv.supplierName}
                        </div>
                        <div className="text-[10px] text-[#8C7A6B]">
                          التاريخ: {inv.date} • بواسطة: {inv.partnerName}
                        </div>
                      </div>
                    </div>

                    <div className="text-left">
                      <div className="text-sm font-black text-[#1E1612]">
                        {inv.totalAmount.toLocaleString('ar-EG')} ج.م
                      </div>
                      <div className="text-[10px] text-[#8C7A6B] font-bold">
                        {inv.items.length} أصناف
                      </div>
                    </div>
                  </div>

                  {/* ملخص سريع للأصناف داخل الفاتورة */}
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#F2ECE1]">
                    {inv.items.map((line, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-bold bg-[#FAF8F4] text-[#1E1612] border border-[#E6DEC8] px-2 py-1 rounded-lg"
                      >
                        {line.itemName} ({line.quantity} {line.unit} ×{' '}
                        {line.purchasePrice} ج.م)
                      </span>
                    ))}
                  </div>

                  {/* أزرار عرض تفاصيل الفاتورة أو حذفها */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setSelectedInvoiceDetails(inv)}
                      className="text-xs font-extrabold text-[#9E7918] bg-[#FDF8EB] border border-[#E8D8A8] px-3 py-1.5 rounded-xl flex items-center gap-1.5 hover:bg-[#F5EBD0] transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>عرض تفاصيل الفاتورة</span>
                    </button>

                    {onDeletePurchaseInvoice && (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `هل تريد إلغاء فاتورة المشتريات وعكس المخزون والمديونية #${inv.invoiceNumber}{inv.isCancelled ? ' — ملغاة' : ''}؟`,
                            )
                          ) {
                            onDeletePurchaseInvoice(inv.id);
                          }
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
                        disabled={inv.isCancelled}
                        title={
                          inv.isCancelled
                            ? 'فاتورة ملغاة'
                            : 'إلغاء الفاتورة وعكس أثرها'
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================= الوضع الثاني: إنشاء فاتورة مشتريات جديدة واختيار الأصناف ================= */}
      {viewMode === 'create' && (
        <div className="p-3.5 space-y-3.5 flex-1">
          {/* الخطوة 1: اختيار المورد وتاريخ الفاتورة */}
          <div className="bg-white rounded-2xl border border-[#E6DEC8] p-3.5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#1E1612] flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#9E7918]" />
                <span>1. بيانات المورد وتاريخ الفاتورة</span>
              </span>
              {onQuickAddSupplier && (
                <button
                  onClick={() => setShowNewSupplierModal(true)}
                  className="text-[11px] font-extrabold text-[#9E7918] bg-[#FDF8EB] border border-[#E8D8A8] px-2.5 py-1 rounded-lg flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ مورد جديد</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 bg-[#FAF8F4] rounded-xl border border-[#E6DEC8] px-3 py-2">
                <label className="text-[10px] text-[#8C7A6B] font-bold block">
                  اختر المورد
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full text-xs font-black text-[#1E1612] bg-transparent focus:outline-none cursor-pointer mt-0.5"
                >
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} (
                      {sup.balance > 0 ? `له: ${sup.balance} ج.م` : 'خالص'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-[#FAF8F4] rounded-xl border border-[#E6DEC8] px-2.5 py-2">
                <label className="text-[10px] text-[#8C7A6B] font-bold block">
                  التاريخ
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full text-[11px] font-black text-[#1E1612] bg-transparent focus:outline-none mt-0.5"
                />
              </div>
            </div>
          </div>

          {/* الخطوة 2: اختيار الأصناف لإضافتها في الفاتورة */}
          <div className="bg-white rounded-2xl border border-[#E6DEC8] p-3.5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#1E1612] flex items-center gap-1.5">
                <Package className="w-4 h-4 text-[#9E7918]" />
                <span>2. اختر الأصناف لإضافتها للفاتورة</span>
              </span>
              {onQuickAddItem && (
                <button
                  onClick={() => setShowNewItemModal(true)}
                  className="text-[11px] font-extrabold text-[#1E1612] bg-[#FDF8EB] border border-[#C59B27] px-2.5 py-1 rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-[#9E7918]" />
                  <span>تعريف صنف جديد</span>
                </button>
              )}
            </div>

            {/* تبويبات تصفية الأصناف */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'raw_bean', label: 'حبوب بن خام' },
                { id: 'raw_spice', label: 'تحويجة وإضافات' },
                { id: 'direct_product', label: 'معلبات وأكواب' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() =>
                    setItemCategoryFilter(
                      cat.id as
                        | 'all'
                        | 'raw_bean'
                        | 'raw_spice'
                        | 'direct_product',
                    )
                  }
                  className={`py-1.5 px-1 rounded-xl text-[10px] font-extrabold border transition ${
                    itemCategoryFilter === cat.id
                      ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]'
                      : 'bg-[#FAF8F4] text-[#6E5D4F] border-[#E6DEC8]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* شريط بحث عن صنف */}
            <div className="bg-[#FAF8F4] rounded-xl border border-[#E6DEC8] px-3 py-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-[#9E7918] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن الصنف لإضافته (برازيلي، كولومبي، حبهان...)"
                className="w-full text-xs font-bold bg-transparent focus:outline-none text-[#1E1612]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-[#8C7A6B]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* شبكة الأصناف القابلة للإضافة بضغطة واحدة */}
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
              {filteredPickerItems.map((item) => {
                const inCart = cart.find((c) => c.item.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addItemToCart(item)}
                    className={`p-2.5 rounded-xl border text-right transition flex items-center justify-between gap-2 ${
                      inCart
                        ? 'bg-[#FDF8EB] border-[#C59B27] shadow-sm'
                        : 'bg-[#FAF8F4] border-[#E6DEC8] hover:border-[#C59B27]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-black text-[#1E1612] truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-[#7A6855] font-semibold mt-0.5">
                        الرصيد: {item.stock}{' '}
                        {item.baseUnit === 'kg' ? 'كجم' : 'قطعة'} • آخر سعر:{' '}
                        {item.lastPurchasePrice} ج
                      </div>
                    </div>
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-black text-xs ${
                        inCart
                          ? 'bg-[#1E1612] text-[#FBF5B7]'
                          : 'bg-white text-[#9E7918] border border-[#E6DEC8]'
                      }`}
                    >
                      {inCart ? `${inCart.quantity}` : '+'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* بانر التنبيه لو هناك صنف بسعر أعلى من أرخص مورد */}
          {higherThanCheapestCount > 0 && (
            <div className="bg-red-50/90 border border-red-200 rounded-2xl p-3 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-red-700">
                    تنبيه: {higherThanCheapestCount} صنف بسعر أعلى من أرخص مورد
                    مسجل
                  </div>
                  <div className="text-[10px] text-red-600/80 font-semibold">
                    راجع مقارنة الموردين بالأسفل للحفاظ على تكلفة التوليفات
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* الخطوة 3: الأصناف المختارة داخل الفاتورة وتحديد الكميات والأسعار */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E6DEC8] space-y-4">
            <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-2.5">
              <span className="text-xs font-black text-[#1E1612]">
                3. بنود فاتورة المشتريات ({cart.length} أصناف)
              </span>
              <span className="text-xs font-black text-[#9E7918]">
                الإجمالي: {totalInvoiceAmount.toLocaleString('ar-EG')} ج.م
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[#FAF8F4] border border-[#E6DEC8] text-[#9E7918] flex items-center justify-center mx-auto">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div className="text-xs font-extrabold text-[#6E5D4F]">
                  الفاتورة فارغة حالياً
                </div>
                <div className="text-[11px] text-[#8C7A6B]">
                  اضغط على أي صنف من القائمة بالأعلى لإضافته وتحديد الكمية
                  والسعر
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((entry) => {
                  const {
                    item,
                    quantity,
                    purchasePrice,
                    newRetailPrice,
                    updateCost,
                  } = entry;
                  const lineTotal = quantity * purchasePrice;
                  const lastPrice = item.lastPurchasePrice || purchasePrice;
                  const diffPercentFromLast =
                    lastPrice > 0
                      ? Math.round(
                          ((purchasePrice - lastPrice) / lastPrice) * 100,
                        )
                      : 0;

                  const cheapestRecord =
                    item.supplierPrices.length > 0
                      ? item.supplierPrices.reduce(
                          (min, p) => (p.price < min.price ? p : min),
                          item.supplierPrices[0],
                        )
                      : {
                          price: lastPrice,
                          supplierName: 'آخر مورد مسجل',
                          date: '-',
                        };

                  const newWac =
                    item.stock + quantity > 0
                      ? Number(
                          (
                            (item.stock * item.costPrice +
                              quantity * purchasePrice) /
                            (item.stock + quantity)
                          ).toFixed(2),
                        )
                      : purchasePrice;

                  const unitArabic =
                    item.baseUnit === 'kg'
                      ? 'كجم'
                      : item.baseUnit === 'liter'
                        ? 'لتر'
                        : 'قطعة';

                  return (
                    <div
                      key={item.id}
                      className="border border-[#E6DEC8] rounded-2xl p-3.5 space-y-3 bg-[#FAF8F4]/70"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-[#1E1612]">
                          {item.name}
                        </span>
                        <button
                          onClick={() => removeCartItem(item.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          title="حذف الصنف من الفاتورة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* السعر والكمية والإجمالي */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-white border border-[#DED6C6] rounded-xl px-3 py-2">
                          <label className="text-[10px] font-bold text-[#8C7A6B] block">
                            سعر الشراء للـ {unitArabic}
                          </label>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Edit3 className="w-3.5 h-3.5 text-[#9E7918] shrink-0" />
                            <input
                              type="number"
                              value={purchasePrice}
                              onChange={(e) =>
                                updateCartItem(item.id, {
                                  purchasePrice: Math.max(
                                    0,
                                    parseFloat(e.target.value) || 0,
                                  ),
                                })
                              }
                              className="w-full text-sm font-black text-[#1E1612] bg-transparent focus:outline-none"
                            />
                            <span className="text-[10px] text-[#7A6855] font-bold">
                              ج.م
                            </span>
                          </div>
                        </div>

                        <div className="bg-white border border-[#DED6C6] rounded-xl px-3 py-2">
                          <label className="text-[10px] font-bold text-[#8C7A6B] block">
                            الكمية المشتراة ({unitArabic})
                          </label>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateCartItem(item.id, {
                                  quantity: Math.max(
                                    0.5,
                                    Number((quantity - 1).toFixed(2)),
                                  ),
                                })
                              }
                              className="w-6 h-6 rounded-lg bg-[#FAF8F4] border border-[#E6DEC8] text-[#1E1612] flex items-center justify-center"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              step="0.5"
                              value={quantity}
                              onChange={(e) =>
                                updateCartItem(item.id, {
                                  quantity: Math.max(
                                    0.1,
                                    parseFloat(e.target.value) || 0.1,
                                  ),
                                })
                              }
                              className="w-14 text-center font-black text-sm text-[#1E1612] bg-transparent focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateCartItem(item.id, {
                                  quantity: Number((quantity + 1).toFixed(2)),
                                })
                              }
                              className="w-6 h-6 rounded-lg bg-[#1E1612] text-[#FBF5B7] flex items-center justify-center"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* إجمالي السطر + تعديل سعر البيع القطاعي */}
                      <div className="bg-white border border-[#E6DEC8] rounded-xl px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-[#9E7918]" />
                          <span className="text-[11px] font-bold text-[#6E5D4F]">
                            سعر البيع للكيلو/الوحدة:
                          </span>
                          <input
                            type="number"
                            value={newRetailPrice}
                            onChange={(e) =>
                              updateCartItem(item.id, {
                                newRetailPrice: e.target.value,
                              })
                            }
                            className="w-16 text-xs font-black text-[#1E1612] bg-[#FAF8F4] border border-[#DED6C6] rounded-lg px-2 py-0.5 text-center"
                          />
                        </div>
                        <div className="text-xs font-black text-[#1E1612]">
                          الإجمالي: {lineTotal.toLocaleString('ar-EG')} ج.م
                        </div>
                      </div>

                      {/* ملخص مقارنة الموردين ومتوسط التكلفة الجديد (WAC) */}
                      <div className="rounded-xl border border-[#E8D8A8] bg-[#FDF8EB] p-2.5 space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between text-[#6E5D4F]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#9E7918]" />
                            آخر شراء: <b>{lastPrice} ج.م</b>
                          </span>
                          {diffPercentFromLast !== 0 && (
                            <span
                              className={`px-2 py-0.5 rounded font-black text-[10px] ${
                                diffPercentFromLast > 0
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {diffPercentFromLast > 0
                                ? `▲ +${diffPercentFromLast}%`
                                : `▼ ${diffPercentFromLast}%`}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[#6E5D4F]">
                          <span>
                            متوسط التكلفة (WAC): <b>{item.costPrice} ج.م</b> ←{' '}
                            <b className="text-emerald-700">
                              سيصبح {newWac} ج.م
                            </b>
                          </span>
                          <button
                            type="button"
                            onClick={() => setCompareModalItem(item)}
                            className="font-black text-[#9E7918] underline"
                          >
                            مقارنة الموردين
                          </button>
                        </div>

                        <div className="text-[10px] text-emerald-800 font-bold">
                          🏷️ أرخص مورد: {cheapestRecord.price} ج.م (
                          {cheapestRecord.supplierName})
                        </div>
                      </div>

                      <label className="flex items-center justify-between pt-0.5 cursor-pointer">
                        <span className="text-[11px] font-bold text-[#6E5D4F]">
                          تحديث متوسط التكلفة (WAC) وتكلفة التوليفات المرتبطة
                          تلقائياً
                        </span>
                        <input
                          type="checkbox"
                          checked={updateCost}
                          onChange={(e) =>
                            updateCartItem(item.id, {
                              updateCost: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-[#1E1612] rounded"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* الخطوة 4: طريقة السداد للمورد */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E6DEC8] space-y-3">
            <div className="text-xs font-black text-[#1E1612]">
              4. طريقة السداد للمورد
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['نقدي', 'آجل', 'جزئي'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2.5 rounded-xl text-xs font-extrabold border transition ${
                    paymentMethod === method
                      ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] shadow-sm'
                      : 'bg-[#FAF8F4] text-[#6E5D4F] border-[#E6DEC8]'
                  }`}
                >
                  {method === 'نقدي'
                    ? 'نقدي بالكامل'
                    : method === 'آجل'
                      ? 'آجل (على الحساب)'
                      : 'سداد جزئي'}
                </button>
              ))}
            </div>
            {paymentMethod === 'جزئي' && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs font-bold text-[#6E5D4F]">
                  المبلغ المدفوع الآن للمورد:
                </span>
                <input
                  type="number"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="w-36 border border-[#DED6C6] bg-[#FAF8F4] rounded-xl px-3 py-1.5 text-sm font-black text-center"
                />
              </div>
            )}
          </div>

          {/* شريط حفظ الفاتورة السفلي */}
          <div className="fixed bottom-[58px] left-0 right-0 bg-white border-t border-[#E6DEC8] p-3 flex items-center gap-2.5 z-30 max-w-[445px] mx-auto shadow-md">
            <button
              onClick={handleSave}
              disabled={cart.length === 0}
              className="flex-[2] bg-[#1E1612] hover:bg-[#2E221A] disabled:opacity-50 text-[#FBF5B7] border border-[#C59B27] font-black py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs"
            >
              <Check className="w-4 h-4 text-[#D4AF37]" />
              <span>
                حفظ واعتماد الفاتورة (
                {totalInvoiceAmount.toLocaleString('ar-EG')} ج.م)
              </span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="flex-1 bg-white border border-[#DED6C6] text-[#5C4B3E] font-bold py-3 rounded-xl hover:bg-[#FAF8F4] transition text-xs"
            >
              رجوع للفواتير
            </button>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل فاتورة مشتريات مسجلة */}
      {selectedInvoiceDetails && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl border border-[#C59B27]">
            <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-3">
              <div>
                <h3 className="text-sm font-black text-[#1E1612]">
                  تفاصيل فاتورة مشتريات #{selectedInvoiceDetails.invoiceNumber}
                </h3>
                <p className="text-xs text-[#8C7A6B]">
                  المورد: {selectedInvoiceDetails.supplierName} •{' '}
                  {selectedInvoiceDetails.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoiceDetails(null)}
                className="p-1.5 rounded-full bg-[#FAF8F4] text-[#6E5D4F]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedInvoiceDetails.items.map((it, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E6DEC8] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-black text-[#1E1612]">
                      {it.itemName}
                    </div>
                    <div className="text-[11px] text-[#7A6855]">
                      الكمية: {it.quantity} {it.unit} × السعر:{' '}
                      {it.purchasePrice} ج.م
                    </div>
                  </div>
                  <div className="font-black text-[#9E7918]">
                    {(it.quantity * it.purchasePrice).toLocaleString('ar-EG')}{' '}
                    ج.م
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#1E1612] text-[#FBF5B7] rounded-2xl p-3.5 text-xs space-y-1">
              <div className="flex justify-between">
                <span>إجمالي الفاتورة:</span>
                <span className="font-black">
                  {selectedInvoiceDetails.totalAmount.toLocaleString('ar-EG')}{' '}
                  ج.م
                </span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>المدفوع للمورد:</span>
                <span className="font-black">
                  {selectedInvoiceDetails.paidAmount.toLocaleString('ar-EG')}{' '}
                  ج.م
                </span>
              </div>
              <div className="flex justify-between text-amber-400">
                <span>المتبقي آجل:</span>
                <span className="font-black">
                  {selectedInvoiceDetails.remainingAmount.toLocaleString(
                    'ar-EG',
                  )}{' '}
                  ج.م
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إضافة مورد جديد سريعاً من داخل الفاتورة */}
      {showNewSupplierModal && onQuickAddSupplier && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-3.5 shadow-2xl border border-[#C59B27]">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-[#1E1612]">
                إضافة مورد جديد سريعاً
              </h3>
              <button
                onClick={() => setShowNewSupplierModal(false)}
                className="p-1 rounded-lg bg-[#FAF8F4]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newSupName}
              onChange={(e) => setNewSupName(e.target.value)}
              placeholder="اسم المورد أو الشركة"
              className="w-full border border-[#DED6C6] rounded-xl px-3 py-2.5 text-xs font-bold"
            />
            <input
              type="text"
              value={newSupPhone}
              onChange={(e) => setNewSupPhone(e.target.value)}
              placeholder="رقم الموبايل"
              className="w-full border border-[#DED6C6] rounded-xl px-3 py-2.5 text-xs font-bold"
            />
            <input
              type="text"
              value={newSupCategory}
              onChange={(e) => setNewSupCategory(e.target.value)}
              placeholder="التخصص (مثلاً: بن أخضر، حبهان، أكواب...)"
              className="w-full border border-[#DED6C6] rounded-xl px-3 py-2.5 text-xs font-bold"
            />
            <button
              onClick={() => {
                if (!newSupName.trim()) return;
                onQuickAddSupplier({
                  name: newSupName.trim(),
                  phone: newSupPhone.trim() || '01000000000',
                  category: newSupCategory.trim() || 'مورد خامات',
                  balance: 0,
                  totalPurchases: 0,
                  invoicesCount: 0,
                });
                setNewSupName('');
                setNewSupPhone('');
                setShowNewSupplierModal(false);
              }}
              className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] py-2.5 rounded-xl text-xs font-black"
            >
              حفظ المورد
            </button>
          </div>
        </div>
      )}

      {/* نافذة تعريف صنف جديد للمخزن مباشرة من فاتورة المشتريات */}
      {showNewItemModal && onQuickAddItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-3 shadow-2xl border border-[#C59B27]">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-[#1E1612]">
                تعريف صنف جديد للمخزن والفاتورة
              </h3>
              <button
                onClick={() => setShowNewItemModal(false)}
                className="p-1 rounded-lg bg-[#FAF8F4]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="اسم الصنف (مثلاً: بن يمني، حبهان جامبو...)"
              className="w-full border border-[#DED6C6] rounded-xl px-3 py-2 text-xs font-bold"
            />
            <select
              value={newItemCat}
              onChange={(e) => setNewItemCat(e.target.value as ItemCategory)}
              className="w-full border border-[#DED6C6] rounded-xl px-3 py-2 text-xs font-bold bg-[#FAF8F4]"
            >
              <option value="raw_bean">حبوب بن محمصة خام (بالكيلو)</option>
              <option value="raw_spice">تحويجة وإضافات (بالكيلو)</option>
              <option value="direct_product">منتجات وأكواب (بالقطعة)</option>
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={newItemCost}
                onChange={(e) => setNewItemCost(e.target.value)}
                placeholder="سعر الشراء"
                className="border border-[#DED6C6] rounded-xl px-2.5 py-2 text-xs font-bold"
              />
              <input
                type="number"
                value={newItemRetail}
                onChange={(e) => setNewItemRetail(e.target.value)}
                placeholder="بيع قطاعي"
                className="border border-[#DED6C6] rounded-xl px-2.5 py-2 text-xs font-bold"
              />
              <input
                type="number"
                value={newItemWholesale}
                onChange={(e) => setNewItemWholesale(e.target.value)}
                placeholder="بيع جملة"
                className="border border-[#DED6C6] rounded-xl px-2.5 py-2 text-xs font-bold"
              />
            </div>
            <button
              onClick={() => {
                if (!newItemName.trim()) return;
                const cost = parseFloat(newItemCost) || 300;
                const retail =
                  parseFloat(newItemRetail) || Math.round(cost * 1.3);
                const wholesale =
                  parseFloat(newItemWholesale) || Math.round(cost * 1.15);
                onQuickAddItem({
                  code: `BN-${Math.floor(100 + Math.random() * 899)}`,
                  name: newItemName.trim(),
                  category: newItemCat,
                  baseUnit: newItemCat === 'direct_product' ? 'piece' : 'kg',
                  stock: 0,
                  minStock: 5,
                  costPrice: cost,
                  lastPurchasePrice: cost,
                  retailPrice: retail,
                  wholesalePrice: wholesale,
                  canSellDirectly: true,
                  hasRecipe: false,
                  supplierPrices: [],
                });
                setNewItemName('');
                setNewItemCost('');
                setNewItemRetail('');
                setNewItemWholesale('');
                setShowNewItemModal(false);
              }}
              className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] py-2.5 rounded-xl text-xs font-black"
            >
              حفظ الصنف وإضافته للقائمة
            </button>
          </div>
        </div>
      )}

      {/* نافذة مقارنة كل الموردين وأسعارهم */}
      {compareModalItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl border border-[#C59B27]">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-black text-[#1E1612]">
                  مقارنة أسعار الموردين
                </h3>
                <p className="text-xs text-[#8C7A6B]">
                  {compareModalItem.name}
                </p>
              </div>
              <button
                onClick={() => setCompareModalItem(null)}
                className="p-1.5 rounded-full bg-[#FAF8F4] text-[#6E5D4F]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5">
              {compareModalItem.supplierPrices.map((sp, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    i === 0
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-[#FAF8F4] border-[#E6DEC8]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-black text-[#1E1612]">
                      {sp.supplierName}
                    </div>
                    <div className="text-[10px] text-[#8C7A6B]">
                      تاريخ آخر توريد: {sp.date}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-black text-emerald-700">
                      {sp.price} ج.م
                    </div>
                    {i === 0 && (
                      <span className="text-[9px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                        الأرخص
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
