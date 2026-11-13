import {unitLabel as displayUnit} from '../lib/units';
import {ShoppingBag as HeaderShoppingBag} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {Modal} from './Modal';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {ResponsiveRegister} from './ResponsiveRegister';
import {RecordPicker} from './RecordPicker';
import {RecordPickerField} from './RecordPickerField';
import {RecordTabs} from './RecordTabs';
import {SupplierPurchasePanels} from './SupplierPurchasePanels';
import {money} from '../lib/reporting';
import {latestSupplierPrices,supplierPurchaseHistory} from '../lib/supplierPurchases';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import React, { useState, useMemo, useRef } from "react";
import {Truck, Search, AlertTriangle, Plus, Minus, Trash2, Edit3, Clock, Package, Tag, Check, FileText, X, ShoppingBag, Eye, UserPlus} from 'lucide-react';
import {
  InventoryItem,
  Supplier,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  ItemCategory,
} from "../types/erp";
import {isPurchasable,itemCategories} from '../lib/itemPolicy';
import {movingAverageCost} from '../lib/costing';
import {checkSupplierDetails} from '../lib/contactDetails';
import { businessDate } from "../lib/dates";

interface PurchaseScreenProps {
  items: InventoryItem[];
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  initialInvoiceId?: string;
  currentPartnerName: string;
  onSavePurchase: (
    invoice: Omit<PurchaseInvoice, "id" | "invoiceNumber">,
  ) => boolean | Promise<boolean>;
  onDeletePurchaseInvoice?: (invoiceId: string) => void;
  onQuickAddSupplier?: (supplier: Omit<Supplier, "id">) => void;
  onQuickAddItem?: (item: Omit<InventoryItem, "id">) => void;
  onBack: () => void;
}

export const PurchaseScreen: React.FC<PurchaseScreenProps> = ({
  items,
  suppliers,
  purchaseInvoices,
  initialInvoiceId,
  currentPartnerName,
  onSavePurchase,
  onDeletePurchaseInvoice,
  onQuickAddSupplier,
  onQuickAddItem,
  onBack,
}) => {
  // وضع الشاشة: 'list' (قائمة وسجل فواتير المشتريات) | 'create' (إنشاء فاتورة مشتريات جديدة)
  const [viewMode, setViewMode] = useState<"list" | "create">("list");

  // فلاتر سجل فواتير المشتريات
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [registerTab,setRegisterTab]=useState<'invoices'|'prices'>('invoices');
  const [priceSupplierId,setPriceSupplierId]=useState('');
  const supplierPrices=useMemo(()=>priceSupplierId?supplierPurchaseHistory(purchaseInvoices,priceSupplierId):null,
    [purchaseInvoices,priceSupplierId]);
  const [invoiceFilter, setInvoiceFilter] = useState<
    "all" | "نقدي" | "آجل_أو_جزئي"
  >("all");
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] =
    useState<PurchaseInvoice | null>(() => purchaseInvoices.find(invoice => invoice.id === initialInvoiceId) ?? null);
  const [invoiceToCancel, setInvoiceToCancel] = useState<PurchaseInvoice>();

  // بيانات إنشاء فاتورة مشتريات جديدة
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    suppliers[0]?.id || "",
  );
  const [invoiceDate, setInvoiceDate] = useState<string>(businessDate());
  const [itemCategoryFilter, setItemCategoryFilter] = useState<
    "all" | ItemCategory
  >("all");
  const [showSupplierPicker,setShowSupplierPicker]=useState(false);
  const [showItemPickerModal, setShowItemPickerModal] = useState(false);
  const [taxInput,setTaxInput]=useState('0');
  const taxAmount=Number(taxInput);
  const [compareModalItem, setCompareModalItem] =
    useState<InventoryItem | null>(null);

  // نافذة إضافة مورد جديد سريعاً من داخل الفاتورة
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [newSupName, setNewSupName] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupAddress,setNewSupAddress]=useState('');
  const [newSupRepresentative,setNewSupRepresentative]=useState('');
  const [supplierError,setSupplierError]=useState('');
  const [newSupCategory, setNewSupCategory] = useState("توريد بن وخامات");

  // نافذة تعريف صنف خام جديد سريعاً من داخل الفاتورة
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [reviewInvoice,setReviewInvoice]=useState<Omit<PurchaseInvoice,'id'|'invoiceNumber'>>();
  const [submitting,setSubmitting]=useState(false);
  const saving=useRef(false);

  // الأصناف القابلة للشراء
  const purchasableItems = useMemo(
    () =>
      items.filter(isPurchasable),
    [items],
  );

  // سلة الفاتورة الجديدة (تبدأ فارغة تماماً ليختار المستخدم الأصناف بنفسه)
  const [cart, setCart] = useState<
    {
      item: InventoryItem;
      quantity: number;
      purchasePrice: number;
      newRetailPrice: string;
      newWholesalePrice: string;
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
      count: purchaseInvoices.filter((i) => !i.isCancelled).length,
      totalPurchases,
      totalPaid,
      totalRemaining,
    };
  }, [purchaseInvoices]);

  const filteredInvoices = useMemo(() => {
    return purchaseInvoices.filter((inv) => {
      if (invoiceFilter === "نقدي" && inv.paymentMethod !== "نقدي")
        return false;
      if (
        invoiceFilter === "آجل_أو_جزئي" &&
        (inv.isCancelled || !(inv.remainingAmount > 0))
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

  const invoicePage=useRecordPage(filteredInvoices,invoiceSearch+'|'+invoiceFilter);

  const filteredPickerItems = useMemo(() => {
    return purchasableItems.filter((i) => {
      if (itemCategoryFilter !== "all" && (i.category==='raw_spice'?'direct_product':i.category) !== itemCategoryFilter) {
        return false;
      }
      return true;
    });
  }, [purchasableItems, itemCategoryFilter]);

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
          newWholesalePrice: String(item.wholesalePrice),
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
      newWholesalePrice: string;
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
      const prices = latestSupplierPrices(c.item.supplierPrices).map((sp) => sp.price);
      const minPrice =
        prices.length > 0 ? Math.min(...prices) : c.item.lastPurchasePrice;
      return c.purchasePrice > minPrice;
    }).length;
  }, [cart]);

  // فهرس أرخص مورد داخل نافذة المقارنة (كان يُحدَّد بـ i===0 وهو خطأ)
  const cheapestCompareIndex = useMemo(() => {
    if (!compareModalItem || compareModalItem.supplierPrices.length === 0)
      return -1;
    const prices = latestSupplierPrices(compareModalItem.supplierPrices).map((sp) => sp.price);
    return prices.indexOf(Math.min(...prices));
  }, [compareModalItem]);

  const netInvoiceAmount = useMemo(
    () =>
      cart.reduce(
        (sum, c) => sum + Number((c.quantity * c.purchasePrice).toFixed(2)),
        0,
      ),
    [cart],
  );

  const totalInvoiceAmount=Number((netInvoiceAmount+(Number.isFinite(taxAmount)?taxAmount:0)).toFixed(2));

  const handleStartNewInvoice = () => {
    setCart([]);
    setSelectedSupplierId(suppliers[0]?.id || "");
    setInvoiceDate(businessDate());
    setTaxInput('0');
    setViewMode("create");
  };

  const handleSave = () => {
    if (cart.length === 0) return;
    setInvoiceError("");
    if (
      cart.some(
        (c) =>
          !c.newRetailPrice.trim() ||
          !c.newWholesalePrice.trim() ||
          !Number.isFinite(Number(c.newRetailPrice)) ||
          Number(c.newRetailPrice) < 0 ||
          !Number.isFinite(Number(c.newWholesalePrice)) ||
          Number(c.newWholesalePrice) < 0,
      )
    ) {
      setInvoiceError("أكمل أسعار البيع بأرقام صحيحة غير سالبة");
      return;
    }
    if(!invoiceDate){setInvoiceError('حدد تاريخ الفاتورة');return;}
    if(cart.some(line=>!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isFinite(line.purchasePrice)||line.purchasePrice<0)){
      setInvoiceError('راجع الكمية وسعر الشراء في بنود الفاتورة');
      return;
    }
    if(!taxInput.trim()||!Number.isFinite(taxAmount)||taxAmount<0){setInvoiceError('أدخل ضريبة صحيحة أو صفرًا');return;}
    if(!suppliers.some(s=>s.id===selectedSupplierId)){setInvoiceError('اختر موردًا مسجلًا');return;}
    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    const invoiceItems: PurchaseInvoiceItem[] = cart.map((c) => {
      const prices = latestSupplierPrices(c.item.supplierPrices);
      const cheapest =
        prices.length > 0
          ? prices.reduce(
              (min, p) => (p.price < min.price ? p : min),
              prices[0],
            )
          : {
              price: c.item.lastPurchasePrice,
              supplierName: supplier?.name || "المورد الحالي",
            };

      return {
        itemId: c.item.id,
        itemName: c.item.name,
        quantity: c.quantity,
        unit:
          displayUnit(c.item.baseUnit),
        purchasePrice: c.purchasePrice,
        newRetailPrice: Number(c.newRetailPrice),
        newWholesalePrice: Number(c.newWholesalePrice),
        previousLastPrice: c.item.lastPurchasePrice,
        previousWacCost: c.item.costPrice,
        cheapestSupplierPrice: cheapest.price,
        cheapestSupplierName: cheapest.supplierName,
        updateProductCost: true,
      };
    });

    setReviewInvoice({
      date: invoiceDate,
      supplierId: selectedSupplierId,
      supplierName: supplier?.name || "مورد عام",
      items: invoiceItems,
      totalAmount: totalInvoiceAmount,
      netAmount: netInvoiceAmount,
      taxAmount,
      accountingVersion:2,
      paidAmount:totalInvoiceAmount,
      remainingAmount:0,
      paymentMethod:'نقدي',
      partnerName: currentPartnerName,
    });

  };

  const confirmPurchase = async () => {
    if (!reviewInvoice || saving.current) return;
    saving.current = true;
    setSubmitting(true);
    try {
      const accepted = await onSavePurchase(reviewInvoice);
      if (accepted === false) throw Error("لم تُحفظ الفاتورة؛ راجع التنبيه والبيانات");
      setCart([]);
      setRegisterTab("invoices");
      setViewMode("list");
    } catch (cause) {
      setInvoiceError(cause instanceof Error ? cause.message : "تعذر تأكيد الحفظ.");
    } finally {
      saving.current = false;
      setSubmitting(false);
      setReviewInvoice(undefined);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-28 flex flex-col">
<OperationHeader title={<>{viewMode === "list"
              ? "المشتريات وفواتير التوريد"
              : "إنشاء فاتورة مشتريات جديدة"}</>} description={<>{viewMode === "list"
              ? "سجل فواتير الشراء وتوريدات الموردين"
              : "اختر المورد والأصناف والكميات لتغذية المخزن"}</>} icon={HeaderShoppingBag} onBack={() => {
            if (viewMode === "create") {
              setViewMode("list");
            } else {
              onBack();
            }
          }}>{viewMode === "list" ? (
          <button
            onClick={handleStartNewInvoice}
            className="operation-primary"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة جديدة</span>
          </button>
        ) : (
          <button
            onClick={() => setViewMode("list")}
            className="text-xs font-bold text-[#D4AF37] bg-white/10 px-2.5 py-1.5 rounded-xl border border-[#C59B27]/30"
          >
            الفواتير ({purchaseInvoices.length})
          </button>
        )}</OperationHeader>
      {invoiceError && (
        <p role="alert" className="text-red-700 bg-red-50 p-3 font-bold">
          {invoiceError}
        </p>
      )}
      {viewMode === "list" && <div className="record-workspace">
        <dl className="record-facts operation-surface">
          <div><dt>إجمالي المشتريات</dt><dd>{money(purchaseStats.totalPurchases)} ج.م</dd></div>
          <div><dt>المدفوع للموردين</dt><dd>{money(purchaseStats.totalPaid)} ج.م</dd></div>
          <div><dt>المتبقي من فواتير قديمة</dt><dd>{money(purchaseStats.totalRemaining)} ج.م</dd></div>
        </dl>
        <RecordTabs label="أقسام المشتريات" value={registerTab} onChange={setRegisterTab}
          tabs={[{id:'invoices',label:'الفواتير'},{id:'prices',label:'أسعار الموردين'}]} />
        {registerTab==='prices' && <div className="operation-surface space-y-3 p-4">
          <RecordPickerField label="المورد لعرض الأسعار" searchLabel="ابحث باسم المورد أو رقم الهاتف"
            options={suppliers.map(supplier=>({id:supplier.id,title:supplier.name,detail:supplier.phone}))}
            value={priceSupplierId} onChange={setPriceSupplierId}/>
          {supplierPrices ? <SupplierPurchasePanels key={priceSupplierId} data={supplierPrices}
            onOpenInvoice={id=>setSelectedInvoiceDetails(purchaseInvoices.find(invoice=>invoice.id===id)??null)} />
            : <p className="record-state">{suppliers.length?'اختَر موردًا لعرض أسعار مشترياته.':'لا يوجد موردون مسجلون.'}</p>}
        </div>}
        {registerTab==='invoices' && <>
        <label className="record-search">البحث في الفواتير
          <input type="search" value={invoiceSearch} onChange={event=>setInvoiceSearch(event.target.value)}
            placeholder="رقم الفاتورة أو المورد أو الصنف" />
        </label>
        <nav className="record-tabs" aria-label="حالة دفع فواتير المشتريات">
          {([{id:'all',label:'كل الفواتير'},{id:'نقدي',label:'مدفوعة بالكامل'},{id:'آجل_أو_جزئي',label:'عليها متبقي'}] as const).map(tab=>
            <button type="button" key={tab.id} aria-pressed={invoiceFilter===tab.id} onClick={()=>setInvoiceFilter(tab.id)}>{tab.label}</button>)}
        </nav>
        <RecordPagination {...invoicePage}/>
        {invoicePage.visible.length ? <ResponsiveRegister label="سجل فواتير المشتريات" rows={invoicePage.visible} columns={[
          {title:'الفاتورة',render:inv=><strong dir="ltr">{inv.invoiceNumber}</strong>},
          {title:'المورد',render:inv=>inv.supplierName},
          {title:'التاريخ',render:inv=><time dateTime={inv.date}>{inv.date}</time>},
          {title:'الإجمالي',render:inv=><b>{money(inv.totalAmount)} ج.م</b>},
          {title:'الحالة',render:inv=>inv.isCancelled?<>ملغاة · استرداد {money(inv.refundDue??0)} ج.م</>:inv.remainingAmount>0?<>متبقي {money(inv.remainingAmount)} ج.م</>:'مدفوعة بالكامل'},
          {title:'الإجراءات',render:inv=><div className="register-actions">
            <button type="button" className="record-action" onClick={()=>setSelectedInvoiceDetails(inv)}>عرض تفاصيل الفاتورة</button>
            {onDeletePurchaseInvoice&&!inv.isCancelled&&<button type="button" className="record-action text-red-700" onClick={()=>setInvoiceToCancel(inv)}>إلغاء</button>}
          </div>},
        ]}/> : <p className="record-state">{purchaseInvoices.length?'لا توجد فواتير مطابقة.':'لا توجد فواتير مشتريات مسجلة.'}</p>}
        </>}
      </div>}

      {invoiceToCancel && <Modal title="إلغاء فاتورة المشتريات"
        description={invoiceToCancel.invoiceNumber} onClose={()=>setInvoiceToCancel(undefined)}
        footer={<button type="button" className="operation-primary" onClick={()=>{
          onDeletePurchaseInvoice?.(invoiceToCancel.id);
          setInvoiceToCancel(undefined);
        }}>تأكيد الإلغاء</button>}>
        <p>هيتم عكس أثر الفاتورة على المخزون وحساب المورد حسب حالة الشراء.</p>
      </Modal>}

      {/* ================= الوضع الثاني: إنشاء فاتورة مشتريات جديدة واختيار الأصناف ================= */}
      {viewMode === "create" && (
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
                <button type="button" className="picker-trigger" aria-haspopup="dialog" onClick={()=>setShowSupplierPicker(true)}>
                  <Search size={17} aria-hidden="true"/>
                  {suppliers.find(supplier=>supplier.id===selectedSupplierId)?.name??'اختيار مورد'}
                </button>
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
              {[{id:'all',label:'الكل'},...itemCategories.filter(c=>['raw_bean','direct_product','direct_drink','snack'].includes(c.id))].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() =>
                    setItemCategoryFilter(
                      cat.id as 'all'|ItemCategory,
                    )
                  }
                  className={`py-1.5 px-1 rounded-xl text-[10px] font-extrabold border transition ${
                    itemCategoryFilter === cat.id
                      ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
                      : "bg-[#FAF8F4] text-[#6E5D4F] border-[#E6DEC8]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button type="button" className="picker-trigger" aria-haspopup="dialog" onClick={()=>setShowItemPickerModal(true)}>
              <Search size={17} aria-hidden="true"/>اختيار صنف للفاتورة
            </button>
          </div>

          {showItemPickerModal&&<RecordPicker title="اختيار صنف للمشتريات" searchLabel="ابحث باسم الصنف أو الكود"
            options={filteredPickerItems.map(item=>({
              id:item.id,title:item.name,keywords:item.barcode,
              detail:item.code+' · الرصيد '+item.stock+' '+displayUnit(item.baseUnit),
            }))}
            onSelect={id=>{
              const item=filteredPickerItems.find(value=>value.id===id);
              if(item)addItemToCart(item);
              setShowItemPickerModal(false);
            }}
            onClose={()=>setShowItemPickerModal(false)}/>}
          {showSupplierPicker&&<RecordPicker title="اختيار المورد" searchLabel="ابحث باسم المورد أو التليفون"
            options={suppliers.map(supplier=>({id:supplier.id,title:supplier.name,detail:[supplier.address,supplier.phone].filter(Boolean).join(' · ')}))}
            selectedId={selectedSupplierId} onSelect={id=>{setSelectedSupplierId(id);setShowSupplierPicker(false);}}
            onClose={()=>setShowSupplierPicker(false)}/>}

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
                الإجمالي: {totalInvoiceAmount.toLocaleString("ar-EG")} ج.م
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
                  اختار صنف من الزر بالأعلى وحدد الكمية
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
                    newWholesalePrice,
                    updateCost,
                  } = entry;
                  const lineTotal = quantity * purchasePrice;
                  const supplierPrice = latestSupplierPrices(item.supplierPrices).find(record=>record.supplierId===selectedSupplierId);
                  const lastPrice = item.lastPurchasePrice || purchasePrice;
                  const diffPercentFromLast =
                    lastPrice > 0
                      ? Math.round(
                          ((purchasePrice - lastPrice) / lastPrice) * 100,
                        )
                      : 0;

                  const cheapestRecord =
                    item.supplierPrices.length > 0
                      ? latestSupplierPrices(item.supplierPrices).reduce(
                          (min, p) => (p.price < min.price ? p : min),
                          latestSupplierPrices(item.supplierPrices)[0],
                        )
                      : {
                          price: lastPrice,
                          supplierName: "آخر مورد مسجل",
                          date: "-",
                        };

                  const newWac = movingAverageCost(item.stock,item.costPrice,quantity,purchasePrice);

                  const unitArabic =
                    displayUnit(item.baseUnit);

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
                            سعر الشراء قبل الضريبة للـ {unitArabic}
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

                      {/* إجمالي السطر + تعديل أسعار البيع القطاعي والجملة */}
                      <div className="bg-white border border-[#E6DEC8] rounded-xl px-3 py-2 space-y-2">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-[#9E7918]" />
                            <span className="text-[11px] font-bold text-[#6E5D4F]">
                              بيع قطاعي:
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-[#6E5D4F]">
                              بيع جملة:
                            </span>
                            <input
                              type="number"
                              value={newWholesalePrice}
                              onChange={(e) =>
                                updateCartItem(item.id, {
                                  newWholesalePrice: e.target.value,
                                })
                              }
                              className="w-16 text-xs font-black text-[#1E1612] bg-[#FAF8F4] border border-[#DED6C6] rounded-lg px-2 py-0.5 text-center"
                            />
                          </div>
                        </div>
                        <div className="text-xs font-black text-[#1E1612] text-left">
                          الإجمالي: {lineTotal.toLocaleString("ar-EG")} ج.م
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
                                  ? "bg-red-100 text-red-700"
                                  : "bg-emerald-100 text-emerald-700"
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
                            متوسط التكلفة (WAC): <b>{item.costPrice} ج.م</b>
                            {updateCost && (
                              <>
                                {" ← "}
                                <b className="text-emerald-700">
                                  سيصبح {newWac} ج.م
                                </b>
                              </>
                            )}
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

                      <p className="text-xs">{supplierPrice?<>آخر سعر من المورد المحدد {money(supplierPrice.price)} ج.م · {supplierPrice.date}</>:'لسه مفيش سعر شراء مسجل للصنف عند المورد المحدد.'}</p>
                      <p className="text-xs">يتحدث متوسط التكلفة تلقائيًا مع كل شراء، دون الضريبة.</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <section className="operation-surface space-y-3">
            <p>قيمة الأصناف قبل الضريبة: {netInvoiceAmount.toLocaleString('ar-EG')} ج.م</p>
            <label className="block">الضريبة (مبلغ منفصل)
              <input aria-label="ضريبة فاتورة الشراء" type="number" min="0" step="0.01" value={taxInput} onChange={e=>setTaxInput(e.target.value)} className="border rounded-xl p-2 w-full" />
            </label>
            <p>الإجمالي شامل الضريبة: {totalInvoiceAmount.toLocaleString('ar-EG')} ج.م</p>
            <p>مدفوعة بالكامل — لا تُضاف مديونية جديدة للمورد.</p>
          </section>

          {/* شريط حفظ الفاتورة السفلي */}
          <div className="workspace-actions fixed left-0 right-0 bg-white border-t border-[#E6DEC8] p-3 flex items-center gap-2.5 z-30 mx-auto shadow-md">
            <button
              onClick={handleSave}
              disabled={cart.length === 0}
              className="flex-[2] bg-[#1E1612] hover:bg-[#2E221A] disabled:opacity-50 text-[#FBF5B7] border border-[#C59B27] font-black py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition text-xs"
            >
              <Check className="w-4 h-4 text-[#D4AF37]" />
              <span>
                مراجعة الفاتورة (
                {totalInvoiceAmount.toLocaleString("ar-EG")} ج.م)
              </span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="flex-1 bg-white border border-[#DED6C6] text-[#5C4B3E] font-bold py-3 rounded-xl hover:bg-[#FAF8F4] transition text-xs"
            >
              رجوع للفواتير
            </button>
          </div>
        </div>
      )}

      {reviewInvoice&&<Modal title="مراجعة فاتورة المشتريات" description={reviewInvoice.supplierName+' · '+reviewInvoice.date}
        busy={submitting} onClose={()=>setReviewInvoice(undefined)}
        footer={<button type="button" className="operation-primary" disabled={submitting} onClick={()=>void confirmPurchase()}>
          {submitting?'جارٍ الحفظ…':'حفظ واعتماد الفاتورة'}
        </button>}>
        <dl className="record-facts">
          <div><dt>قيمة الأصناف</dt><dd>{money(reviewInvoice.netAmount??0)} ج.م</dd></div>
          <div><dt>الضريبة</dt><dd>{money(reviewInvoice.taxAmount??0)} ج.م</dd></div>
          <div><dt>المدفوع بالكامل</dt><dd>{money(reviewInvoice.totalAmount)} ج.م</dd></div>
        </dl>
        <h3>الكميات اللي هتدخل المخزون</h3>
        <ul className="invoice-review-lines">{reviewInvoice.items.map(line=><li key={line.itemId}>
          <span>{line.itemName}</span><b>{line.quantity} {line.unit}</b>
        </li>)}</ul>
      </Modal>}
      {/* نافذة تفاصيل فاتورة مشتريات مسجلة */}
      {selectedInvoiceDetails && (
        <Modal title={<>تفاصيل فاتورة مشتريات # {selectedInvoiceDetails.invoiceNumber}</>} description={<>المورد:  {selectedInvoiceDetails.supplierName} • {" "}  {selectedInvoiceDetails.date}</>} onClose={()=>setSelectedInvoiceDetails(null)}><div className="space-y-2 max-h-60 overflow-y-auto">
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
                      الكمية: {it.quantity} {it.unit} × السعر:{" "}
                      {it.purchasePrice} ج.م
                    </div>
                  </div>
                  <div className="font-black text-[#9E7918]">
                    {(it.quantity * it.purchasePrice).toLocaleString("ar-EG")}{" "}
                    ج.م
                  </div>
                </div>
              ))}
            </div>
<div className="bg-[#1E1612] text-[#FBF5B7] rounded-2xl p-3.5 text-xs space-y-1">
              <div className="flex justify-between">
                <span>إجمالي الفاتورة:</span>
                <span className="font-black">
                  {selectedInvoiceDetails.totalAmount.toLocaleString("ar-EG")}{" "}
                  ج.م
                </span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>المدفوع للمورد:</span>
                <span className="font-black">
                  {selectedInvoiceDetails.paidAmount.toLocaleString("ar-EG")}{" "}
                  ج.م
                </span>
              </div>
              <div className="flex justify-between text-amber-400">
                <span>المتبقي آجل:</span>
                <span className="font-black">
                  {selectedInvoiceDetails.remainingAmount.toLocaleString(
                    "ar-EG",
                  )}{" "}
                  ج.م
                </span>
              </div>
            </div></Modal>
      )}

      {/* نافذة إضافة مورد جديد سريعاً من داخل الفاتورة */}
      {showNewSupplierModal && onQuickAddSupplier && (
        <Modal title={<>إضافة مورد جديد سريعاً</>}  onClose={()=>setShowNewSupplierModal(false)}><input
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
<input aria-label="عنوان المورد" placeholder="عنوان المورد" value={newSupAddress} onChange={e=>setNewSupAddress(e.target.value)} className="border rounded-xl p-2 w-full" />
<input aria-label="اسم المندوب" placeholder="اسم المندوب" value={newSupRepresentative} onChange={e=>setNewSupRepresentative(e.target.value)} className="border rounded-xl p-2 w-full" />
{supplierError&&<p role="alert">{supplierError}</p>}
<button
              onClick={() => {
                if (!newSupName.trim()) return;
                try {
                checkSupplierDetails({name:newSupName,phone:newSupPhone,address:newSupAddress,representativeName:newSupRepresentative});
                onQuickAddSupplier({
                  name: newSupName.trim(),
                  phone: newSupPhone.trim(),
                  address:newSupAddress.trim(),
                  representativeName:newSupRepresentative.trim(),
                  category: newSupCategory.trim() || "مورد خامات",
                  balance: 0,
                  totalPurchases: 0,
                  invoicesCount: 0,
                });
                setNewSupName("");
                setNewSupPhone("");
                setShowNewSupplierModal(false);
                } catch(error){setSupplierError((error as Error).message);}
              }}
              className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] py-2.5 rounded-xl text-xs font-black"
            >
              حفظ المورد
            </button></Modal>
      )}

      {/* نافذة تعريف صنف جديد للمخزن مباشرة من فاتورة المشتريات */}
      {showNewItemModal && onQuickAddItem && <ItemDefinitionModal items={items} allowedCategories={['raw_bean','direct_product','direct_drink','snack']} onSave={onQuickAddItem} onClose={()=>setShowNewItemModal(false)}/>}

      {/* نافذة مقارنة كل الموردين وأسعارهم */}
      {compareModalItem && (
        <Modal title={<>مقارنة أسعار الموردين</>} description={<>{compareModalItem.name}</>} onClose={()=>setCompareModalItem(null)}><div className="space-y-2.5">
              {compareModalItem.supplierPrices.map((sp, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    i === 0
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-[#FAF8F4] border-[#E6DEC8]"
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
                    {i === cheapestCompareIndex && (
                      <span className="text-[9px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                        الأرخص
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div></Modal>
      )}
    </div>
  );
};
