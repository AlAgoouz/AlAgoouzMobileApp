import {multiplyMoney,roundMoney,sumMoney} from '../lib/money';
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
import {ActionButton} from './ActionButton';
import {Money} from './Money';
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
import { outstandingPurchaseRefund } from '../lib/ledger';
import { parseLocalizedNumber } from '../lib/cashierRows';

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
  onReceiveRefund?: (invoiceId: string, amount: number, date: string) => Promise<void>;
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
  onReceiveRefund,
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
  const [refundInvoiceId, setRefundInvoiceId] = useState<string>();
  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState('');
  const [refundError, setRefundError] = useState('');
  const [receivingRefund, setReceivingRefund] = useState(false);
  const refundInvoice = purchaseInvoices.find(invoice => invoice.id === refundInvoiceId);
  const refundBalance = refundInvoice ? outstandingPurchaseRefund(refundInvoice) : 0;

  const receiveRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!refundInvoice || !onReceiveRefund || receivingRefund) return;
    const amount = parseLocalizedNumber(refundAmount);
    if (amount === undefined || amount <= 0 || amount > refundBalance) {
      setRefundError('أدخل مبلغًا موجبًا لا يتجاوز المتبقي للاسترداد.');
      return;
    }
    setReceivingRefund(true);
    setRefundError('');
    try {
      await onReceiveRefund(refundInvoice.id, amount, refundDate);
      setRefundInvoiceId(undefined);
    } catch (error) {
      setRefundError(error instanceof Error ? error.message : 'تعذر تأكيد الاستلام.');
    } finally {
      setReceivingRefund(false);
    }
  };

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

  const netInvoiceAmount = useMemo(()=>{
    try{return sumMoney(cart.map(line=>multiplyMoney(line.quantity,line.purchasePrice)));}
    catch{return NaN;}
  },[cart]);

  let totalInvoiceAmount=NaN;
  if(Number.isFinite(netInvoiceAmount)){
    try{totalInvoiceAmount=roundMoney(netInvoiceAmount+(Number.isFinite(taxAmount)?taxAmount:0));}
    catch{/* Approval reports invalid totals. */}
  }

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
    if(!Number.isFinite(totalInvoiceAmount)){
      setInvoiceError('إجمالي الفاتورة خارج النطاق المسموح؛ راجع الكمية والسعر.');
      return;
    }
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
    <div className="operation-screen min-h-screen pb-28 flex flex-col">
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
            type="button"
            onClick={handleStartNewInvoice}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>فاتورة جديدة</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setViewMode("list")}
          >
            الفواتير ({purchaseInvoices.length})
          </button>
        )}</OperationHeader>
      {invoiceError && (
        <p role="alert" className="text-status-danger bg-status-danger-bg border border-status-danger-line rounded-md p-3 mx-4 mt-2 font-bold">
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
          {title:'الحالة',render:inv=>inv.isCancelled
            ? outstandingPurchaseRefund(inv)>0
              ? <>ملغاة · متبقي للاسترداد {money(outstandingPurchaseRefund(inv))} ج.م</>
              : inv.refundDue ? 'ملغاة · استُردّ المبلغ' : 'ملغاة'
            : inv.remainingAmount>0?<>متبقي {money(inv.remainingAmount)} ج.م</>:'مدفوعة بالكامل'},
          {title:'الإجراءات',render:inv=><div className="register-actions">
            <button type="button" className="record-action" onClick={()=>setSelectedInvoiceDetails(inv)}>عرض تفاصيل الفاتورة</button>
            {onDeletePurchaseInvoice&&!inv.isCancelled&&<button type="button" className="record-action text-red-700" onClick={()=>setInvoiceToCancel(inv)}>إلغاء</button>}
            {onReceiveRefund&&inv.isCancelled&&outstandingPurchaseRefund(inv)>0&&
              <button type="button" className="record-action" onClick={()=>{
                setRefundInvoiceId(inv.id);
                setRefundAmount(String(outstandingPurchaseRefund(inv)));
                setRefundDate(businessDate());
                setRefundError('');
              }}>تسجيل استرداد</button>}
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

      {refundInvoice && <Modal title="استلام استرداد من المورد" description={refundInvoice.invoiceNumber}
        busy={receivingRefund} onClose={()=>setRefundInvoiceId(undefined)}>
        <form className="operation-fields" onSubmit={receiveRefund}>
          <p>المتبقي للاسترداد <Money value={refundBalance}/></p>
          <label>المبلغ المستلم
            <input className="operation-input" required inputMode="decimal" value={refundAmount}
              disabled={receivingRefund} onChange={event=>setRefundAmount(event.target.value)}/>
          </label>
          <label>تاريخ الاستلام
            <input className="operation-input" required type="date" value={refundDate} max={businessDate()}
              disabled={receivingRefund} onChange={event=>setRefundDate(event.target.value)}/>
          </label>
          {refundError&&<p role="alert">{refundError}</p>}
          <ActionButton type="submit" disabled={receivingRefund||refundBalance<=0}>تأكيد الاستلام</ActionButton>
        </form>
      </Modal>}

      {/* ================= الوضع الثاني: إنشاء فاتورة مشتريات جديدة واختيار الأصناف ================= */}
      {viewMode === "create" && (
        <div className="record-workspace flex-1">
          <div className="workspace-split-layout">
            <div className="space-y-3.5 min-w-0">
              {/* الخطوة 1: اختيار المورد وتاريخ الفاتورة */}
              <section className="operation-surface space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-black text-ink-strong flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-gold" aria-hidden="true" />
                    <span>1. بيانات المورد وتاريخ الفاتورة</span>
                  </span>
                  {onQuickAddSupplier && (
                    <button
                      type="button"
                      onClick={() => setShowNewSupplierModal(true)}
                      className="action-button"
                    >
                      <UserPlus className="w-4 h-4 text-gold" aria-hidden="true" />
                      <span>+ مورد جديد</span>
                    </button>
                  )}
                </div>

                <div className="operation-fields">
                  <div className="invoice-choice">
                    <span>اختر المورد</span>
                    <button type="button" className="picker-trigger" aria-haspopup="dialog" onClick={()=>setShowSupplierPicker(true)}>
                      <Search size={17} aria-hidden="true"/>
                      {suppliers.find(supplier=>supplier.id===selectedSupplierId)?.name??'اختيار مورد'}
                    </button>
                  </div>

                  <label>
                    التاريخ
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="operation-input font-black"
                    />
                  </label>
                </div>
              </section>

              {/* الخطوة 2: اختيار الأصناف لإضافتها في الفاتورة */}
              <section className="operation-surface space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-black text-ink-strong flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-gold" aria-hidden="true" />
                    <span>2. اختر الأصناف لإضافتها للفاتورة</span>
                  </span>
                  {onQuickAddItem && (
                    <button
                      type="button"
                      onClick={() => setShowNewItemModal(true)}
                      className="action-button"
                    >
                      <Plus className="w-4 h-4 text-gold" aria-hidden="true" />
                      <span>تعريف صنف جديد</span>
                    </button>
                  )}
                </div>

                {/* تبويبات تصفية الأصناف */}
                <div className="filter-pills" aria-label="تصفية أصناف المشتريات">
                  {[{id:'all',label:'الكل'},...itemCategories.filter(c=>['raw_bean','direct_product','direct_drink','snack'].includes(c.id))].map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      aria-pressed={itemCategoryFilter === cat.id}
                      onClick={() =>
                        setItemCategoryFilter(
                          cat.id as 'all'|ItemCategory,
                        )
                      }
                      className="filter-pill"
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <button type="button" className="picker-trigger" aria-haspopup="dialog" onClick={()=>setShowItemPickerModal(true)}>
                  <Search size={17} aria-hidden="true"/>اختيار صنف للفاتورة
                </button>
              </section>

              <section className="operation-surface space-y-3">
                <dl className="record-facts mb-0">
                  <div>
                    <dt>قيمة الأصناف قبل الضريبة</dt>
                    <dd>{netInvoiceAmount.toLocaleString('ar-EG')} ج.م</dd>
                  </div>
                  <div>
                    <dt>الإجمالي شامل الضريبة</dt>
                    <dd className="text-gold">{totalInvoiceAmount.toLocaleString('ar-EG')} ج.م</dd>
                  </div>
                </dl>
                <label className="block">الضريبة (مبلغ منفصل)
                  <input aria-label="ضريبة فاتورة الشراء" type="number" min="0" step="0.01" value={taxInput} onChange={e=>setTaxInput(e.target.value)} className="operation-input font-black" />
                </label>
                <p className="operation-note">مدفوعة بالكامل — لا تُضاف مديونية جديدة للمورد.</p>
              </section>
            </div>

            <div className="space-y-3.5 min-w-0">
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
                <div className="bg-status-danger-bg border border-status-danger-line rounded-lg p-3.5 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-md bg-white text-status-danger border border-status-danger-line flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-status-danger">
                        تنبيه: {higherThanCheapestCount} صنف بسعر أعلى من أرخص مورد
                        مسجل
                      </div>
                      <div className="text-xs text-status-danger/85 font-semibold">
                        راجع مقارنة الموردين بالأسفل للحفاظ على تكلفة التوليفات
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* الخطوة 3: الأصناف المختارة داخل الفاتورة وتحديد الكميات والأسعار */}
              <section className="operation-surface space-y-4">
                <div className="flex items-center justify-between border-b border-line-subtle pb-2.5">
                  <span className="text-xs font-black text-ink-strong">
                    3. بنود فاتورة المشتريات ({cart.length} أصناف)
                  </span>
                  <span className="text-xs font-black text-gold">
                    الإجمالي: {totalInvoiceAmount.toLocaleString("ar-EG")} ج.م
                  </span>
                </div>

                {cart.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <div className="w-12 h-12 rounded-lg bg-surface-sunken border border-line text-gold flex items-center justify-center mx-auto">
                      <ShoppingBag className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="text-xs font-extrabold text-ink-strong">
                      الفاتورة فارغة حالياً
                    </div>
                    <div className="text-xs text-ink">
                      اختار صنف من الزر بالأعلى وحدد الكمية والسعر
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5">
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
                      const controlId = 'purchase-' + item.id;

                      return (
                        <article
                          key={item.id}
                          className="record-card space-y-3 bg-surface-sunken"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-black text-ink-strong">
                              {item.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeCartItem(item.id)}
                              className="action-button text-status-danger border-status-danger-line"
                              aria-label={"حذف " + item.name + " من الفاتورة"}
                              title="حذف الصنف من الفاتورة"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>

                          {/* السعر والكمية والإجمالي */}
                          <div className="operation-fields">
                            <div className="bg-surface-card border border-line rounded-md px-3 py-2">
                              <label htmlFor={controlId + "-price"} className="purchase-field-label">
                                سعر الشراء قبل الضريبة للـ {unitArabic}
                              </label>
                              <div className="flex items-center gap-1 mt-1">
                                <Edit3 className="w-3.5 h-3.5 text-gold shrink-0" aria-hidden="true" />
                                <input
                                  id={controlId + "-price"}
                                  name="purchase-price"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  value={purchasePrice}
                                  onChange={(e) =>
                                    updateCartItem(item.id, {
                                      purchasePrice: Math.max(
                                        0,
                                        parseFloat(e.target.value) || 0,
                                      ),
                                    })
                                  }
                                  className="w-full text-sm font-black text-ink-strong bg-transparent"
                                />
                                <span className="text-xs text-ink font-bold">
                                  ج.م
                                </span>
                              </div>
                            </div>

                            <div className="bg-surface-card border border-line rounded-md px-3 py-2">
                              <label htmlFor={controlId + "-quantity"} className="purchase-field-label">
                                الكمية المشتراة ({unitArabic})
                              </label>
                              <div className="flex items-center justify-between gap-1 mt-1">
                                <button
                                  type="button"
                                  aria-label={"تقليل كمية " + item.name}
                                  onClick={() =>
                                    updateCartItem(item.id, {
                                      quantity: Math.max(
                                        0.5,
                                        Number((quantity - 1).toFixed(2)),
                                      ),
                                    })
                                  }
                                  className="min-w-[40px] min-h-[40px] rounded-sm bg-surface-sunken border border-line text-ink-strong flex items-center justify-center"
                                >
                                  <Minus className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <input
                                  id={controlId + "-quantity"}
                                  name="purchase-quantity"
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  min="0.1"
                                  value={quantity}
                                  onChange={(e) =>
                                    updateCartItem(item.id, {
                                      quantity: Math.max(
                                        0.1,
                                        parseFloat(e.target.value) || 0.1,
                                      ),
                                    })
                                  }
                                  className="w-16 text-center font-black text-sm text-ink-strong bg-transparent"
                                />
                                <button
                                  type="button"
                                  aria-label={"زيادة كمية " + item.name}
                                  onClick={() =>
                                    updateCartItem(item.id, {
                                      quantity: Number((quantity + 1).toFixed(2)),
                                    })
                                  }
                                  className="min-w-[40px] min-h-[40px] rounded-sm bg-espresso text-gold-highlight flex items-center justify-center"
                                >
                                  <Plus className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* إجمالي السطر + تعديل أسعار البيع القطاعي والجملة */}
                          <div className="bg-surface-card border border-line rounded-md px-3 py-2 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="flex items-center gap-1.5 text-xs font-bold text-ink">
                                <Tag className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
                                <span>بيع قطاعي:</span>
                                <input
                                  type="number"
                                  value={newRetailPrice}
                                  onChange={(e) =>
                                    updateCartItem(item.id, {
                                      newRetailPrice: e.target.value,
                                    })
                                  }
                                  className="w-20 text-xs font-black text-ink-strong bg-surface-sunken border border-line-control rounded-sm px-2 py-1 text-center"
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-xs font-bold text-ink">
                                <span>بيع جملة:</span>
                                <input
                                  type="number"
                                  value={newWholesalePrice}
                                  onChange={(e) =>
                                    updateCartItem(item.id, {
                                      newWholesalePrice: e.target.value,
                                    })
                                  }
                                  className="w-20 text-xs font-black text-ink-strong bg-surface-sunken border border-line-control rounded-sm px-2 py-1 text-center"
                                />
                              </label>
                            </div>
                            <div className="text-xs font-black text-ink-strong text-left">
                              الإجمالي: {lineTotal.toLocaleString("ar-EG")} ج.م
                            </div>
                          </div>

                          {/* ملخص مقارنة الموردين ومتوسط التكلفة الجديد (WAC) */}
                          <div className="rounded-md border border-gold-edge/50 bg-gold-tint p-2.5 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between text-ink">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
                                آخر شراء: <b>{lastPrice} ج.م</b>
                              </span>
                              {diffPercentFromLast !== 0 && (
                                <span
                                  className={`record-badge font-black ${
                                    diffPercentFromLast > 0
                                      ? "bg-status-danger-bg text-status-danger border-status-danger-line"
                                      : "bg-status-ok-bg text-status-ok border-status-ok-line"
                                  }`}
                                >
                                  {diffPercentFromLast > 0
                                    ? `▲ +${diffPercentFromLast}%`
                                    : `▼ ${diffPercentFromLast}%`}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-ink flex-wrap gap-1">
                              <span>
                                متوسط التكلفة (WAC): <b>{item.costPrice} ج.م</b>
                                {updateCost && (
                                  <>
                                    {" ← "}
                                    <b className="text-status-ok">
                                      سيصبح {newWac} ج.م
                                    </b>
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => setCompareModalItem(item)}
                                className="font-black text-gold underline min-h-[36px]"
                              >
                                مقارنة الموردين
                              </button>
                            </div>

                            <div className="text-xs text-status-ok font-bold">
                              🏷️ أرخص مورد: {cheapestRecord.price} ج.م (
                              {cheapestRecord.supplierName})
                            </div>
                          </div>

                          <p className="text-xs text-ink">{supplierPrice?<>آخر سعر من المورد المحدد {money(supplierPrice.price)} ج.م · {supplierPrice.date}</>:'لسه مفيش سعر شراء مسجل للصنف عند المورد المحدد.'}</p>
                          <p className="text-xs text-ink-faint">يتحدث متوسط التكلفة تلقائيًا مع كل شراء، دون الضريبة.</p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>

          <footer className="operation-surface operation-form-footer action-bar">
            <ActionButton onClick={handleSave} disabled={cart.length === 0} variant="primary">
              <Check size={16} aria-hidden="true"/>
              <span>مراجعة الفاتورة (<Money value={totalInvoiceAmount}/>)</span>
            </ActionButton>
            <ActionButton onClick={() => setViewMode('list')}>رجوع للفواتير</ActionButton>
          </footer>
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
        <Modal title={<>تفاصيل فاتورة مشتريات # {selectedInvoiceDetails.invoiceNumber}</>} description={<>المورد: {selectedInvoiceDetails.supplierName} • {selectedInvoiceDetails.date}</>} onClose={()=>setSelectedInvoiceDetails(null)}><div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedInvoiceDetails.items.map((it, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-md bg-surface-sunken border border-line flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-black text-ink-strong">
                      {it.itemName}
                    </div>
                    <div className="text-xs text-ink">
                      الكمية: {it.quantity} {it.unit} × السعر:{" "}
                      {it.purchasePrice} ج.م
                    </div>
                  </div>
                  <div className="font-black text-gold">
                    {(it.quantity * it.purchasePrice).toLocaleString("ar-EG")}{" "}
                    ج.م
                  </div>
                </div>
              ))}
            </div>
<div className="summary-banner-dark text-xs space-y-1">
              <div className="flex justify-between">
                <span>إجمالي الفاتورة:</span>
                <span className="font-black text-gold-highlight">
                  {selectedInvoiceDetails.totalAmount.toLocaleString("ar-EG")}{" "}
                  ج.م
                </span>
              </div>
              <div className="flex justify-between text-emerald-300">
                <span>المدفوع للمورد:</span>
                <span className="font-black">
                  {selectedInvoiceDetails.paidAmount.toLocaleString("ar-EG")}{" "}
                  ج.م
                </span>
              </div>
              <div className="flex justify-between text-amber-300">
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
        <Modal title={<>إضافة مورد جديد سريعاً</>} onClose={()=>setShowNewSupplierModal(false)}><input
              type="text"
              aria-label="اسم المورد أو الشركة"
              value={newSupName}
              onChange={(e) => setNewSupName(e.target.value)}
              placeholder="اسم المورد أو الشركة"
              className="operation-input font-bold"
            />
<input
              type="text"
              aria-label="رقم الموبايل"
              value={newSupPhone}
              onChange={(e) => setNewSupPhone(e.target.value)}
              placeholder="رقم الموبايل"
              className="operation-input font-bold"
            />
<input
              type="text"
              aria-label="تخصص المورد"
              value={newSupCategory}
              onChange={(e) => setNewSupCategory(e.target.value)}
              placeholder="التخصص (مثلاً: بن أخضر، حبهان، أكواب...)"
              className="operation-input font-bold"
            />
<input aria-label="عنوان المورد" placeholder="عنوان المورد" value={newSupAddress} onChange={e=>setNewSupAddress(e.target.value)} className="operation-input" />
<input aria-label="اسم المندوب" placeholder="اسم المندوب" value={newSupRepresentative} onChange={e=>setNewSupRepresentative(e.target.value)} className="operation-input" />
{supplierError&&<p role="alert" className="field-error">{supplierError}</p>}
<button
              type="button"
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
              className="operation-primary w-full"
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
                  className={`p-3 rounded-md border flex items-center justify-between ${
                    i === cheapestCompareIndex
                      ? "bg-status-ok-bg border-status-ok-line"
                      : "bg-surface-sunken border-line"
                  }`}
                >
                  <div>
                    <div className="text-xs font-black text-ink-strong">
                      {sp.supplierName}
                    </div>
                    <div className="text-xs text-ink">
                      تاريخ آخر توريد: {sp.date}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-black text-status-ok">
                      {sp.price} ج.م
                    </div>
                    {i === cheapestCompareIndex && (
                      <span className="record-badge bg-status-ok text-white border-status-ok">
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
