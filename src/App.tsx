import {checkCustomerDetails, checkSupplierDetails} from './lib/contactDetails';
import {createInventoryActions} from './lib/inventoryActions';
import {useDashboardRead} from './hooks/useDashboardRead';
import {saveFinancialOpening} from './lib/financialOpening';
import {saveCatalogNameDraft,saveCatalogNameDraftChange} from './lib/catalogNameDrafts';
import {saveRecipeDefinition,saveRecipe} from './lib/recipeCatalog';
import type {CatalogNameDraft,RecipeProductDefinition} from './types/erp';
import {initialSalesHistoryView,PagedSalesHistory} from './components/PagedSalesHistory';
import {ScreenLoading} from './components/ScreenLoading';
import {AppErrorBoundary} from './components/AppErrorBoundary';
import {RecoveryDraftNotice} from './components/RecoveryDraftNotice';
import {Modal} from './components/Modal';
import {useWorkspaceNavigation} from './hooks/useWorkspaceNavigation';
import {DashboardScreen} from './components/DashboardScreen';
import {SaveStatus} from './components/SaveStatus';
import {WorkspaceQuickAccess} from './components/WorkspaceQuickAccess';
import {WorkspaceSidebar} from './components/WorkspaceSidebar';
import {OperationHeader} from './components/OperationHeader';
import {StockMovementModal} from './components/StockMovementModal';
import {ExpenseRecordDetail} from './components/ExpenseRecordDetail';
import {CashierDayDetail} from './components/CashierDayDetail';
import {initialPeriod,reportRange} from './lib/reporting';
import {canView,canWrite,writePermissions} from './lib/userAccess';
import {SectionsHub} from './components/SectionsHub';
import type {QueuedCashierReport} from './components/CashierDayScreen';
import {cashierCostDetails,correctedCashierCost} from './lib/cashierCosts';
import {attachCashierReport,approveCashierDay,salesForReports} from './lib/cashierDays';
import React, { useState, useEffect, useMemo, useRef } from "react";
import { LayoutGrid, AlertTriangle, BarChart3, Lock, CheckCircle2, AlertCircle, Info, X, Home, UserCheck } from "lucide-react";
import {
  InventoryItem,
  SalesInvoice,
  Supplier,
  Partner,
  AuditLogEntry,
  Employee,
} from "./types/erp";

import { getSupabaseClient, getSupabaseCredentials } from "./lib/supabaseSync";
import { useErpStore } from "./hooks/useErpStore";
import { parseBackup, createBackup, type StoreState } from "./lib/storeState";
import { reversePayment, saveSaleReturn, recordPayment, cancelPurchase, receivePurchaseRefund, recordExpense, cancelExpense } from "./lib/ledger";
import { businessDate } from "./lib/dates";
import { reverseEmployeeAction, closePayrollPeriod, currentPayrollPeriod } from './lib/payroll';
import { adjustCatalogItem, canDeleteCatalogItem } from './lib/catalogAdjustments';
import {
  downloadFullBackupJson,
  exportFullStoreExcel,
} from "./lib/backupExport";

const UsersScreen=React.lazy(()=>import('./components/UsersScreen').then(m=>({default:m.UsersScreen})));
const MenuEditor=React.lazy(()=>import('./components/MenuEditor'));
const CashierUploadScreen=React.lazy(()=>import('./components/CashierUploadScreen').then(m=>({default:m.CashierUploadScreen})));
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
const RecipesScreen=React.lazy(()=>import('./components/RecipesScreen').then(m=>({default:m.RecipesScreen})));
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
  const {activeScreen,setActiveScreen,moreInitialTab,setMoreInitialTab}=useWorkspaceNavigation();
  const screenKey = activeScreen === 'more' ? activeScreen + ':' + moreInitialTab : activeScreen;
  const workspaceMain = useRef<HTMLElement>(null);
  const lastScreen = useRef(screenKey);
  useEffect(() => {
    if (lastScreen.current !== screenKey) {
      workspaceMain.current?.focus();
      lastScreen.current = screenKey;
    }
  }, [screenKey]);
  const [reportPeriod,setReportPeriod]=useState(initialPeriod);
  const [toastNotification, setToastNotification] = useState<{
    id: number;
    message: string;
    tone: 'ok' | 'warn' | 'danger' | 'info';
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [selectedFinancialPartnerId,setSelectedFinancialPartnerId]=useState('');
  const [historyEditing,setHistoryEditing]=useState(false);
  const [salesHistoryView,setSalesHistoryView]=useState(initialSalesHistoryView);
  const needsFullStore=!['home','sections','sales_invoices','shop_menu'].includes(activeScreen)||historyEditing;
  const cloud = useErpStore(needsFullStore);
  const { engine, member } = cloud;
  const dashboard=useDashboardRead(member?.userId,!!member&&canView(member)&&['home','sections','sales_invoices'].includes(activeScreen),reportPeriod);
  const today = businessDate();
  const range = reportRange(reportPeriod, today);
  const needsTodayRead = today < range.from || today > range.to || Date.parse(range.to) - Date.parse(range.from) > 62 * 86400000;
  const dailyDashboard = useDashboardRead(member?.userId, !!member && canView(member) && activeScreen === 'home' && needsTodayRead, {kind:'today',from:today,to:today});
  const [recipeTargetId,setRecipeTargetId]=useState<string>();
  const [purchaseTargetId,setPurchaseTargetId]=useState<string>();
  const [movementId,setMovementId]=useState<string>();
  const [expenseDetailId,setExpenseDetailId]=useState<string>();
  const [cashierDetailId,setCashierDetailId]=useState<string>();
  const [customerTargetId,setCustomerTargetId]=useState<string>();
  const [customerView,setCustomerView]=useState({query:'',page:0});
  const [supplierView,setSupplierView]=useState({query:'',page:0});
  const [returnFromCustomer,setReturnFromCustomer]=useState('home');
  const openPurchase=(id:string)=>{setPurchaseTargetId(id);setActiveScreen('purchase');};
  const openCustomer=(id:string)=>{setReceiptModalInvoice(null);setReturnFromCustomer(activeScreen==='customers'?'home':activeScreen);setCustomerTargetId(id);setActiveScreen('customers');};
  const openRecipes=(targetId?:string)=>{setRecipeTargetId(targetId);setActiveScreen('recipes');};
  useEffect(()=>{if(activeScreen!=='sales_invoices')setHistoryEditing(false);},[activeScreen]);
  useEffect(()=>setSelectedFinancialPartnerId(''),[member?.userId,member?.partnerId]);
  useEffect(()=>{setSalesHistoryView(initialSalesHistoryView);setCustomerView({query:'',page:0});setSupplierView({query:'',page:0});},[member?.userId]);
  const pendingInvoice=useRef<{kind:'purchase'|'sale';id:string;userId:string|undefined;draft:string}>(undefined);
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
  const expenseDetail=expenseDetailId?expenses.find(expense=>expense.id===expenseDetailId):undefined;
  const cashierDetail=cashierDetailId?cashierDays.find(day=>day.id===cashierDetailId):undefined;
  const movementItem=movementId?items.find(item=>item.id===movementId):undefined;
  const reportSales=useMemo(()=>salesForReports({salesInvoices,cashierDays,purchaseInvoices}),[salesInvoices,cashierDays,purchaseInvoices]);
  const cashierCosts=useMemo(()=>cashierCostDetails(cashierDays,purchaseInvoices),[cashierDays,purchaseInvoices]);
  const cashierDaysForDisplay=useMemo(()=>cashierDays.map(day=>({
    ...day,correctedTotalCost:correctedCashierCost(day,cashierCosts.get(day.id)),
  })),[cashierDays,cashierCosts]);
  const linkedFinancialPartner=partners.find(p=>p.id===loggedPartnerId);
  const financialPartner=partners.find(p=>p.id===(selectedFinancialPartnerId||loggedPartnerId));
  const currentPartner={...(linkedFinancialPartner??unloadedPartner),id:linkedFinancialPartner?.id??'user:'+member?.userId,name:member?.displayName||linkedFinancialPartner?.name||'مستخدم',username:member?.username??'',role:member?.isOwner?'مالك النظام':'مستخدم النظام'};
  const defineRecipe=async(id:string,name:string,definition:RecipeProductDefinition,original?:CatalogNameDraft)=>{await saveRecipeDefinition(engine,id,name,definition,{name:currentPartner.name,id:member?.userId},original);openRecipes('draft:'+id);};
  const requireFinancialPartner=()=>{if(!financialPartner)throw Error('اختر حساب الشريك المالي للحركة؛ حساب المستخدم لا ينشئ حصة مالية');return financialPartner;};
  const safeAction = (action: () => void) => {
    try {
      engine.transaction(action);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذر تنفيذ العملية", 'danger');
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

  const scheduleToastDismiss = (id: number) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastNotification((prev) => (prev?.id === id ? null : prev));
    }, 5000);
  };

  const pauseToastDismiss = () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const showToast = (msg: string, explicitTone?: 'ok' | 'warn' | 'danger' | 'info') => {
    const inferredTone: 'ok' | 'warn' | 'danger' | 'info' =
      explicitTone ??
      (/^(?:تعذر|فشل|خطأ)/.test(msg.trim())
        ? 'danger'
        : /^(?:لا يمكن|حساب المورد مرتبط|حساب العميل مرتبط|أُلغيت|هذه فاتورة معتمدة)/.test(msg.trim())
          ? 'warn'
          : 'ok');
    const id = Date.now();
    setToastNotification({ id, message: msg, tone: inferredTone });
    scheduleToastDismiss(id);
  };

  const [queueError, setQueueError] = useState("");
  const queueBusy = React.useRef(false);
  const returnBusy = React.useRef(false);
  const [queuedReports,setQueuedReports]=useState<QueuedCashierReport[]>([]);
  useEffect(() => {
    if (!member || activeScreen!=="cashier_sync") return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let disposed = false;
    const processPending = async () => {
      if (disposed || queueBusy.current || document.visibilityState === "hidden" || !navigator.onLine || engine.snapshot.status !== "ready")
        return;
      queueBusy.current = true;
      try {
        const { data, error } = await sb
          .from("cashier_sync_queue")
          .select("id,file_name,sale_date,content_hash,report_kind,import_job_id")
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
    }, 15000);
    void processPending();
    window.addEventListener("online", processPending);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("online", processPending);
      void sb.removeChannel(channel);
    };
  }, [member?.userId, engine,activeScreen]);

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
    void cloud.signOut().catch((error) => showToast(error.message, 'danger'));
  };

  const {handleExecuteProduction, handleSavePurchase, handleSaveSale, handleCommitStocktaking, handleRecordEmployeeAction} =
    createInventoryActions({engine, currentPartner, requireFinancialPartner, addAuditLog, showToast});

  // 7. أدوات التحكم الشامل في البيانات (تصفير وحذف الداتا التجريبية)
  const handleClearTransactionsKeepCatalog = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        stock: 0,
      })),
    );
    setSalesInvoices([]);
    engine.field("cashierDays", []);
    engine.field("shifts", []);
    engine.field("financialOpenings", []);
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
    engine.field("cashierDays", []);
    engine.field("shifts", []);
    engine.field("financialOpenings", []);
    engine.field("catalogNameDrafts", []);
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


  async function saveInvoice<T extends {id:string;invoiceNumber:string}>(kind:'purchase'|'sale',data:unknown,create:()=>T,records:()=>T[]){
    if(engine.hasPending && !engine.isOffline)await confirmSave();
    const draft=JSON.stringify(data);
    const pending=pendingInvoice.current;
    if(pending?.kind===kind&&pending.userId===member?.userId){
      pendingInvoice.current=undefined;
      const existing=records().find(invoice=>invoice.id===pending.id);
      if(existing&&pending.draft===draft)return existing;
    }
    let invoice:T|undefined;
    if(!safeAction(()=>{invoice=create();})||!invoice)return undefined;
    pendingInvoice.current={kind,id:invoice.id,userId:member?.userId,draft};
    if(!engine.isOffline)await confirmSave();
    pendingInvoice.current=undefined;
    return invoice;
  }
  const navigateScreen=(screen:string)=>{
    setPurchaseTargetId(undefined);
    setCustomerTargetId(undefined);
    setReturnFromCustomer('home');
    setRecipeTargetId(undefined);
    if(screen==='expenses'||screen==='data_control'||screen==='partners'){setMoreInitialTab(screen);setActiveScreen('more');}
    else {if(screen==='more')setMoreInitialTab('menu');setActiveScreen(screen);}
  };
  // إذا لم يكن هناك شريك مسجل دخوله، نعرض صفحة الدخول الاحترافية الخاصة بـ (بُن العجوز)
  if (!cloud.authReady)
    return (
      <div className="p-8 text-center" role="status">
        جارٍ التحقق من الجلسة…
      </div>
    );
  if (cloud.passwordRecovery) return <PasswordRecoveryScreen passwordUpdated={cloud.recoveryPasswordUpdated} onUpdatePassword={cloud.updateRecoveredPassword} onCancel={cloud.cancelPasswordRecovery} />;
  if (!member)
    return (
      <LoginScreen
        onSignIn={cloud.signIn}
        onRequestPasswordReset={cloud.requestPasswordReset}
        onResendConfirmation={cloud.resendConfirmation}
        authError={cloud.authError}
      />
    );
  if(member.role==='cashier')return <CashierUploadScreen name={member.displayName} onLogout={handleLogout}/>;
  if(!canView(member))return <main dir="rtl" className="agouz-login"><section className="login-panel p-6 space-y-4"><h1 className="font-black">الحساب غير مخوّل لعرض بيانات المحل</h1><p>اطلب من المالك تحديد صلاحياتك ثم سجّل الدخول مجددًا.</p><button className="login-submit w-full" onClick={handleLogout}>تسجيل الخروج</button></section></main>;
  const recoveryAccess={userId:member.userId,activeKey:cloud.recoveryDraftKey,includeLegacy:member.isOwner};
  const blocked = (needsFullStore||engine.hasPending)&&!["ready", "dirty", "saving", "offline"].includes(cloud.status);
  const statusText =
    cloud.status === "offline"
      ? engine.hasPending ? "مسودات محفوظة على الجهاز وبانتظار المزامنة" : "الاتصال مقطوع. العمليات الجديدة ستُحفظ كمسودات على هذا الجهاز."
      : cloud.status === "saving"
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
    <div className="agouz-app min-h-screen bg-surface-page flex flex-col items-center justify-start"
      data-awaiting-summary={activeScreen === 'home' && !dashboard.data && !dashboard.error ? '' : undefined}>
      <a className="workspace-skip" href="#workspace-main" onClick={(event) => {
        event.preventDefault();
        workspaceMain.current?.focus();
      }}>انتقل إلى المحتوى</a>
      {getSupabaseCredentials().url.startsWith("http://127.0.0.1:") && (
        <div className="w-full bg-status-warn-bg text-status-warn border-b border-status-warn-line p-2 text-center text-xs font-bold">
          بيئة اختبار محلية — بيانات تجريبية منفصلة
        </div>
      )}
      <SaveStatus savedAt={cloud.savedAt} ready={cloud.status === 'ready'} message={needsFullStore || engine.hasPending || cloud.status==='offline' ? statusText : ''}/>
      {cloud.recoveryWarning&&<p role="status" className="w-full p-3 bg-status-warn-bg text-status-warn border-b border-status-warn-line text-sm">{cloud.recoveryWarning}</p>}
      <RecoveryDraftNotice key={member.userId} {...recoveryAccess}/>
      {queueError && (
        <div
          role="alert"
          className="w-full p-3 bg-status-danger-bg text-status-danger border-b border-status-danger-line text-sm font-bold"
        >
          {queueError}
        </div>
      )}
      {blocked && (
        <Modal title={statusText} dismissible={false}><div role="alert"><p>
              {cloud.error ||
                (!partners.some((p) => p.id === loggedPartnerId) &&
                cloud.status === "ready"
                  ? "هذا الحساب غير مرتبط بملف شريك داخل بيانات المحل"
                  : "")}
            </p>{["error", "conflict"].includes(cloud.status) && (
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
                {engine.hasPendingCashierAttachment ? (
                  <button className="border rounded p-2 m-1" onClick={() => {
                    if (!window.confirm('يلغي الخادم محاولة الإرفاق إذا لم تكن محفوظة. هل تريد المتابعة؟')) return;
                    void engine.discardCashierAttachment().then(result => {
                      if (result) {
                        if (result === 'saved') {
                          const attached = new Set(engine.state.cashierDays.flatMap(day => [day.financialReport?.sourceQueueId, day.itemsReport?.sourceQueueId]));
                          setQueuedReports(rows => rows.filter(row => !attached.has(row.id)));
                        }
                        showToast(result === 'saved' ? 'التقرير محفوظ بالفعل على الخادم.' : 'أُلغيت محاولة الإرفاق. اختر التقرير من جديد.');
                      }
                    }).catch(() => {});
                  }}>
                    التحقق من الإرفاق وإلغاء المحاولة
                  </button>
                ) : <button
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
                </button>}
                {!engine.hasPending && (
                  <button
                    className="border rounded p-2 m-1"
                    onClick={handleLogout}
                  >
                    تسجيل الخروج
                  </button>
                )}
              </>
            )}</div></Modal>
      )}

      {/* إشعار عائم دلالي */}
      {toastNotification && (
        <div role="region" aria-label="الإشعارات" className="app-toast-region">
          <div
            role={toastNotification.tone === 'danger' ? 'alert' : 'status'}
            aria-live={toastNotification.tone === 'danger' ? 'assertive' : 'polite'}
            data-tone={toastNotification.tone}
            className="app-toast"
            onMouseEnter={pauseToastDismiss}
            onMouseLeave={() => scheduleToastDismiss(toastNotification.id)}
            onFocus={pauseToastDismiss}
            onBlur={() => scheduleToastDismiss(toastNotification.id)}
          >
            <div className="app-toast-body">
              {toastNotification.tone === 'danger' ? (
                <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : toastNotification.tone === 'warn' ? (
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : toastNotification.tone === 'info' ? (
                <Info className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              <span>{toastNotification.message}</span>
            </div>
            <button
              type="button"
              className="app-toast-close"
              aria-label="إغلاق الإشعار"
              onClick={() => {
                pauseToastDismiss();
                setToastNotification(null);
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <WorkspaceSidebar name={currentPartner.name} screen={activeScreen==='more'&&moreInitialTab!=='menu'?moreInitialTab:activeScreen==='insights'?'reports':activeScreen} onNavigate={navigateScreen} isOwner={member.isOwner} canCreateSale={canWrite(member,'sales')} counts={dashboard.data?.counts ?? {}}/>
      <div className="app-workspace min-h-screen relative">
        <WorkspaceQuickAccess member={member} onNavigate={navigateScreen} showButton={activeScreen==='home'||activeScreen==='sections'}/>
        <main id="workspace-main" ref={workspaceMain} tabIndex={-1} aria-label="محتوى مساحة العمل" className="screen-stage" key={screenKey}>
        <AppErrorBoundary key={member.userId+':'+screenKey} recoveryAccess={recoveryAccess} onReset={()=>setActiveScreen('home')} insideWorkspace>
        {/* ================= 1. الشاشة الرئيسية: لوحة الإحصائيات والرسوم البيانية الاحترافية ================= */}
        {activeScreen === 'home'&&<DashboardScreen model={dashboard.data} dailyModel={needsTodayRead ? dailyDashboard.data : dashboard.data} dailyError={needsTodayRead ? dailyDashboard.error : dashboard.error} onRetryDaily={needsTodayRead ? dailyDashboard.retry : dashboard.retry} error={dashboard.error} onRetry={dashboard.retry} period={reportPeriod} onPeriod={setReportPeriod} name={currentPartner.name} isOwner={member?.isOwner} onNavigate={navigateScreen}/>}

        {activeScreen === "sections" && <SectionsHub
          counts={dashboard.data?.counts??{}}
          canManageCashier={canWrite(member,'cashier')}
          canCreateSale={canWrite(member,'sales')}
          onNavigate={navigateScreen}
          isOwner={member.isOwner}
        />}

        {needsFullStore&&!cloud.fullReady?<ScreenLoading/>:<React.Fragment>
        {activeScreen==='users'&&<UsersScreen access={member} partners={partners} onBack={()=>setActiveScreen('sections')}/>}
        {activeScreen==='shop_menu'&&member.isOwner&&<MenuEditor onBack={()=>setActiveScreen('sections')}/>}
        {/* ================= الشاشات الفرعية ================= */}
        {activeScreen === "purchase" && (
          <PurchaseScreen initialInvoiceId={purchaseTargetId}
            items={items}
            suppliers={suppliers}
            purchaseInvoices={purchaseInvoices}
            currentPartnerName={currentPartner.name}
            onSavePurchase={canWrite(member,'purchases') ? async data=>{
              const invoice=await saveInvoice('purchase',data,()=>handleSavePurchase(data),()=>engine.state.purchaseInvoices);
              if(!invoice)return false;
              showToast(engine.isOffline ? 'مسودة فاتورة الشراء محفوظة على الجهاز وبانتظار المزامنة.' : 'تم حفظ فاتورة المشتريات '+invoice.invoiceNumber);
              return true;
            } : undefined}
            onReceiveRefund={canWrite(member,'purchases') && !engine.isOffline ? async (invoiceId, amount, date) => {
              if(engine.hasPending)throw Error('انتظر تأكيد الحفظ الحالي ثم أعد المحاولة.');
              engine.replace(receivePurchaseRefund(engine.state,invoiceId,amount,date,{id:member.userId,name:currentPartner.name}));
              await engine.flush();
              if(!engine.hasPending && engine.snapshot.status==='ready')showToast('تم تسجيل استلام المبلغ من المورد.');
            } : undefined}
            onDeletePurchaseInvoice={canWrite(member,'purchases') ? (invId) => {
              safeAction(() => {
                engine.replace(
                  cancelPurchase(
                    engine.state,
                    invId,
                    currentPartner.name,
                  ),
                );
                addAuditLog("مرتجع", `إلغاء فاتورة مشتريات ${invId}`);
                showToast(
                  "تم إلغاء الفاتورة وعكس المخزون والمديونية مع حفظ الأصل ومبلغ الاسترداد.",
                );
              });
            } : undefined}
            onQuickAddSupplier={canWrite(member,'contacts') ? (newSup) => {
              return safeAction(() => {
                checkSupplierDetails(newSup);
                const created: Supplier = {
                  ...newSup,
                  id: crypto.randomUUID(),
                };
                setSuppliers((prev) => [created, ...prev]);
                showToast(`✅ تمت إضافة المورد (${created.name})!`);
              });
            } : undefined}
            onQuickAddItem={canWrite(member,'catalog') ? (newItem) => {
              return safeAction(() => {
                const created: InventoryItem = {
                  ...newItem,
                  id: crypto.randomUUID(),
                  openingStock: newItem.stock,
                };
                setItems((prev) => [created, ...prev]);
                showToast(`✅ تمت إضافة الصنف (${created.name}) للمخزن!`);
              });
            } : undefined}
            onBack={()=>{setActiveScreen(purchaseTargetId?'suppliers':'sections');setPurchaseTargetId(undefined);}}
          />
        )}

        {activeScreen==='recipes'&&<RecipesScreen items={items} drafts={cloud.state.catalogNameDrafts} initialTargetId={recipeTargetId} canManage={canWrite(member,'catalog')} onDefine={defineRecipe} onSave={async(target,recipe)=>{await saveRecipe(engine,target,recipe,{name:currentPartner.name,id:member?.userId});showToast('تم تأكيد حفظ الوصفة وتكلفتها');}} onBack={()=>setActiveScreen('sections')}/>}
        {activeScreen === "production" && (
          <ProductionAndRecipesScreen
            items={items}
            productionBatches={productionBatches}
            canRunProduction={canWrite(member,'production')}
            currentPartnerName={currentPartner.name}
            onOpenRecipes={()=>openRecipes()}
            reservedCodes={cloud.state.catalogNameDrafts.flatMap(d=>d.definition?[d.definition.code]:[])}
            onDefineRecipe={canWrite(member,'catalog')?defineRecipe:undefined}
            onExecuteProduction={(...args) => {
              try {
                return engine.transaction(() =>
                  handleExecuteProduction(...args),
                );
              } catch (error) {
                return { ok: false, message: (error as Error).message };
              }
            }}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === 'sales_pos' && (canWrite(member,'sales') ? <WholesaleInvoiceScreen items={items} customers={customers} currentPartnerName={currentPartner.name} onBack={()=>setActiveScreen('home')} onSaveSale={async data=>{
          const invoice=await saveInvoice('sale',data,()=>{
            const result=handleSaveSale(data);
            if(!result)throw Error('تعذر اعتماد الفاتورة');
            return result;
          },()=>engine.state.salesInvoices);
          if(!invoice)return false;
          if(engine.isOffline)showToast('مسودة فاتورة البيع محفوظة على الجهاز وبانتظار المزامنة.');
          else setReceiptModalInvoice(invoice);
          setActiveScreen('home');
          return true;
        }}/> : <OperationHeader title="فواتير الجملة" description="هذا الحساب يمكنه مراجعة سجل البيع. إنشاء الفواتير يتطلب صلاحية المبيعات." icon={Lock} onBack={()=>setActiveScreen('sections')}>
          <button type="button" onClick={()=>navigateScreen('sales_invoices')}>فتح سجل البيع</button>
        </OperationHeader>)}
        {activeScreen === 'cashier_sync' && <CashierDayScreen items={items} days={cashierDaysForDisplay} queued={queuedReports} canManage={canWrite(member,'cashier')} onBack={()=>setActiveScreen('home')} onAttach={async(date,report)=>{if(engine.hasPending)await confirmSave();engine.attachCashier(attachCashierReport(engine.state,date,report),report.file.sourceQueueId);await confirmSave();if(report.file.sourceQueueId)setQueuedReports(rows=>rows.filter(r=>r.id!==report.file.sourceQueueId));}} onApprove={async(id)=>{if(engine.isOffline)throw Error('اعتماد تقارير الكاشير يحتاج اتصالًا بالخادم.');engine.replace(approveCashierDay(engine.state,id,currentPartner.name));await confirmSave();}}/>}

        {activeScreen === "products" && (
          <ProductsCatalogScreen onOpenMovement={setMovementId}
            canManage={canWrite(member,'catalog')}
            onOpenRecipe={openRecipes}
            onDefineRecipe={canWrite(member,'catalog')?defineRecipe:undefined}
            nameDrafts={cloud.state.catalogNameDrafts}
            onChangeNameDraft={canWrite(member,'catalog')?(id,name)=>saveCatalogNameDraftChange(engine,id,name,{name:currentPartner.name,id:member?.userId}):undefined}
            onCompleteNameDraft={canWrite(member,'catalog')?(id,item)=>saveCatalogNameDraft(engine,id,item,{name:currentPartner.name,id:member?.userId}):undefined}
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
            onDeleteItem={async(id) => {
              if(engine.hasPending)await confirmSave();
              if(!engine.state.items.some(i=>i.id===id))return;
              if(!safeAction(() => {
                if (!canDeleteCatalogItem(engine.state,id)) {
                  throw Error("لا يمكن حذف صنف مرتبط بوصفة أو فاتورة أو حركة مخزون.");
                }
                setItems((prev) => prev.filter((i) => i.id !== id));
                addAuditLog("تعديل وصفة/صنف", `حذف منتج من الكتالوج`);
              }))throw Error('تعذر حذف المنتج؛ راجع حالة الحفظ أو التنبيه');
              await confirmSave();showToast("تم حذف المنتج بنجاح");
            }}
            onNavigateToProduction={() => setActiveScreen("production")}
            onNavigateToInventory={() => setActiveScreen("inventory")}
            onNavigateToPurchase={() => setActiveScreen("purchase")}
            onBack={() => setActiveScreen("sections")}
          />
        )}

        {activeScreen === "inventory" && (
          <InventoryScreen onOpenMovement={setMovementId}
            items={items}
            canManage={canWrite(member,'catalog')}
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
          <ShortagesScreen onOpenMovement={setMovementId}
            items={items}
            onNavigateToPurchase={() => setActiveScreen("purchase")}
            onNavigateToProduction={() => setActiveScreen("production")}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "suppliers" && (
          <SuppliersAndCustomersScreen canManageContacts={canWrite(member,'contacts')} canManagePayments={canWrite(member,'collections')} onUpdateContact={(mode,id,details)=>safeAction(()=>{if(mode==='customers'){checkCustomerDetails(details);setCustomers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}else{checkSupplierDetails(details);setSuppliers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}addAuditLog("تعديل وصفة/صنف","تحديث بيانات التواصل");})}
            mode="suppliers" listView={supplierView} onListViewChange={setSupplierView} onOpenPurchase={openPurchase}
            suppliers={suppliers}
            customers={customers}
            purchaseInvoices={purchaseInvoices}
            salesInvoices={salesInvoices}
            accountPayments={accountPayments}
            onPaySupplier={(supId, amount, notes) =>
              safeAction(() => {
                engine.replace(
                  recordPayment(
                    engine.state,
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
                    engine.state,
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
          <SuppliersAndCustomersScreen canManageContacts={canWrite(member,'contacts')} canManagePayments={canWrite(member,'collections')} onUpdateContact={(mode,id,details)=>safeAction(()=>{if(mode==='customers'){checkCustomerDetails(details);setCustomers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}else{checkSupplierDetails(details);setSuppliers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}addAuditLog("تعديل وصفة/صنف","تحديث بيانات التواصل");})}
            mode="customers" listView={customerView} onListViewChange={setCustomerView} initialStatementId={customerTargetId}
            onOpenSale={id=>setReceiptModalInvoice(salesInvoices.find(invoice=>invoice.id===id)??null)}
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
                    engine.state,
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
                    engine.state,
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
            onBack={()=>{setCustomerTargetId(undefined);setActiveScreen(returnFromCustomer);}}
          />
        )}

        {activeScreen === "sales_invoices" && (!historyEditing?<PagedSalesHistory view={salesHistoryView} onViewChange={setSalesHistoryView} onOpenCustomer={openCustomer} onBack={()=>setActiveScreen('home')} onManage={canWrite(member,'sales')?()=>setHistoryEditing(true):undefined}/>:(
          <SalesInvoicesAndReturnsScreen
            cashierDays={cashierDaysForDisplay}
            salesInvoices={salesInvoices}
            customers={customers}
            onReturnInvoice={async (invId) => {
              if(returnBusy.current)return;
              if(!window.confirm('تأكيد المرتجع الاستثنائي وعكس قيمته المالية؟ تعود البضاعة بتكلفة الفاتورة الأصلية، ومكونات المشروبات والتحويجات تظل مستهلكة.'))return;
              returnBusy.current=true;
              try {
                await saveSaleReturn(engine,invId,currentPartner.name,member?.userId);
                showToast('تم حفظ المرتجع وعكس المستحق وتحديث متوسط تكلفة البضاعة؛ المكونات تظل مستهلكة.');
              } catch(error) {
                showToast(error instanceof Error?error.message:'تعذر تأكيد حفظ المرتجع', 'danger');
              } finally {returnBusy.current=false;}
            }}
            onDeleteInvoice={() => {
              showToast(
                "هذه فاتورة معتمدة؛ استخدم المرتجع لعكس أثرها مع الاحتفاظ بالأصل.",
              );
            }}
            onBack={() => setActiveScreen("home")}
          />
        ))}

        {activeScreen === "insights" && (
          <SmartInsightsScreen
            period={reportPeriod} onPeriod={setReportPeriod}
            items={items}
            salesInvoices={reportSales}
            customers={customers}
            onNavigate={(sc) => {if(sc==='partners'){setMoreInitialTab('partners');setActiveScreen('more');}else setActiveScreen(sc);}}
            onBack={() => setActiveScreen("reports")}
          />
        )}

        {activeScreen === "reports" && (
          <ProfitReportsScreen
            onOpenRecord={(kind,id)=>{
              if(kind==='expense')setExpenseDetailId(id);
              else if(cashierDays.some(day=>day.id===id))setCashierDetailId(id);
              else setReceiptModalInvoice(salesInvoices.find(invoice=>invoice.id===id)??null);
            }}
            financeState={cloud.state}
            onSaveOpening={member?.isOwner?(date,amount,reason)=>saveFinancialOpening(engine,date,amount,reason,{id:member.userId,name:currentPartner.name}):undefined}
            items={items}
            salesInvoices={reportSales}
            expenses={expenses}
            partners={partners}
            period={reportPeriod} onPeriod={setReportPeriod}
            onInsights={()=>setActiveScreen('insights')}
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "stocktaking" && (
          <StocktakingScreen
            items={items}
            canManage={canWrite(member,'stocktaking')}
            auditRecords={stocktakingRecords}
            employees={canWrite(member,'staff')?employees:[]}
            currentPartnerName={currentPartner.name}
            onCommitStocktaking={(...args) =>
              safeAction(() => handleCommitStocktaking(...args))
            }
            onBack={() => setActiveScreen("home")}
          />
        )}

        {activeScreen === "staff_payroll" && (
          <StaffAndPayrollScreen onOpenExpense={setExpenseDetailId}
            canManage={canWrite(member,'staff')}
            partners={partners}
            selectedFinancialPartnerId={financialPartner?.id??''}
            onSelectFinancialPartnerId={setSelectedFinancialPartnerId}
            employees={employees}
            transactions={employeeTransactions}
            currentPartnerName={currentPartner.name}
            onReverseEmployeeAction={(id)=>safeAction(()=>{
              engine.replace(reverseEmployeeAction(engine.state,id,currentPartner.name));
              addAuditLog('شؤون عمال',`عكس حركة العامل ${id} ومصروفها`);
            })}
            onClosePayrollPeriod={(id)=>safeAction(()=>{
              if(engine.hasPending) throw new Error('انتظر اكتمال حفظ التعديلات قبل إقفال شهر آخر');
              engine.replace(closePayrollPeriod(engine.state,id,requireFinancialPartner().id));
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
            key={moreInitialTab}
            expenses={expenses}
            partners={partners}
            auditLogs={auditLogs}
            currentPartner={currentPartner}
            accountPermissions={writePermissions.filter(permission=>canWrite(member,permission.id)).map(permission=>permission.label)}
            canManageData={member.isOwner}
            canManageExpenses={canWrite(member,'expenses')}
            canEditPartners={canWrite(member,'partners')}
            onSavePartners={(next)=>safeAction(()=>{engine.field('partners',next);})}
            selectedFinancialPartnerId={financialPartner?.id??''}
            onSelectFinancialPartnerId={setSelectedFinancialPartnerId}
            initialSubPage={moreInitialTab} showBackupHealth={member?.isOwner} onOpenCashier={()=>navigateScreen("cashier_sync")}
            showDemoTools={getSupabaseCredentials().url.startsWith("http://127.0.0.1:")}
            onAddExpense={(exp) =>
              safeAction(() => {
                engine.replace(
                  recordExpense(engine.state, {...exp,partnerName:requireFinancialPartner().name}, requireFinancialPartner().id),
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
                    engine.state,
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
                showToast("تعذر تصدير Excel؛ حاول مجددًا.", 'danger');
              }
            }}
            onRestoreBackupJson={(data) => {
              try {
                if(!member.isOwner)throw Error('استعادة البيانات متاحة للمالك الرئيسي فقط');
                const restored = parseBackup(data);
                engine.restore(restored);
                showToast(
                  "تم التحقق من النسخة واسترجاعها؛ تابع تأكيد الحفظ أعلى الشاشة.",
                );
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'تعذر استرجاع النسخة', 'danger');
              }
            }}
            onLogout={handleLogout}
            onNavigate={(sc) => setActiveScreen(sc)}
            onBack={() => {
              setActiveScreen(moreInitialTab==='menu'?'home':'sections');
              setMoreInitialTab("menu");
            }}
          />
        )}

        {expenseDetail&&<ExpenseRecordDetail expense={expenseDetail} onClose={()=>setExpenseDetailId(undefined)}/>}
        {cashierDetail&&<CashierDayDetail day={{...cashierDetail,correctedTotalCost:correctedCashierCost(cashierDetail,cashierCosts.get(cashierDetail.id)),
          costCorrections:cashierCosts.get(cashierDetail.id)?.map(({line,...detail})=>({itemId:line.itemId,...detail}))}} names={Object.fromEntries(items.map(item=>[item.id,item.name]))} onClose={()=>setCashierDetailId(undefined)}/>}
        {movementItem&&<StockMovementModal item={movementItem} documents={cloud.state} onClose={()=>setMovementId(undefined)}/> }
        {receiptModalInvoice && (
          <InvoiceReceiptModal
            invoice={receiptModalInvoice}
            onOpenCustomer={openCustomer}
            customerPhone={
              customers.find(
                (c) =>
                  c.id === receiptModalInvoice.customerId ||
                  (!receiptModalInvoice.customerId && c.name === receiptModalInvoice.customerName),
              )?.phone || ""
            }
            onClose={() => setReceiptModalInvoice(null)}
          />
        )}

        </React.Fragment>}
        </AppErrorBoundary>
        </main>
        {/* شريط القوائم السفلي المثبت دائماً في أسفل الشاشة مع قسم "الأقسام" بجانب "الرئيسية" */}
        <nav aria-label="التنقل الرئيسي" className="workspace-nav fixed bottom-0 left-0 right-0 workspace-nav-surface border-t py-1.5 px-2 grid grid-cols-4 mx-auto">
          {[
            { id: "home", label: "الرئيسية", icon: Home },
            { id: "sections", label: "الأقسام", icon: LayoutGrid },
            { id: "reports", label: "التقارير", icon: BarChart3 },
            { id: "more", label: "حسابي", icon: UserCheck },
          ].map((tab) => {
            const IconComp = tab.icon;
            const navScreen=activeScreen==='more'?(moreInitialTab==='menu'?'more':'sections'):activeScreen==='insights'?'reports':['home','reports','sections'].includes(activeScreen)?activeScreen:'sections';
            const isActive = navScreen === tab.id;
            return (
              <button
                key={tab.id}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigateScreen(tab.id)}
                className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 py-0.5"
              >
                <div
                  className="px-3.5 py-1 rounded-full border border-transparent"
                >
                  <IconComp className="w-4 h-4" aria-hidden="true" />
                </div>
                <span>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
