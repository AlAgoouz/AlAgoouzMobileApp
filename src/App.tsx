import {SectionsHub} from './components/SectionsHub';
import type {QueuedCashierReport} from './components/CashierDayScreen';
import {attachCashierReport,approveCashierDay,salesForReports} from './lib/cashierDays';
import {isStockItem} from './lib/itemPolicy';
import React, { useState, useEffect, useMemo } from "react";
import {
  Settings,
  LayoutGrid,
  Search,
  AlertTriangle,
  ChevronLeft,
  Calculator,
  FileText,
  Package,
  ShoppingBag,
  Truck,
  Users,
  RotateCcw,
  BarChart3,
  Calendar,
  TrendingUp,
  Lock,
  Unlock,
  Flame,
  FolderSync,
  Sparkles,
  CheckCircle2,
  LogOut,
  Home,
  ShieldCheck,
  Scale,
  UserCheck,
  Trash2,
  Tag,
} from "lucide-react";
import {
  InventoryItem,
  ProductionBatch,
  PurchaseInvoice,
  SalesInvoice,
  SalesInvoiceItem,
  Supplier,
  Partner,
  AuditLogEntry,
  RecipeIngredient,
  Employee,
  EmployeeTransaction,
  StocktakingAuditRecord,
  StocktakingItemVariance,
} from "./types/erp";
import { recalculateRecipeCosts } from "./lib/itemCosts";
import {
  checkPurchase,
  prepareSale,
  checkStocktaking,
} from "./lib/operationChecks";

import { getSupabaseClient, getSupabaseCredentials } from "./lib/supabaseSync";
import { useErpStore } from "./hooks/useErpStore";
import { parseBackup, createBackup, type StoreState } from "./lib/storeState";
import { deductInventory, productionNeeds } from "./lib/inventory";
import {
  reversePayment,
  returnSale,
  recordPayment,
  cancelPurchase,
  recordExpense,
  cancelExpense,
  operatingExpenses,
} from "./lib/ledger";
import { businessDate } from "./lib/dates";
import { recordEmployeeAction, reverseEmployeeAction, closePayrollPeriod, currentPayrollPeriod } from './lib/payroll';
import { adjustCatalogItem, canDeleteCatalogItem } from './lib/catalogAdjustments';
import {checkCustomerDetails,checkSupplierDetails} from './lib/contactDetails';
import {receiveStock} from './lib/costing';
import {
  downloadFullBackupJson,
  exportFullStoreExcel,
} from "./lib/backupExport";

const WholesaleInvoiceScreen=React.lazy(()=>import('./components/WholesaleInvoiceScreen').then(m=>({default:m.WholesaleInvoiceScreen})));
const CashierDayScreen=React.lazy(()=>import('./components/CashierDayScreen').then(m=>({default:m.CashierDayScreen})));

const unloadedPartner: Partner = {
  id: "",
  username: "",
  name: "",
  role: "",
  avatarLetter: "",
  phone: "",
  sharePercent: 0,
  totalPaidFromPocket: 0,
  totalWithdrawals: 0,
};

// صافي مستحقات العامل (نفس معادلة شاشة شؤون العمال) لمحاربة تجاوز الصرف
// ترقيم مسلسل فريد لا يتكرر حتى بعد حذف سجلات قديمة (خطأ تكرار PRD/AUD القديم)
function nextSequentialNumber(
  existing: string[],
  prefix: string,
  startFrom: number,
): string {
  const suffixes = existing
    .map((value) => Number(value.match(/(\d+)$/)?.[1]))
    .filter((n) => Number.isFinite(n));
  const next = suffixes.reduce((max, value) => Math.max(max, value), startFrom) + 1;
  return `${prefix}-${next}`;
}
// التحقق من الأرقام عند التعريف/التحديث: أرقام صالحة وغير سالبة
function hasInvalidNumbers(values: (number | undefined)[]): boolean {
  return values.some((v) => v !== undefined && (!Number.isFinite(v) || v < 0));
}

const PasswordRecoveryScreen = React.lazy(() => import('./components/PasswordRecoveryScreen').then((module)=>({default:module.PasswordRecoveryScreen})));
const LoginScreen = React.lazy(() =>
  import("./components/LoginScreen").then((module) => ({
    default: module.LoginScreen,
  })),
);

const PurchaseScreen = React.lazy(() =>
  import("./components/PurchaseScreen").then((module) => ({
    default: module.PurchaseScreen,
  })),
);

const ProductionAndRecipesScreen = React.lazy(() =>
  import("./components/ProductionAndRecipesScreen").then((module) => ({
    default: module.ProductionAndRecipesScreen,
  })),
);

const SmartInsightsScreen = React.lazy(() =>
  import("./components/ReportsAndInsightsScreens").then((module) => ({
    default: module.SmartInsightsScreen,
  })),
);
const ProfitReportsScreen = React.lazy(() =>
  import("./components/ReportsAndInsightsScreens").then((module) => ({
    default: module.ProfitReportsScreen,
  })),
);

const ProductsCatalogScreen = React.lazy(() =>
  import("./components/ManagementScreens").then((module) => ({
    default: module.ProductsCatalogScreen,
  })),
);
const InventoryScreen = React.lazy(() =>
  import("./components/ManagementScreens").then((module) => ({
    default: module.InventoryScreen,
  })),
);
const ShortagesScreen = React.lazy(() =>
  import("./components/ManagementScreens").then((module) => ({
    default: module.ShortagesScreen,
  })),
);
const SuppliersAndCustomersScreen = React.lazy(() =>
  import("./components/ManagementScreens").then((module) => ({
    default: module.SuppliersAndCustomersScreen,
  })),
);
const SalesInvoicesAndReturnsScreen = React.lazy(() =>
  import("./components/ManagementScreens").then((module) => ({
    default: module.SalesInvoicesAndReturnsScreen,
  })),
);
const MoreMenuScreen = React.lazy(() =>
  import("./components/ManagementScreens").then((module) => ({
    default: module.MoreMenuScreen,
  })),
);

const StocktakingScreen = React.lazy(() =>
  import("./components/StocktakingAndStaffScreens").then((module) => ({
    default: module.StocktakingScreen,
  })),
);
const StaffAndPayrollScreen = React.lazy(() =>
  import("./components/StocktakingAndStaffScreens").then((module) => ({
    default: module.StaffAndPayrollScreen,
  })),
);

const InvoiceReceiptModal = React.lazy(() =>
  import("./components/ReceiptAndStatementModals").then((module) => ({
    default: module.InvoiceReceiptModal,
  })),
);

export default function App() {
  const [activeScreen, setActiveScreen] = useState<string>("home");
  const [moreInitialTab, setMoreInitialTab] = useState<
    "menu" | "data_control" | "expenses" | "partners" | "cloud"
  >("menu");
  const [hideProfits, setHideProfits] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [toastNotification, setToastNotification] = useState<string | null>(
    null,
  );

  const cloud = useErpStore();
  const { engine, member } = cloud;
  const confirmSave=async()=>{await engine.flush();if(engine.snapshot.status!=='ready')throw Error(engine.snapshot.error||'لم يصل تأكيد اعتماد العملية؛ راجع حالة الحفظ');};
  const loggedPartnerId = member?.partnerId ?? null;
  const {
    items,
    productionBatches,
    purchaseInvoices,
    salesInvoices,
    cashierDays,
    suppliers,
    customers,
    expenses,
    partners,
    auditLogs,
    employees,
    employeeTransactions,
    stocktakingRecords,
    accountPayments,
  } = cloud.state;
  const reportSales=useMemo(()=>salesForReports({salesInvoices,cashierDays}),[salesInvoices,cashierDays]);
  const currentPartner =
    partners.find((p) => p.id === loggedPartnerId) || unloadedPartner;
  const safeAction = (action: () => void) => {
    try {
      engine.transaction(action);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
      return false;
    }
  };
  const setItems = (
    next:
      | StoreState["items"]
      | ((previous: StoreState["items"]) => StoreState["items"]),
  ) => engine.field("items", next);
  const setProductionBatches = (
    next:
      | StoreState["productionBatches"]
      | ((
          previous: StoreState["productionBatches"],
        ) => StoreState["productionBatches"]),
  ) => engine.field("productionBatches", next);
  const setPurchaseInvoices = (
    next:
      | StoreState["purchaseInvoices"]
      | ((
          previous: StoreState["purchaseInvoices"],
        ) => StoreState["purchaseInvoices"]),
  ) => engine.field("purchaseInvoices", next);
  const setSalesInvoices = (
    next:
      | StoreState["salesInvoices"]
      | ((
          previous: StoreState["salesInvoices"],
        ) => StoreState["salesInvoices"]),
  ) => engine.field("salesInvoices", next);
  const setSuppliers = (
    next:
      | StoreState["suppliers"]
      | ((previous: StoreState["suppliers"]) => StoreState["suppliers"]),
  ) => engine.field("suppliers", next);
  const setCustomers = (
    next:
      | StoreState["customers"]
      | ((previous: StoreState["customers"]) => StoreState["customers"]),
  ) => engine.field("customers", next);
  const setExpenses = (
    next:
      | StoreState["expenses"]
      | ((previous: StoreState["expenses"]) => StoreState["expenses"]),
  ) => engine.field("expenses", next);
  const setPartners = (
    next:
      | StoreState["partners"]
      | ((previous: StoreState["partners"]) => StoreState["partners"]),
  ) => engine.field("partners", next);
  const setAuditLogs = (
    next:
      | StoreState["auditLogs"]
      | ((previous: StoreState["auditLogs"]) => StoreState["auditLogs"]),
  ) => engine.field("auditLogs", next);
  const setEmployees = (
    next:
      | StoreState["employees"]
      | ((previous: StoreState["employees"]) => StoreState["employees"]),
  ) => engine.field("employees", next);
  const setEmployeeTransactions = (
    next:
      | StoreState["employeeTransactions"]
      | ((
          previous: StoreState["employeeTransactions"],
        ) => StoreState["employeeTransactions"]),
  ) => engine.field("employeeTransactions", next);
  const setStocktakingRecords = (
    next:
      | StoreState["stocktakingRecords"]
      | ((
          previous: StoreState["stocktakingRecords"],
        ) => StoreState["stocktakingRecords"]),
  ) => engine.field("stocktakingRecords", next);
  const setAccountPayments = (
    next:
      | StoreState["accountPayments"]
      | ((
          previous: StoreState["accountPayments"],
        ) => StoreState["accountPayments"]),
  ) => engine.field("accountPayments", next);

  const [receiptModalInvoice, setReceiptModalInvoice] =
    useState<SalesInvoice | null>(null);

  const showToast = (msg: string) => {
    setToastNotification(msg);
    setTimeout(() => {
      setToastNotification((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const [queueError, setQueueError] = useState("");
  const queueBusy = React.useRef(false);
  const [queuedReports,setQueuedReports]=useState<QueuedCashierReport[]>([]);
  useEffect(() => {
    if (!member) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let disposed = false;
    const processPending = async () => {
      if (disposed || queueBusy.current || engine.snapshot.status !== "ready")
        return;
      queueBusy.current = true;
      try {
        const { data, error } = await sb
          .from("cashier_sync_queue")
          .select("id,file_name,sale_date,raw_rows,content_hash")
          .eq("processed", false)
          .order("created_at")
          .limit(20);
        if (error) throw new Error("تعذر قراءة الملفات المعلقة للكاشير");
        if(!disposed){setQueuedReports(previous=>previous.length===data?.length&&previous.every((r,i)=>r.id===data[i].id&&r.content_hash===data[i].content_hash)?previous:data??[]);setQueueError('');}
      } catch (error) {
        if (!disposed)
          setQueueError(
            error instanceof Error ? error.message : "تعذر معالجة ملف الكاشير",
          );
      } finally {
        queueBusy.current = false;
      }
    };
    const channel = sb
      .channel("erp-cashier-v4")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cashier_sync_queue" },
        () => {
          void processPending();
        },
      )
      .subscribe();
    const timer = setInterval(() => {
      void processPending();
    }, 10000);
    void processPending();
    window.addEventListener("online", processPending);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("online", processPending);
      void sb.removeChannel(channel);
    };
  }, [member?.userId, engine]);

  const addAuditLog = (
    actionType: AuditLogEntry["actionType"],
    description: string,
    amount?: number,
    customActor?: string,
  ) => {
    const entry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorId: member?.userId,
      partnerName: customActor || currentPartner.name,
      actionType,
      description,
      amount,
    };
    setAuditLogs((prev) => [entry, ...prev]);
  };

  const handleLogout = () => {
    void cloud.signOut().catch((error) => showToast(error.message));
  };

  // إعادة حساب تكلفة جميع التوليفات والمشروبات التي لها وصفة بناءً على أحدث تكلفة للخامات
  const recalculateAllRecipeCosts = recalculateRecipeCosts;

  // 1. تنفيذ أمر إنتاج وتخليط توليفة في قسم الإنتاج
  const handleExecuteProduction = (
    blendId: string,
    quantityKg: number,
    notes: string,
  ): { ok: boolean; message: string } => {
    const blend = items.find((i) => i.id === blendId);
    if (!blend || !blend.recipe || blend.recipe.length === 0) {
      return { ok: false, message: "هذه التوليفة ليس لها وصفة محددة بعد." };
    }

    let needs: Map<string, number>;
    try {
      needs = productionNeeds(blend, quantityKg, engine.snapshot.state.items);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }

    const consumedDetails: ProductionBatch["ingredientsConsumed"] = [];
    let totalBatchCost = 0;

    const updatedCatalog = items.map((item) => {
      const needed = needs.get(item.id);
      if (needed !== undefined) {
        const usedInBase = Number(needed.toFixed(6));
        const ingCost = Number((usedInBase * item.costPrice).toFixed(2));
        totalBatchCost += ingCost;
        consumedDetails.push({
          ingredientId: item.id,
          ingredientName: item.name,
          quantityUsed: usedInBase,
          displayQuantity:
            item.baseUnit === "kg"
              ? `${usedInBase} كجم (${Math.round(usedInBase * 1000)} جم)`
              : `${usedInBase} قطعة`,
          cost: ingCost,
        });
        return {
          ...item,
          stock: Number((item.stock - usedInBase).toFixed(6)),
        };
      }
      return item;
    });

    const unitCostPerKg = Number((totalBatchCost / quantityKg).toFixed(2));

    const batchId = crypto.randomUUID();
    const finalCatalog = updatedCatalog.map((item) => {
      if (item.id === blendId) {
        return receiveStock(item, quantityKg, unitCostPerKg, {id:batchId,date:businessDate(),type:'production'});
      }
      return item;
    });

    const newBatch: ProductionBatch = {
      id: batchId,
      batchNumber: nextSequentialNumber(
        productionBatches.map((b) => b.batchNumber),
        "PRD-2026",
        15,
      ),
      date: businessDate(),
      blendId: blend.id,
      blendName: blend.name,
      quantityProducedKg: quantityKg,
      unitCostPerKg,
      totalBatchCost: Number(totalBatchCost.toFixed(2)),
      ingredientsConsumed: consumedDetails,
      partnerName: currentPartner.name,
      notes,
    };

    setItems(recalculateAllRecipeCosts(finalCatalog));
    setProductionBatches((prev) => [newBatch, ...prev]);
    addAuditLog(
      "إنتاج توليفة",
      `تم تصنيع ${quantityKg} كجم من (${blend.name}) وسحب الحبوب الخام والتحويجة من المخزن وإضافتها لرصيد التوليفة`,
      totalBatchCost,
    );
    showToast(
      `✅ تم تصنيع ${quantityKg} كجم من (${blend.name}) وإضافتها لرصيد المخزن بنجاح!`,
    );
    return {
      ok: true,
      message: `تم سحب الخامات من المخزن وإضافة ${quantityKg} كجم (${
        quantityKg * 1000
      } جرام) إلى رصيد (${blend.name}) بنجاح!`,
    };
  };

  // 2. حفظ فاتورة شراء جديدة وتحديث متوسط التكلفة المرجح (WAC) والوصفات
  const handleSavePurchase = (
    invoiceData: Omit<PurchaseInvoice, "id" | "invoiceNumber">,
  ) => {
    invoiceData = {...invoiceData, accountingVersion:2};
    const supplier=engine.state.suppliers.find(s=>s.id===invoiceData.supplierId);
    if(!supplier)throw Error('اختر موردًا مسجلًا');
    checkSupplierDetails(supplier);
    invoiceData={...invoiceData,supplierName:supplier.name};
    checkPurchase(invoiceData, engine.snapshot.state.items);
    if (
      !invoiceData.items.length ||
      invoiceData.items.some(
        (l) =>
          !Number.isFinite(l.quantity) ||
          l.quantity <= 0 ||
          !Number.isFinite(l.purchasePrice) ||
          l.purchasePrice < 0 ||
          (l.newRetailPrice !== undefined &&
            (!Number.isFinite(l.newRetailPrice) || l.newRetailPrice < 0)) ||
          (l.newWholesalePrice !== undefined &&
            (!Number.isFinite(l.newWholesalePrice) || l.newWholesalePrice < 0)),
      ) ||
      !Number.isFinite(invoiceData.totalAmount) ||
      invoiceData.totalAmount < 0 ||
      !Number.isFinite(invoiceData.paidAmount) ||
      invoiceData.paidAmount < 0 ||
      !Number.isFinite(invoiceData.remainingAmount) ||
      invoiceData.remainingAmount < 0 ||
      !suppliers.some((s) => s.id === invoiceData.supplierId)
    )
      throw new Error(
        "راجع الأصناف والكميات والأسعار والمورد والمبالغ قبل حفظ الفاتورة",
      );
    const invNum = `PUR-${crypto.randomUUID().slice(0, 8)}`;
    const newInvoice: PurchaseInvoice = {
      ...invoiceData,
      id: crypto.randomUUID(),
      invoiceNumber: invNum,
      createdAt: new Date().toISOString(),
      inventoryBefore: items
        .filter((i) => invoiceData.items.some((l) => l.itemId === i.id))
        .map((i) => structuredClone(i)),
    };

    const nextItems = items.map((item) => {
      const purchasedLine = invoiceData.items.find((l) => l.itemId === item.id);
      if (!purchasedLine) return item;

      const received = receiveStock(item,purchasedLine.quantity,purchasedLine.purchasePrice,{id:newInvoice.id,date:invoiceData.date,type:'purchase'});

      const updatedSupplierPrices = [
        {
          supplierId: invoiceData.supplierId,
          supplierName: invoiceData.supplierName,
          price: purchasedLine.purchasePrice,
          date: invoiceData.date,
          invoiceId: invNum,
        },
        ...item.supplierPrices,
      ];

      return {
        ...received,
        lastPurchasePrice: purchasedLine.purchasePrice,
        retailPrice: purchasedLine.newRetailPrice ?? item.retailPrice,
        wholesalePrice: purchasedLine.newWholesalePrice ?? item.wholesalePrice,
        supplierPrices: updatedSupplierPrices,
      };
    });

    const cascadedCatalog = recalculateAllRecipeCosts(nextItems);
    newInvoice.inventoryAfter = cascadedCatalog
      .filter((i) => invoiceData.items.some((l) => l.itemId === i.id))
      .map((i) => structuredClone(i));
    setItems(cascadedCatalog);
    setPurchaseInvoices((prev) => [newInvoice, ...prev]);

    setSuppliers((prev) =>
      prev.map((sup) =>
        sup.id === invoiceData.supplierId
          ? {
              ...sup,
              balance: sup.balance + invoiceData.remainingAmount,
              totalPurchases: sup.totalPurchases + invoiceData.totalAmount,
              invoicesCount: sup.invoicesCount + 1,
            }
          : sup,
      ),
    );

    addAuditLog(
      "شراء",
      `فاتورة شراء #${invNum} من (${invoiceData.supplierName}) وتحديث متوسط التكلفة (WAC) وتكلفة التوليفات المرتبطة`,
      invoiceData.totalAmount,
    );
    showToast(
      `تم تسجيل فاتورة المشتريات #${invNum}؛ تابع حالة حفظ السحابة أعلى الشاشة.`,
    );
  };

  // دالة خصم الأصناف من المخزون (خصم مباشر للبن والتوليفات الجاهزة، وفك الوصفة للمشروبات!)

  // 3. حفظ فاتورة بيع (جملة أو قطاعي مباشر)
  const handleSaveSale = (
    saleData: Omit<SalesInvoice, "id" | "invoiceNumber">,
  ) => {
    let updatedInventory: InventoryItem[];
    let invoiceItems: SalesInvoiceItem[];
    let liveTotalCost = 0;
    try {
      if(saleData.saleType!=='wholesale'||saleData.items.some(line=>engine.state.items.find(i=>i.id===line.itemId)?.category!=='manufactured_blend'))throw Error('فواتير البيع الجديدة للتوليفات بالجملة فقط');
      const liveItems = engine.snapshot.state.items;
      const customer=engine.state.customers.find(c=>c.id===saleData.customerId);
      if(!customer)throw Error('اختر عميلًا مسجلًا');
      checkCustomerDetails(customer);
      saleData={...saleData,customerName:customer.name};
      if (
        saleData.saleType === "wholesale" &&
        !engine.snapshot.state.customers.some(
          (c) => c.id === saleData.customerId,
        )
      )
        throw new Error("اختر عميل جملة موجودًا قبل حفظ الفاتورة");
      if (
        !saleData.items.length ||
        saleData.items.some(
          (l) =>
            !Number.isFinite(l.quantity) ||
            l.quantity <= 0 ||
            !Number.isFinite(l.unitPrice) ||
            l.unitPrice < 0,
        )
      )
        throw new Error("أصناف الفاتورة أو كمياتها غير صالحة");
      if (
        !Number.isFinite(saleData.subtotal) ||
        saleData.subtotal < 0 ||
        !Number.isFinite(saleData.totalAmount) ||
        saleData.totalAmount < 0 ||
        !Number.isFinite(saleData.discount) ||
        saleData.discount < 0 ||
        saleData.discount > saleData.subtotal + 0.011 ||
        !Number.isFinite(saleData.paidAmount) ||
        saleData.paidAmount < 0 ||
        !Number.isFinite(saleData.remainingAmount) ||
        saleData.remainingAmount < 0
      )
        throw new Error("مبالغ الفاتورة غير صالحة");
      const prepared = prepareSale(saleData, liveItems);
      invoiceItems = prepared.items;
      liveTotalCost = prepared.totalCost;
      updatedInventory = deductInventory(invoiceItems, liveItems);
    } catch (error) {
      showToast((error as Error).message);
      return false;
    }
    const prefix = saleData.saleType === "wholesale" ? "WH" : "POS";
    const invNum = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    const newSale: SalesInvoice = {
      ...saleData,
      id: crypto.randomUUID(),
      invoiceNumber: invNum,
      items: invoiceItems,
      totalCost: liveTotalCost,
      netProfit: Number((saleData.totalAmount - liveTotalCost).toFixed(2)),
    };

    setItems(updatedInventory);
    setSalesInvoices((prev) => [newSale, ...prev]);

    if (saleData.customerId) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === saleData.customerId
            ? {
                ...c,
                balance: c.balance + saleData.remainingAmount,
                totalSales: c.totalSales + saleData.totalAmount,
                invoicesCount: c.invoicesCount + 1,
                lastPurchaseDate: saleData.date,
              }
            : c,
        ),
      );
    }

    addAuditLog(
      saleData.saleType === "wholesale" ? "بيع جملة" : "بيع محل",
      `فاتورة ${
        saleData.saleType === "wholesale" ? "بيع جملة" : "بيع محل"
      } #${invNum} للعميل (${saleData.customerName}) وخصم الأصناف من المخزن`,
      saleData.totalAmount,
    );
    showToast(
      `تم تسجيل الفاتورة #${invNum}؛ تابع حالة حفظ السحابة أعلى الشاشة.`,
    );
    return newSale;
  };

  // 5. اعتماد محضر الجرد الفعلي على الميزان وتحديث المخزن
  const handleCommitStocktaking = (
    variances: StocktakingItemVariance[],
    notes: string,
    chargeShortageToEmployeeId?: string,
  ) => {
    variances = checkStocktaking(variances, engine.snapshot.state.items);
    if (
      chargeShortageToEmployeeId &&
      !employees.some((e) => e.id === chargeShortageToEmployeeId)
    )
      throw new Error("العامل المختار لتحميل العجز غير موجود");
    const changed = variances.filter((v) => Math.abs(v.difference) > 0.0001);
    const totalShortage = changed
      .filter((v) => v.difference < 0)
      .reduce((s, v) => s + Math.abs(v.financialDifference), 0);
    const totalSurplus = changed
      .filter((v) => v.difference > 0)
      .reduce((s, v) => s + v.financialDifference, 0);

    // تحديث الأرصدة الفعلية في المخزن
    setItems((prev) =>
      prev.map((item) => {
        const found = variances.find((v) => v.itemId === item.id);
        if (!found) return item;
        return { ...item, stock: found.actualStock };
      }),
    );

    const newRecord: StocktakingAuditRecord = {
      id: crypto.randomUUID(),
      auditNumber: nextSequentialNumber(
        stocktakingRecords.map((r) => r.auditNumber),
        "AUD-2026",
        2,
      ),
      date: businessDate(),
      partnerName: currentPartner.name,
      notes,
      totalShortageValue: Number(totalShortage.toFixed(2)),
      totalSurplusValue: Number(totalSurplus.toFixed(2)),
      netVarianceValue: Number((totalSurplus - totalShortage).toFixed(2)),
      itemsAudited: variances,
    };

    setStocktakingRecords((prev) => [newRecord, ...prev]);

    // إذا تم اختيار تحميل العجز على أحد العمال
    if (chargeShortageToEmployeeId && totalShortage > 0) {
      handleRecordEmployeeAction(
        chargeShortageToEmployeeId,
        "خصم/عجز",
        Number(totalShortage.toFixed(2)),
        `تحميل عجز محضر الجرد #${newRecord.auditNumber}`,
      );
    }

    addAuditLog(
      "جرد مخزن",
      `اعتماد محضر الجرد الفعلي #${newRecord.auditNumber} (${changed.length} فروقات على الميزان) — صافي الفرق: ${newRecord.netVarianceValue} ج.م`,
      Math.abs(newRecord.netVarianceValue),
    );
    showToast(
      `✅ تم اعتماد محضر الجرد #${newRecord.auditNumber} وتحديث أرصدة المخزن!`,
    );
  };

  // 6. تسجيل حركة للعامل (سلفة، يومية حضور، خصم/عجز، مكافأة، صرف راتب)
  const handleRecordEmployeeAction = (employeeId:string,type:EmployeeTransaction['type'],amount:number,notes:string,paidFrom?:EmployeeTransaction['paidFrom']) => {
    engine.replace(recordEmployeeAction(engine.state,employeeId,type,amount,notes,currentPartner.id,paidFrom));
    addAuditLog('شؤون عمال', `${type} للعامل: ${employeeId} — ${notes}`,amount);
    showToast('تم تسجيل حركة العامل وربط الصرف بمصروفه؛ تابع تأكيد الحفظ.');
  };

  // 7. أدوات التحكم الشامل في البيانات (تصفير وحذف الداتا التجريبية)
  const handleClearTransactionsKeepCatalog = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        stock: 0,
      })),
    );
    setSalesInvoices([]);
    engine.field("cashierDays",[]);
    setPurchaseInvoices([]);
    setProductionBatches([]);
    setExpenses([]);
    setStocktakingRecords([]);
    setEmployeeTransactions([]);
    setAccountPayments([]);
    setSuppliers((prev) =>
      prev.map((s) => ({
        ...s,
        balance: 0,
        totalPurchases: 0,
        invoicesCount: 0,
      })),
    );
    setCustomers((prev) =>
      prev.map((c) => ({ ...c, balance: 0, totalSales: 0, invoicesCount: 0 })),
    );
    setEmployees((prev) =>
      prev.map((e) => ({
        ...e,
        workedDaysThisMonth: 0,
        totalAdvances: 0,
        totalDeductions: 0,
        totalBonuses: 0,
        totalPaidOut: 0,
      })),
    );
    setPartners((prev) =>
      prev.map((p) => ({ ...p, totalWithdrawals: 0, totalPaidFromPocket: 0 })),
    );
    setAuditLogs([
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        partnerName: currentPartner.name,
        actionType: "تعديل وصفة/صنف",
        description:
          "تصفير الفواتير والأرصدة مع الإبقاء على كتالوج الأصناف والوصفات",
      },
    ]);
    showToast("🧹 تم تصفير الفواتير والأرصدة مع الاحتفاظ بالأصناف والوصفات!");
  };

  const handleClearAllDemoData = () => {
    setItems([]);
    setSalesInvoices([]);
    engine.field("cashierDays",[]);
    setPurchaseInvoices([]);
    setProductionBatches([]);
    setSuppliers([]);
    setCustomers([]);
    setExpenses([]);
    setEmployees([]);
    setEmployeeTransactions([]);
    setStocktakingRecords([]);
    setAccountPayments([]);
    setPartners((prev) =>
      prev.map((p) => ({ ...p, totalWithdrawals: 0, totalPaidFromPocket: 0 })),
    );
    setAuditLogs([
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        partnerName: currentPartner.name,
        actionType: "تعديل وصفة/صنف",
        description: "حذف كافة البيانات التجريبية بالكامل للبدء من الصفر",
      },
    ]);
    showToast("🗑️ تم حذف جميع البيانات التجريبية بالكامل!");
  };

  const handleRestoreDefaultDemoData = () => {
    showToast("بيانات العرض التجريبية متاحة في بيئة الاختبار المنفصلة فقط.");
  };

  const shortagesCount = useMemo(
    () =>
      items.filter(
        (i) => isStockItem(i) && i.stock <= i.minStock,
      ).length,
    [items],
  );

  const dashboardAnalytics = useMemo(() => {
    const activeSales = reportSales.filter((i) => !i.isReturned);
    const salesTotal = activeSales.reduce((s, i) => s + i.totalAmount, 0);
    const costTotal = activeSales.reduce((s, i) => s + i.totalCost, 0);
    const grossProfit = activeSales.reduce((s, i) => s + i.netProfit, 0);
    const expensesTotal = operatingExpenses(expenses);
    const netProfitAfterExpenses = grossProfit - expensesTotal;
    const margin = salesTotal > 0 ? (grossProfit / salesTotal) * 100 : 0;

    // توزيع المبيعات حسب القناة
    const cashierSales = activeSales
      .filter((i) => i.saleType === "cashier_sync")
      .reduce((s, i) => s + i.totalAmount, 0);
    const retailPosSales = activeSales
      .filter((i) => i.saleType === "retail")
      .reduce((s, i) => s + i.totalAmount, 0);
    const wholesaleSales = activeSales
      .filter((i) => i.saleType === "wholesale")
      .reduce((s, i) => s + i.totalAmount, 0);

    // قيمة المخزن الفعلية بالتكلفة وتوزيعها
    const rawStockValue = items
      .filter(
        (i) =>
          isStockItem(i)&&i.category!=="manufactured_blend",
      )
      .reduce((s, i) => s + i.stock * i.costPrice, 0);
    const blendStockValue = items
      .filter((i) => i.category === "manufactured_blend")
      .reduce((s, i) => s + i.stock * i.costPrice, 0);
    const totalInventoryValue = Math.round(rawStockValue + blendStockValue);

    // المديونيات (لنا وعليها)
    const totalCustomerDebts = customers.reduce((s, c) => s + c.balance, 0);
    const totalSupplierPurchases = purchaseInvoices.filter(i=>!i.isCancelled).reduce((sum,invoice)=>sum+invoice.totalAmount,0);

    // أعلى الأصناف مبيعاً وربحاً للرسم البياني الأفقي
    const productStatsMap = new Map<
      string,
      { name: string; revenue: number; profit: number; count: number }
    >();
    activeSales.forEach((inv) => {
      inv.items.forEach((line) => {
        const prev = productStatsMap.get(line.itemId) || {
          name: line.itemName,
          revenue: 0,
          profit: 0,
          count: 0,
        };
        prev.revenue += line.totalPrice;
        prev.profit += line.profit;
        prev.count += line.quantity;
        productStatsMap.set(line.itemId, prev);
      });
    });

    const topSellingProducts = Array.from(productStatsMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    const maxProductRevenue =
      topSellingProducts.length > 0 ? topSellingProducts[0].revenue : 1;

    return {
      salesTotal,
      costTotal,
      grossProfit,
      expensesTotal,
      netProfitAfterExpenses,
      margin,
      invoicesCount: activeSales.length,
      customersCount: customers.length,
      cashierSales,
      retailPosSales,
      wholesaleSales,
      rawStockValue: Math.round(rawStockValue),
      blendStockValue: Math.round(blendStockValue),
      totalInventoryValue,
      totalCustomerDebts,
      totalSupplierPurchases,
      topSellingProducts,
      maxProductRevenue,
    };
  }, [reportSales, expenses, items, customers, purchaseInvoices]);

  const globalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.toLowerCase();
    return items
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [items, globalSearch]);

  // إذا لم يكن هناك شريك مسجل دخوله، نعرض صفحة الدخول الاحترافية الخاصة بـ (بُن العجوز)
  if (!cloud.authReady)
    return (
      <div className="p-8 text-center" role="status">
        جارٍ التحقق من الجلسة…
      </div>
    );
  if (cloud.passwordRecovery) return <PasswordRecoveryScreen passwordUpdated={cloud.recoveryPasswordUpdated} onUpdatePassword={cloud.updateRecoveredPassword} onCancel={cloud.cancelPasswordRecovery} />;
  if (!loggedPartnerId)
    return (
      <LoginScreen
        onSignIn={cloud.signIn}
        onRequestPasswordReset={cloud.requestPasswordReset}
        onResendConfirmation={cloud.resendConfirmation}
        authError={cloud.authError}
      />
    );
  const blocked =
    !["ready", "dirty"].includes(cloud.status) ||
    !partners.some((p) => p.id === loggedPartnerId);
  const statusText =
    cloud.status === "saving"
      ? "جارٍ الحفظ على السحابة…"
      : cloud.status === "dirty"
        ? "تعديلات بانتظار الحفظ"
        : cloud.status === "ready"
          ? ""
          : cloud.status === "loading"
            ? "جارٍ تحميل بيانات المحل…"
            : cloud.status === "conflict"
              ? "تعارض مع تعديلات جهاز آخر"
              : "تعذر تأكيد الحفظ";

  return (
    <div className="agouz-app min-h-screen bg-[#EFECE4] flex flex-col items-center justify-start">
      {getSupabaseCredentials().url.startsWith("http://127.0.0.1:") && (
        <div className="w-full bg-amber-100 p-2 text-center text-xs font-bold">
          بيئة اختبار محلية — بيانات تجريبية منفصلة
        </div>
      )}
      {cloud.status !== 'ready' && <div
        role="status"
        className="sticky top-0 z-40 w-full bg-stone-900 text-white text-xs text-center p-2"
      >
        {statusText}
      </div>}
      {queueError && (
        <div
          role="alert"
          className="w-full p-3 bg-amber-100 text-amber-900 text-sm"
        >
          {queueError}
        </div>
      )}
      {blocked && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl p-5 max-w-md space-y-3"
            role="alert"
          >
            <h2 className="font-bold">{statusText}</h2>
            <p>
              {cloud.error ||
                (!partners.some((p) => p.id === loggedPartnerId) &&
                cloud.status === "ready"
                  ? "هذا الحساب غير مرتبط بملف شريك داخل بيانات المحل"
                  : "")}
            </p>
            {["error", "conflict"].includes(cloud.status) && (
              <>
                <button
                  className="border rounded p-2 m-1"
                  onClick={() =>
                    downloadFullBackupJson(createBackup(engine.snapshot.state))
                  }
                >
                  حفظ نسخة من العمل الحالي
                </button>
                {cloud.status === "error" && engine.hasPending && (
                  <button
                    className="border rounded p-2 m-1"
                    onClick={() => void engine.flush()}
                  >
                    إعادة محاولة الحفظ
                  </button>
                )}
                <button
                  className="border rounded p-2 m-1"
                  onClick={() => {
                    if (
                      !engine.hasPending ||
                      window.confirm(
                        "هل حفظت نسخة من العمل؟ إعادة التحميل تستبدل التعديلات غير المحفوظة ببيانات السحابة.",
                      )
                    )
                      void engine.load();
                  }}
                >
                  تحميل بيانات السحابة
                </button>
                {!engine.hasPending && (
                  <button
                    className="border rounded p-2 m-1"
                    onClick={handleLogout}
                  >
                    تسجيل الخروج
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* إشعار عائم */}
      {toastNotification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1E1612] text-[#FBF5B7] px-4 py-3 rounded-2xl shadow-2xl border border-[#C59B27] flex items-center gap-2 text-xs font-extrabold max-w-sm w-[92%]">
          <CheckCircle2 className="w-5 h-5 text-[#D4AF37] shrink-0" />
          <span>{toastNotification}</span>
        </div>
      )}

      {/* حاوية التطبيق بهوية بُن العجوز الفاتحة والذهبية */}
      <div className="w-full max-w-[445px] min-h-screen bg-[#FAF8F4] text-[#1E1612] shadow-2xl relative pb-16">
        {/* ================= 1. الشاشة الرئيسية: لوحة الإحصائيات والرسوم البيانية الاحترافية ================= */}
        {activeScreen === "home" && (
          <div className="px-4 pt-4 pb-24 space-y-4">
            {/* الهيدر الاحترافي الأول بهوية الإسبريسو والذهبي وأيقونة الخروج في الرئيسية فقط */}
            <div className="bg-white rounded-2xl p-3 border border-[#E6DEC8] shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#261C15] to-[#150F0C] border border-[#C59B27] p-1 flex items-center justify-center shadow-md shrink-0">
                  <img
                    src="/logo.png"
                    alt="بُن العجوز"
                    className="w-10 h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#8C7A6B] font-bold">
                      مساء الخير 👋
                    </span>
                    <span className="text-[10px] font-extrabold bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] px-2 py-0.5 rounded-full">
                      {currentPartner.role}
                    </span>
                  </div>
                  <div className="text-sm font-black text-[#1E1612] mt-0.5">
                    {currentPartner.name}
                  </div>
                </div>
              </div>

              {/* أيقونات التحكم السريعة بدون نصوص (منها أيقونة تسجيل الخروج في الرئيسية فقط) */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveScreen("insights")}
                  className="p-2 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] hover:bg-[#F5EBD0] transition"
                  title="التحليلات الذكية"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMoreInitialTab("data_control");
                    setActiveScreen("more");
                  }}
                  className="p-2 rounded-xl bg-[#FAF8F4] text-[#7A6855] border border-[#E6DEC8] hover:text-red-600 transition"
                  title="إدارة البيانات والنسخ الاحتياطي"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMoreInitialTab("menu");
                    setActiveScreen("more");
                  }}
                  className="p-2 rounded-xl bg-[#FAF8F4] text-[#7A6855] border border-[#E6DEC8] hover:text-[#1E1612] transition"
                  title="الإعدادات"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* شريط البحث السريع */}
            <div className="relative">
              <div className="bg-white rounded-2xl border border-[#E6DEC8] focus-within:border-[#C59B27] px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm">
                <Search className="w-4 h-4 text-[#9E7918] shrink-0" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="ابحث عن صنف بن، توليفة، مشروب، أو كود..."
                  className="w-full text-xs font-bold bg-transparent focus:outline-none text-[#1E1612] placeholder:text-[#9C8B7A]"
                />
              </div>

              {globalSearchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-12 bg-white rounded-2xl shadow-xl border border-[#C59B27] z-30 divide-y divide-[#F0EAE0]">
                  {globalSearchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setGlobalSearch("");
                        setActiveScreen("inventory");
                      }}
                      className="w-full px-4 py-2.5 text-right hover:bg-[#FDF8EB] flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-extrabold text-[#1E1612]">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[#7A6855]">
                          الرصيد: {item.stock}{" "}
                          {item.baseUnit === "kg" ? "كجم" : "وحدة"} • التكلفة:{" "}
                          {item.costPrice} ج.م
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#9E7918]">
                        فتح &gt;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* شريط تنبيه النواقص الفاخر */}
            {shortagesCount > 0 && (
              <button
                onClick={() => setActiveScreen("shortages")}
                className="w-full bg-gradient-to-l from-[#FFF8E7] to-[#FDF2D0] border border-[#E5C158] rounded-2xl px-3.5 py-2.5 flex items-center justify-between shadow-sm transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#1E1612] text-[#FBF5B7] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black text-[#1E1612]">
                      تنبيه نواقص المخزن ({shortagesCount} أصناف)
                    </div>
                    <div className="text-[10px] text-[#8C6D1F] font-bold">
                      اضغط لمراجعة الأصناف التي وصلت للحد الأدنى
                    </div>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#9E7918]" />
              </button>
            )}

            {/* بطاقة المؤشرات المالية الفاخرة (Luxury Espresso & Gold Hero Card) */}
            <div className="bg-gradient-to-br from-[#1E1612] via-[#2A1F1A] to-[#17110E] rounded-3xl p-4 text-[#FAF8F4] border border-[#C59B27]/60 shadow-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#C59B27]/20 border border-[#C59B27]/50 flex items-center justify-center text-[#FBF5B7]">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-black text-[#FBF5B7]">
                      ملخص الإحصائيات والأرباح المباشر
                    </h2>
                    <p className="text-[10px] text-[#C59B27]">
                      بُن العجوز — مزامنة بيانات المحل بين الأجهزة
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setHideProfits(!hideProfits)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-[#FBF5B7] border border-[#C59B27]/40 transition"
                    title={hideProfits ? "إظهار الأرباح" : "إخفاء الأرباح"}
                  >
                    {hideProfits ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveScreen("sections")}
                    className="bg-gradient-to-r from-[#C59B27] to-[#E5C158] text-[#1E1612] px-3 py-1.5 rounded-xl text-[11px] font-black shadow flex items-center gap-1"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>الأقسام</span>
                  </button>
                </div>
              </div>

              {/* 4 مؤشرات رئيسية داخل البطاقة الفاخرة */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-3">
                  <div className="text-[10px] text-[#D8CBB8] font-bold">
                    إجمالي المبيعات ({dashboardAnalytics.invoicesCount} مستند بيع)
                  </div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {dashboardAnalytics.salesTotal.toLocaleString("ar-EG")}{" "}
                    <span className="text-[10px] text-[#D4AF37] font-normal">
                      ج.م
                    </span>
                  </div>
                </div>

                <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#D8CBB8] font-bold">
                      صافي الربح الفعلي
                    </span>
                    <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                      {hideProfits
                        ? "••%"
                        : `${dashboardAnalytics.margin.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">
                    {hideProfits
                      ? "••••••"
                      : dashboardAnalytics.netProfitAfterExpenses.toLocaleString(
                          "ar-EG",
                        )}{" "}
                    <span className="text-[10px] text-emerald-300 font-normal">
                      ج.م
                    </span>
                  </div>
                </div>

                <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-[#D8CBB8]">
                      رأس مال المخزن
                    </div>
                    <div className="text-xs font-black text-[#FBF5B7] mt-0.5">
                      {dashboardAnalytics.totalInventoryValue.toLocaleString(
                        "ar-EG",
                      )}{" "}
                      ج.م
                    </div>
                  </div>
                  <Package className="w-4 h-4 text-[#D4AF37]" />
                </div>

                <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-[#D8CBB8]">
                      نصيب المالك ({currentPartner.sharePercent}%)
                    </div>
                    <div className="text-xs font-black text-[#FBF5B7] mt-0.5">
                      {hideProfits
                        ? "••••"
                        : Math.round(
                            (dashboardAnalytics.netProfitAfterExpenses *
                              currentPartner.sharePercent) /
                              100,
                          ).toLocaleString("ar-EG")}{" "}
                      ج.م
                    </div>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                </div>
              </div>
            </div>

            {/* الرسم البياني 1: أعمدة مقارنة المبيعات والتكلفة والمصاريف وصافي الربح */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#1E1612] text-[#FBF5B7] flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[#1E1612]">
                      الرسم البياني للمبيعات والأرباح
                    </h3>
                    <p className="text-[10px] text-[#8C7A6B]">
                      مقارنة الإيرادات بتكلفة البن والمصروفات وصافي الربح
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveScreen("reports")}
                  className="text-[11px] font-extrabold text-[#9E7918] hover:underline"
                >
                  التقرير الكامل &gt;
                </button>
              </div>

              {(() => {
                const maxVal = Math.max(
                  dashboardAnalytics.salesTotal,
                  dashboardAnalytics.costTotal,
                  1,
                );
                const bars = [
                  {
                    label: "المبيعات",
                    value: dashboardAnalytics.salesTotal,
                    color: "from-[#1E1612] to-[#3A2B22]",
                    textColor: "text-[#1E1612]",
                    hide: false,
                  },
                  {
                    label: "تكلفة البن",
                    value: dashboardAnalytics.costTotal,
                    color: "from-[#9E7918] to-[#D4AF37]",
                    textColor: "text-[#9E7918]",
                    hide: hideProfits,
                  },
                  {
                    label: "مجمل الربح",
                    value: dashboardAnalytics.grossProfit,
                    color: "from-[#1F9D62] to-[#34D399]",
                    textColor: "text-[#1F9D62]",
                    hide: hideProfits,
                  },
                  {
                    label: "المصروفات",
                    value: dashboardAnalytics.expensesTotal,
                    color: "from-[#D97706] to-[#F59E0B]",
                    textColor: "text-[#D97706]",
                    hide: false,
                  },
                  {
                    label: "الصافي النهائي",
                    value: Math.max(
                      0,
                      dashboardAnalytics.netProfitAfterExpenses,
                    ),
                    color: "from-[#047857] to-[#10B981]",
                    textColor: "text-[#047857]",
                    hide: hideProfits,
                  },
                ];

                return (
                  <div className="pt-3 pb-1">
                    <div className="h-36 flex items-end justify-between gap-2.5 px-2 border-b border-[#EDE6D8] pb-2">
                      {bars.map((bar, idx) => {
                        const heightPct = Math.max(
                          12,
                          Math.min(100, Math.round((bar.value / maxVal) * 100)),
                        );
                        return (
                          <div
                            key={idx}
                            className="flex-1 flex flex-col items-center justify-end h-full group"
                          >
                            <span
                              className={`text-[10px] font-black mb-1 ${bar.textColor}`}
                            >
                              {bar.hide
                                ? "•••"
                                : bar.value.toLocaleString("ar-EG")}
                            </span>
                            <div className="w-full max-w-[38px] bg-[#FAF8F4] rounded-t-xl h-24 flex items-end overflow-hidden border border-[#EDE6D8]">
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full bg-gradient-to-t ${bar.color} rounded-t-lg transition-all duration-500`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1 pt-2 text-center">
                      {bars.map((bar, idx) => (
                        <div
                          key={idx}
                          className="flex-1 text-[10px] font-extrabold text-[#6E5D4F] truncate"
                        >
                          {bar.label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* الرسم البياني 2: توزيع المبيعات حسب القنوات (كاشير المحل vs بيع المحل vs الجملة) */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[#1E1612]">
                      توزيع مصادر المبيعات
                    </h3>
                    <p className="text-[10px] text-[#8C7A6B]">
                      نسبة مبيعات الجملة مقابل المحل وتقارير يوم الكاشير
                    </p>
                  </div>
                </div>
              </div>

              {(() => {
                const total = dashboardAnalytics.salesTotal || 1;
                const wholesalePct = Math.round(
                  (dashboardAnalytics.wholesaleSales / total) * 100,
                );
                const retailPct = Math.round(
                  (dashboardAnalytics.retailPosSales / total) * 100,
                );
                const cashierPct = Math.round(
                  (dashboardAnalytics.cashierSales / total) * 100,
                );

                return (
                  <div className="space-y-3">
                    {/* شريط التوزيع المجمع */}
                    <div className="w-full h-4 rounded-full bg-[#FAF8F4] overflow-hidden flex border border-[#E6DEC8] p-0.5 gap-0.5">
                      <div
                        style={{ width: `${wholesalePct}%` }}
                        className="h-full bg-[#1E1612] rounded-r-full transition-all"
                        title="مبيعات الجملة"
                      />
                      <div
                        style={{ width: `${retailPct}%` }}
                        className="h-full bg-[#C59B27] transition-all"
                        title="مبيعات المحل المباشرة"
                      />
                      <div
                        style={{ width: `${cashierPct}%` }}
                        className="h-full bg-[#1F9D62] rounded-l-full transition-all"
                        title="شيت كاشير المحل"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-[#FAF8F4] rounded-xl p-2.5 border border-[#EDE6D8]">
                        <div className="flex items-center justify-center gap-1 text-[10px] font-extrabold text-[#1E1612]">
                          <span className="w-2 h-2 rounded-full bg-[#1E1612]" />
                          <span>بيع الجملة</span>
                        </div>
                        <div className="text-xs font-black text-[#1E1612] mt-1">
                          {dashboardAnalytics.wholesaleSales.toLocaleString(
                            "ar-EG",
                          )}{" "}
                          ج.م
                        </div>
                        <div className="text-[10px] text-[#9E7918] font-bold">
                          {wholesalePct}%
                        </div>
                      </div>

                      <div className="bg-[#FAF8F4] rounded-xl p-2.5 border border-[#EDE6D8]">
                        <div className="flex items-center justify-center gap-1 text-[10px] font-extrabold text-[#1E1612]">
                          <span className="w-2 h-2 rounded-full bg-[#C59B27]" />
                          <span>مبيعات المحل</span>
                        </div>
                        <div className="text-xs font-black text-[#1E1612] mt-1">
                          {dashboardAnalytics.retailPosSales.toLocaleString(
                            "ar-EG",
                          )}{" "}
                          ج.م
                        </div>
                        <div className="text-[10px] text-[#9E7918] font-bold">
                          {retailPct}%
                        </div>
                      </div>

                      <div className="bg-[#FAF8F4] rounded-xl p-2.5 border border-[#EDE6D8]">
                        <div className="flex items-center justify-center gap-1 text-[10px] font-extrabold text-[#1E1612]">
                          <span className="w-2 h-2 rounded-full bg-[#1F9D62]" />
                          <span>يوم الكاشير</span>
                        </div>
                        <div className="text-xs font-black text-[#1E1612] mt-1">
                          {dashboardAnalytics.cashierSales.toLocaleString(
                            "ar-EG",
                          )}{" "}
                          ج.م
                        </div>
                        <div className="text-[10px] text-[#1F9D62] font-bold">
                          {cashierPct}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* الرسم البياني 3: أعلى الأصناف والتوليفات مبيعاً وربحية (Horizontal Bar Chart) */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#1E1612] text-[#FBF5B7] flex items-center justify-center">
                    <Flame className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[#1E1612]">
                      الأعلى مبيعاً وربحية في بُن العجوز
                    </h3>
                    <p className="text-[10px] text-[#8C7A6B]">
                      ترتيب الأصناف والتوليفات حسب قيمة المبيعات
                    </p>
                  </div>
                </div>
              </div>

              {dashboardAnalytics.topSellingProducts.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#8C7A6B]">
                  لا توجد مبيعات مسجلة حالياً لعرض الرسم البياني
                </div>
              ) : (
                <div className="space-y-2.5">
                  {dashboardAnalytics.topSellingProducts.map((prod, idx) => {
                    const widthPct = Math.max(
                      12,
                      Math.round(
                        (prod.revenue / dashboardAnalytics.maxProductRevenue) *
                          100,
                      ),
                    );
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 font-extrabold text-[#1E1612]">
                            <span className="w-5 h-5 rounded-md bg-[#1E1612] text-[#FBF5B7] text-[10px] font-black flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span>{prod.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-[#1E1612]">
                              {prod.revenue.toLocaleString("ar-EG")} ج.م
                            </span>
                            {!hideProfits && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                ربح: {prod.profit.toLocaleString("ar-EG")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-2.5 bg-[#FAF8F4] rounded-full overflow-hidden border border-[#EDE6D8]">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className="h-full bg-gradient-to-l from-[#C59B27] to-[#1E1612] rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* مؤشرات المخزن والمديونيات السريعة */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setActiveScreen("customers")}
                className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm text-right transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-[#7A6855]">
                    مديونيات الجملة (لنا)
                  </span>
                  <Users className="w-4 h-4 text-[#9E7918]" />
                </div>
                <div className="text-base font-black text-[#1E1612] mt-1">
                  {dashboardAnalytics.totalCustomerDebts.toLocaleString(
                    "ar-EG",
                  )}{" "}
                  <span className="text-[10px] font-normal text-[#7A6855]">
                    ج.م
                  </span>
                </div>
                <div className="text-[10px] text-[#9E7918] font-bold mt-0.5">
                  اضغط للتحصيل وكشف الحساب &gt;
                </div>
              </button>

              <button
                onClick={() => setActiveScreen("suppliers")}
                className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm text-right transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-[#7A6855]">
                    مشتريات الموردين
                  </span>
                  <Truck className="w-4 h-4 text-[#1E1612]" />
                </div>
                <div className="text-base font-black text-[#1E1612] mt-1">
                  {dashboardAnalytics.totalSupplierPurchases.toLocaleString(
                    "ar-EG",
                  )}{" "}
                  <span className="text-[10px] font-normal text-[#7A6855]">
                    ج.م
                  </span>
                </div>
                <div className="text-[10px] text-[#9E7918] font-bold mt-0.5">
                  سجل الشراء ومقارنة الأسعار &gt;
                </div>
              </button>
            </div>

            {/* سجل حركات الشركاء الأربعة المباشر */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#9E7918]" />
                  <h3 className="text-xs font-black text-[#1E1612]">
                    آخر حركات الشركاء بالمحل
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-[#8C7A6B]">
                  مباشر
                </span>
              </div>

              <div className="divide-y divide-[#F2ECE1]">
                {auditLogs.slice(0, 4).map((log) => (
                  <div
                    key={log.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-extrabold text-[#1E1612] truncate">
                        {log.description}
                      </div>
                      <div className="text-[10px] text-[#8C7A6B] mt-0.5">
                        بواسطة: {log.partnerName} • {log.timestamp}
                      </div>
                    </div>
                    {log.amount !== undefined && (
                      <span className="text-[11px] font-black text-[#9E7918] bg-[#FDF8EB] border border-[#E8D8A8] px-2 py-0.5 rounded-lg shrink-0">
                        {log.amount.toLocaleString("ar-EG")} ج.م
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. قسم الأقسام (بالتصميم الاحترافي الأول الفخم بالإسبريسو والذهبي) ================= */}
        {activeScreen === "sections" && <SectionsHub
          counts={{products:items.length,inventory:items.length,purchase:purchaseInvoices.length,sales_invoices:salesInvoices.length+cashierDays.filter(d=>d.status==='approved').length,customers:customers.length,suppliers:suppliers.length,staff_payroll:employees.length,shortages:shortagesCount}}
          onNavigate={(screen)=>{
            if(screen==='expenses'||screen==='data_control'){setMoreInitialTab(screen);setActiveScreen('more');}
            else setActiveScreen(screen);
          }}
        />}

        {/* ================= الشاشات الفرعية ================= */}
        {activeScreen === "purchase" && (
          <PurchaseScreen
            items={items}
            suppliers={suppliers}
            purchaseInvoices={purchaseInvoices}
            currentPartnerName={currentPartner.name}
            onSavePurchase={(data) =>
              safeAction(() => handleSavePurchase(data))
            }
            onDeletePurchaseInvoice={(invId) => {
              safeAction(() => {
                const next = cancelPurchase(
                  engine.snapshot.state,
                  invId,
                  currentPartner.name,
                );
                engine.replace({
                  ...next,
                  items: recalculateAllRecipeCosts(next.items),
                });
                addAuditLog("مرتجع", `إلغاء فاتورة مشتريات ${invId}`);
                showToast(
                  "تم إلغاء الفاتورة وعكس المخزون والمديونية مع حفظ الأصل ومبلغ الاسترداد.",
                );
              });
            }}
            onQuickAddSupplier={(newSup) => {
              return safeAction(() => {
                checkSupplierDetails(newSup);
                const created: Supplier = {
                  ...newSup,
                  id: crypto.randomUUID(),
                };
                setSuppliers((prev) => [created, ...prev]);
                showToast(`✅ تمت إضافة المورد (${created.name})!`);
              });
            }}
            onQuickAddItem={(newItem) => {
              return safeAction(() => {
                const created: InventoryItem = {
                  ...newItem,
                  id: crypto.randomUUID(),
                  openingStock: newItem.stock,
                };
                setItems((prev) => [created, ...prev]);
                showToast(`✅ تمت إضافة الصنف (${created.name}) للمخزن!`);
              });
            }}
            onBack={() => setActiveScreen("sections")}
          />
        )}

        {activeScreen === "production" && (
          <ProductionAndRecipesScreen
            items={items}
            productionBatches={productionBatches}
            currentPartnerName={currentPartner.name}
            onExecuteProduction={(...args) => {
              try {
                return engine.transaction(() =>
                  handleExecuteProduction(...args),
                );
              } catch (error) {
                return { ok: false, message: (error as Error).message };
              }
            }}
            onSaveItemRecipe={(
              targetId: string,
              recipe: RecipeIngredient[],
              retail?: number,
              wholesale?: number,
            ) =>
              safeAction(() => {
                setItems((prev) => {
                  const updated = prev.map((item) =>
                    item.id === targetId
                      ? {
                          ...item,
                          hasRecipe: recipe.length > 0,
                          recipe,
                          retailPrice: retail ?? item.retailPrice,
                          wholesalePrice: wholesale ?? item.wholesalePrice,
                        }
                      : item,
                  );
                  return recalculateAllRecipeCosts(updated);
                });
                addAuditLog("تعديل وصفة/صنف", `تحديث وصفة صنف`);
              })
            }
            onCreateNewBlendOrDrink={(newItem) =>
              safeAction(() => {
                const created: InventoryItem = {
                  ...newItem,
                  id: crypto.randomUUID(),
                  openingStock: newItem.stock,
                };
                setItems((prev) => [created, ...prev]);
                addAuditLog("تعديل وصفة/صنف", `إضافة صنف: ${created.name}`);
              })
            }
            onDeleteItem={(id) => {
              safeAction(() => {
                if (!canDeleteCatalogItem(engine.state,id)) {
                  showToast("لا يمكن حذف صنف مرتبط بوصفة أو فاتورة.");
                  return;
                }
                setItems((prev) => prev.filter((i) => i.id !== id));
                showToast("🗑️ تم حذف الصنف بنجاح");
              });
            }}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === 'sales_pos' && <WholesaleInvoiceScreen items={items} customers={customers} currentPartnerName={currentPartner.name} onBack={()=>setActiveScreen('home')} onSaveSale={async data=>{
          let invoice:SalesInvoice|false=false;
          if(!safeAction(()=>{invoice=handleSaveSale(data);})||!invoice)return false;
          try{await confirmSave();setReceiptModalInvoice(invoice);setActiveScreen('home');return true;}catch(error){showToast((error as Error).message);return false;}
        }}/>}
        {activeScreen === 'cashier_sync' && <CashierDayScreen items={items} days={cashierDays} queued={queuedReports} onBack={()=>setActiveScreen('home')} onAttach={async(date,report)=>{engine.replace(attachCashierReport(engine.state,date,report),report.file.sourceQueueId);await confirmSave();if(report.file.sourceQueueId)setQueuedReports(rows=>rows.filter(r=>r.id!==report.file.sourceQueueId));}} onApprove={async(id)=>{engine.replace(approveCashierDay(engine.state,id,currentPartner.name));await confirmSave();}}/>}

        {activeScreen === "products" && (
          <ProductsCatalogScreen
            items={items}
            onAddNewItem={(newItem) => {
              return safeAction(() => {
                if (
                  hasInvalidNumbers([
                    newItem.stock,
                    newItem.minStock,
                    newItem.costPrice,
                    newItem.retailPrice,
                    newItem.wholesalePrice,
                  ]) ||
                  !newItem.name.trim()
                ) {
                  showToast(
                    "راجع البيانات: الاسم مطلوب والأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
                  );
                  return;
                }
                setItems((prev) => [
                  { ...newItem, id: crypto.randomUUID(), openingStock:newItem.stock },
                  ...prev,
                ]);
                addAuditLog(
                  "تعديل وصفة/صنف",
                  `تعريف منتج جديد: ${newItem.name}`,
                );
                showToast(`✅ تمت إضافة المنتج (${newItem.name}) في الكتالوج!`);
              });
            }}
            onUpdateItem={(id, patch) => {
              return safeAction(() => {
                if (
                  hasInvalidNumbers([
                    patch.stock,
                    patch.minStock,
                    patch.costPrice,
                    patch.lastPurchasePrice,
                    patch.retailPrice,
                    patch.wholesalePrice,
                  ])
                ) {
                  showToast(
                    "الأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
                  );
                  return;
                }
                engine.replace(adjustCatalogItem(engine.state,id,patch,currentPartner.name));
                addAuditLog("تعديل وصفة/صنف", `تحديث تسعير/بيانات منتج`);
                showToast(
                  "✅ تم تحديث المنتج وإعادة حساب تكلفة الوصفات المرتبطة!",
                );
              });
            }}
            onDeleteItem={(id) => {
              safeAction(() => {
                if (!canDeleteCatalogItem(engine.state,id)) {
                  showToast("لا يمكن حذف صنف مرتبط بوصفة أو فاتورة.");
                  return;
                }
                setItems((prev) => prev.filter((i) => i.id !== id));
                addAuditLog("تعديل وصفة/صنف", `حذف منتج من الكتالوج`);
                showToast("🗑️ تم حذف المنتج بنجاح!");
              });
            }}
            onNavigateToProduction={() => setActiveScreen("production")}
            onNavigateToInventory={() => setActiveScreen("inventory")}
            onNavigateToPurchase={() => setActiveScreen("purchase")}
            onBack={() => setActiveScreen("sections")}
          />
        )}

        {activeScreen === "inventory" && (
          <InventoryScreen
            items={items}
            onAddNewItem={(newItem) => {
              return safeAction(() => {
                if (
                  hasInvalidNumbers([
                    newItem.stock,
                    newItem.minStock,
                    newItem.costPrice,
                    newItem.retailPrice,
                    newItem.wholesalePrice,
                  ]) ||
                  !newItem.name.trim()
                ) {
                  showToast(
                    "راجع البيانات: الاسم مطلوب والأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
                  );
                  return;
                }
                setItems((prev) => [
                  { ...newItem, id: crypto.randomUUID() },
                  ...prev,
                ]);
                addAuditLog("تعديل وصفة/صنف", `إضافة صنف: ${newItem.name}`);
                showToast(`✅ تمت إضافة (${newItem.name}) للمخزن!`);
              });
            }}
            onUpdateItemPricesAndStock={(id, patch) => {
              return safeAction(() => {
                if (
                  hasInvalidNumbers([
                    patch.stock,
                    patch.minStock,
                    patch.costPrice,
                    patch.retailPrice,
                    patch.wholesalePrice,
                  ])
                ) {
                  showToast(
                    "الأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
                  );
                  return;
                }
                engine.replace(adjustCatalogItem(engine.state,id,patch,currentPartner.name));
                addAuditLog("تعديل وصفة/صنف", `تعديل رصيد/سعر صنف`);
                showToast("✅ تم تحديث الصنف وتكلفة الوصفات!");
              });
            }}
            onDeleteItem={(id) => {
              safeAction(() => {
                if (!canDeleteCatalogItem(engine.state,id)) {
                  showToast("لا يمكن حذف صنف مرتبط بوصفة أو فاتورة.");
                  return;
                }
                setItems((prev) => prev.filter((i) => i.id !== id));
                addAuditLog("تعديل وصفة/صنف", `حذف صنف من المخزن`);
                showToast("🗑️ تم حذف الصنف من المخزن!");
              });
            }}
            onNavigateToProduction={() => setActiveScreen("production")}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "shortages" && (
          <ShortagesScreen
            items={items}
            onNavigateToPurchase={() => setActiveScreen("purchase")}
            onNavigateToProduction={() => setActiveScreen("production")}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "suppliers" && (
          <SuppliersAndCustomersScreen onUpdateContact={(mode,id,details)=>safeAction(()=>{if(mode==='customers'){checkCustomerDetails(details);setCustomers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}else{checkSupplierDetails(details);setSuppliers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}addAuditLog("تعديل وصفة/صنف","تحديث بيانات التواصل");})}
            mode="suppliers"
            suppliers={suppliers}
            customers={customers}
            purchaseInvoices={purchaseInvoices}
            salesInvoices={salesInvoices}
            accountPayments={accountPayments}
            onPaySupplier={(supId, amount, notes) =>
              safeAction(() => {
                engine.replace(
                  recordPayment(
                    engine.snapshot.state,
                    "supplier",
                    supId,
                    amount,
                    currentPartner.name,
                    notes,
                  ),
                );
                addAuditLog("سداد/تحصيل", "سداد للمورد", amount);
                showToast(
                  "تم تسجيل الدفعة وتوزيعها على الفواتير المستحقة؛ تابع تأكيد الحفظ.",
                );
              })
            }
            onDeletePayment={(payId) => {
              safeAction(() => {
                engine.replace(
                  reversePayment(
                    engine.snapshot.state,
                    payId,
                    currentPartner.name,
                  ),
                );
                addAuditLog("سداد/تحصيل", "إلغاء دفعة بحركة عكسية");
                showToast("تم إلغاء الدفعة وإعادة الرصيد مع حفظ السجل.");
              });
            }}
            onAddSupplier={(sup) => {
              return safeAction(() => {
                checkSupplierDetails(sup);
                if (!sup.name.trim() || hasInvalidNumbers([sup.balance])) {
                  showToast(
                    "راجع البيانات: اسم المورد مطلوب والرصيد رقم غير سالب.",
                  );
                  return;
                }
                setSuppliers((prev) => [
                  { ...sup, id: crypto.randomUUID() },
                  ...prev,
                ]);
                showToast(`✅ تمت إضافة المورد (${sup.name})!`);
              });
            }}
            onDeleteSupplier={(id) => {
              safeAction(() => {
                if (
                  purchaseInvoices.some((i) => i.supplierId === id) ||
                  accountPayments.some((p) => p.targetId === id) ||
                  suppliers.find((s) => s.id === id)?.balance
                ) {
                  showToast("حساب المورد مرتبط بحركات أو رصيد؛ لا يمكن حذفه.");
                  return;
                }
                setSuppliers((prev) => prev.filter((s) => s.id !== id));
                // تنظيف أسعار المورد المحذوف من كتالوج الأصناف
                setItems((prev) =>
                  prev.map((item) => ({
                    ...item,
                    supplierPrices: item.supplierPrices.filter(
                      (sp) => sp.supplierId !== id,
                    ),
                  })),
                );
                showToast("🗑️ تم حذف المورد!");
              });
            }}
            onCollectCustomer={() => {
              return safeAction(() => {});
            }}
            onAddCustomer={() => {
              safeAction(() => {});
            }}
            onDeleteCustomer={() => {
              safeAction(() => {});
            }}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "customers" && (
          <SuppliersAndCustomersScreen onUpdateContact={(mode,id,details)=>safeAction(()=>{if(mode==='customers'){checkCustomerDetails(details);setCustomers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}else{checkSupplierDetails(details);setSuppliers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}addAuditLog("تعديل وصفة/صنف","تحديث بيانات التواصل");})}
            mode="customers"
            suppliers={suppliers}
            customers={customers}
            purchaseInvoices={purchaseInvoices}
            salesInvoices={salesInvoices}
            accountPayments={accountPayments}
            onPaySupplier={() => {
              return safeAction(() => {});
            }}
            onAddSupplier={() => {
              safeAction(() => {});
            }}
            onDeleteSupplier={() => {
              safeAction(() => {});
            }}
            onCollectCustomer={(custId, amount, notes) =>
              safeAction(() => {
                engine.replace(
                  recordPayment(
                    engine.snapshot.state,
                    "customer",
                    custId,
                    amount,
                    currentPartner.name,
                    notes,
                  ),
                );
                addAuditLog("سداد/تحصيل", "تحصيل من العميل", amount);
                showToast(
                  "تم تسجيل الدفعة وتوزيعها على الفواتير المستحقة؛ تابع تأكيد الحفظ.",
                );
              })
            }
            onDeletePayment={(payId) => {
              safeAction(() => {
                engine.replace(
                  reversePayment(
                    engine.snapshot.state,
                    payId,
                    currentPartner.name,
                  ),
                );
                addAuditLog("سداد/تحصيل", "إلغاء دفعة بحركة عكسية");
                showToast("تم إلغاء الدفعة وإعادة الرصيد مع حفظ السجل.");
              });
            }}
            onAddCustomer={(cust) => {
              return safeAction(() => {
                checkCustomerDetails(cust);
                if (!cust.name.trim() || hasInvalidNumbers([cust.balance])) {
                  showToast(
                    "راجع البيانات: اسم العميل مطلوب والرصيد رقم غير سالب.",
                  );
                  return;
                }
                setCustomers((prev) => [
                  { ...cust, id: crypto.randomUUID() },
                  ...prev,
                ]);
                showToast(`✅ تمت إضافة العميل (${cust.name})!`);
              });
            }}
            onDeleteCustomer={(id) => {
              safeAction(() => {
                if (
                  salesInvoices.some((i) => i.customerId === id) ||
                  accountPayments.some((p) => p.targetId === id) ||
                  customers.find((c) => c.id === id)?.balance
                ) {
                  showToast("حساب العميل مرتبط بحركات أو رصيد؛ لا يمكن حذفه.");
                  return;
                }
                setCustomers((prev) => prev.filter((c) => c.id !== id));
                showToast("🗑️ تم حذف العميل!");
              });
            }}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "sales_invoices" && (
          <SalesInvoicesAndReturnsScreen
            cashierDays={cashierDays}
            salesInvoices={salesInvoices}
            customers={customers}
            onReturnInvoice={(invId) => {
              if(!window.confirm('تأكيد المرتجع الاستثنائي وعكس قيمته المالية؟ مكونات المشروبات المستهلكة لا تعود للمخزون.'))return;
              safeAction(() => {
                const state = returnSale(
                  engine.snapshot.state,
                  invId,
                  currentPartner.name,
                );
                engine.replace(state);
                addAuditLog("مرتجع", `مرتجع الفاتورة ${invId}`);
                showToast(
                  "تم تسجيل المرتجع وعكس المستحق؛ مكونات المشروبات تظل مستهلكة.",
                );
              });
            }}
            onDeleteInvoice={(invId) => {
              showToast(
                "هذه فاتورة معتمدة؛ استخدم المرتجع لعكس أثرها مع الاحتفاظ بالأصل.",
              );
            }}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "insights" && (
          <SmartInsightsScreen
            items={items}
            salesInvoices={reportSales}
            customers={customers}
            onNavigate={(sc) => setActiveScreen(sc)}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "reports" && (
          <ProfitReportsScreen
            items={items}
            salesInvoices={reportSales}
            expenses={expenses}
            partners={partners}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "stocktaking" && (
          <StocktakingScreen
            items={items}
            auditRecords={stocktakingRecords}
            employees={employees}
            currentPartnerName={currentPartner.name}
            onCommitStocktaking={(...args) =>
              safeAction(() => handleCommitStocktaking(...args))
            }
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "staff_payroll" && (
          <StaffAndPayrollScreen
            employees={employees}
            transactions={employeeTransactions}
            currentPartnerName={currentPartner.name}
            onReverseEmployeeAction={(id)=>safeAction(()=>{
              engine.replace(reverseEmployeeAction(engine.state,id,currentPartner.name));
              addAuditLog('شؤون عمال',`عكس حركة العامل ${id} ومصروفها`);
            })}
            onClosePayrollPeriod={(id)=>safeAction(()=>{
              if(engine.hasPending) throw new Error('انتظر اكتمال حفظ التعديلات قبل إقفال شهر آخر');
              engine.replace(closePayrollPeriod(engine.state,id,currentPartner.id));
              addAuditLog('شؤون عمال',`إقفال شهر العامل ${id} وترحيل المستحقات`);
            })}
            onRecordEmployeeAction={(...args) =>
              safeAction(() => handleRecordEmployeeAction(...args))
            }
            onAddNewEmployee={(newEmp) =>
              safeAction(() => {
                if (
                  !newEmp.name.trim() ||
                  hasInvalidNumbers([
                    newEmp.baseMonthlySalary,
                    newEmp.dailyRate,
                    newEmp.workedDaysThisMonth,
                    newEmp.totalAdvances,
                    newEmp.totalDeductions,
                    newEmp.totalBonuses,
                    newEmp.totalPaidOut,
                  ])
                ) {
                  showToast(
                    "راجع بيانات العامل: الاسم مطلوب وقيم الرواتب والحركات أرقام غير سالبة.",
                  );
                  return;
                }
                const created: Employee = {
                  ...newEmp,
                  payrollPeriod: currentPayrollPeriod(),
                  openingPayable: 0,
                  id: crypto.randomUUID(),
                };
                setEmployees((prev) => [created, ...prev]);
                addAuditLog("شؤون عمال", `إضافة عامل: ${created.name}`);
                showToast(`✅ تمت إضافة العامل (${created.name})!`);
              })
            }
            onDeleteEmployee={(empId) => {
              safeAction(() => {
                if (employeeTransactions.some((t) => t.employeeId === empId)) {
                  showToast(
                    "للعامل حركات مسجلة (سلف/رواتب/خصومات)؛ لا يمكن حذفه للحفاظ على دقة السجلات.",
                  );
                  return;
                }
                setEmployees((prev) => prev.filter((e) => e.id !== empId));
                showToast("🗑️ تم حذف العامل!");
              });
            }}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "more" && (
          <MoreMenuScreen
            expenses={expenses}
            partners={partners}
            auditLogs={auditLogs}
            currentPartner={currentPartner}
            initialSubPage={moreInitialTab}
            showDemoTools={getSupabaseCredentials().url.startsWith("http://127.0.0.1:")}
            onAddExpense={(exp) =>
              safeAction(() => {
                engine.replace(
                  recordExpense(engine.snapshot.state, exp, currentPartner.id),
                );
                addAuditLog("مصروف", exp.title, exp.amount);
                showToast(
                  "تم تسجيل الحركة وتحديث حساب الشريك؛ تابع تأكيد الحفظ.",
                );
              })
            }
            onDeleteExpense={(expId) =>
              safeAction(() => {
                engine.replace(
                  cancelExpense(
                    engine.snapshot.state,
                    expId,
                    currentPartner.name,
                  ),
                );
                addAuditLog("مصروف", `إلغاء المصروف ${expId}`);
                showToast("تم إلغاء المصروف وعكس رصيد الشريك مع حفظ الأصل.");
              })
            }
            onUpdatePartnerAccount={(id, patch) => {
              safeAction(() => {
                setPartners((prev) =>
                  prev.map((p) =>
                    p.id === id
                      ? {
                          ...p,
                          ...patch,
                          avatarLetter:
                            (patch.name || p.name).trim().charAt(0) ||
                            p.avatarLetter,
                        }
                      : p,
                  ),
                );
                showToast("✅ تم تحديث حساب المالك!");
              });
            }}
            onClearAllDemoData={() => {
              downloadFullBackupJson(createBackup(engine.snapshot.state));
              if (
                window.confirm(
                  "تم تنزيل نسخة احتياطية. هل تريد تصفير بيانات المحل بالكامل؟",
                )
              )
                safeAction(handleClearAllDemoData);
            }}
            onClearTransactionsKeepCatalog={() => {
              downloadFullBackupJson(createBackup(engine.snapshot.state));
              if (
                window.confirm(
                  "تم تنزيل نسخة احتياطية. هل تريد تصفير الفواتير والأرصدة؟",
                )
              )
                safeAction(handleClearTransactionsKeepCatalog);
            }}
            onRestoreDefaultDemoData={handleRestoreDefaultDemoData}
            onDownloadBackupJson={() => {
              downloadFullBackupJson(createBackup(engine.snapshot.state));
              showToast("📥 تم تحميل النسخة الاحتياطية الكاملة بنجاح!");
            }}
            onExportFullExcel={async () => {
              try {
                await exportFullStoreExcel(
                  items,
                  salesInvoices,
                  purchaseInvoices,
                  suppliers,
                  customers,
                  expenses,
                  cashierDays,
                );
                showToast("📊 تم تصدير ملف الإكسيل الشامل للمحل بنجاح!");
              } catch {
                showToast("تعذر تصدير Excel؛ حاول مجددًا.");
              }
            }}
            onRestoreBackupJson={(data) => {
              try {
                const restored = parseBackup(data);
                engine.restore(restored);
                showToast(
                  "تم التحقق من النسخة واسترجاعها؛ تابع تأكيد الحفظ أعلى الشاشة.",
                );
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'تعذر استرجاع النسخة');
              }
            }}
            onLogout={handleLogout}
            onNavigate={(sc) => setActiveScreen(sc)}
            onBack={() => {
              setMoreInitialTab("menu");
              setActiveScreen("home");
            }}
          />
        )}

        {/* نافذة الفاتورة والواتساب والطباعة بعد البيع مباشرة */}
        {receiptModalInvoice && (
          <InvoiceReceiptModal
            invoice={receiptModalInvoice}
            customerPhone={
              customers.find(
                (c) =>
                  c.id === receiptModalInvoice.customerId ||
                  c.name === receiptModalInvoice.customerName,
              )?.phone || ""
            }
            onClose={() => setReceiptModalInvoice(null)}
          />
        )}

        {/* شريط القوائم السفلي المثبت دائماً في أسفل الشاشة مع قسم "الأقسام" بجانب "الرئيسية" */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E6DEC8] py-1.5 px-2 grid grid-cols-5 z-40 max-w-[445px] mx-auto shadow-[0_-4px_20px_rgba(30,22,18,0.06)]">
          {[
            { id: "home", label: "الرئيسية", icon: Home },
            { id: "sections", label: "الأقسام", icon: LayoutGrid },
            { id: "production", label: "الإنتاج", icon: Flame },
            { id: "inventory", label: "المخزن", icon: Package },
            { id: "more", label: "المزيد", icon: Settings },
          ].map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeScreen === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === "more") setMoreInitialTab("menu");
                  setActiveScreen(tab.id);
                }}
                className="flex flex-col items-center justify-center gap-0.5 py-0.5 transition"
              >
                <div
                  className={`px-3.5 py-1 rounded-full transition-all ${
                    isActive
                      ? "bg-[#1E1612] text-[#D4AF37] shadow-sm border border-[#C59B27]/50"
                      : "text-[#8C7B6B] hover:text-[#1E1612]"
                  }`}
                >
                  <IconComp className="w-4 h-4" />
                </div>
                <span
                  className={`text-[10px] ${
                    isActive
                      ? "font-black text-[#1E1612]"
                      : "font-semibold text-[#8C7B6B]"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
