import { useCashierQueue } from "../hooks/useCashierQueue";
import { useWorkspaceToast } from "../hooks/useWorkspaceToast";
import { createInventoryActions } from "../lib/inventoryActions";
import { useDashboardRead } from "../hooks/useDashboardRead";
import { saveRecipeDefinition } from "../lib/recipeCatalog";
import type { CatalogNameDraft, RecipeProductDefinition } from "../types/erp";
import { initialSalesHistoryView } from "../components/PagedSalesHistory";
import { useWorkspaceNavigation } from "../hooks/useWorkspaceNavigation";
import { initialPeriod, reportRange } from "../lib/reporting";
import { canView, canWrite, writePermissions, type WritePermission } from "../lib/userAccess";
import { cashierCostDetails, correctedCashierCost } from "../lib/cashierCosts";
import { salesForReports } from "../lib/cashierDays";
import { useState, useEffect, useMemo, useRef } from "react";
import { SalesInvoice, Partner, AuditLogEntry } from "../types/erp";
import { useErpStore } from "../hooks/useErpStore";
import { type StoreState } from "../lib/storeState";
import { businessDate } from "../lib/dates";

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

export function useWorkspaceController() {

  const {activeScreen,setActiveScreen,moreInitialTab,setMoreInitialTab}=useWorkspaceNavigation();
  const [reportPeriod,setReportPeriod]=useState(initialPeriod);
  const {toastNotification, setToastNotification, scheduleToastDismiss, pauseToastDismiss, showToast}=useWorkspaceToast();
  const [selectedFinancialPartnerId,setSelectedFinancialPartnerId]=useState('');
  const [historyEditing,setHistoryEditing]=useState(false);
  const [salesHistoryView,setSalesHistoryView]=useState(initialSalesHistoryView);
  const needsFullStore=!['home','sections','sales_invoices','shop_menu'].includes(activeScreen)||historyEditing;
  const cloud = useErpStore(needsFullStore);
  const { engine, member } = cloud;
  const mayWrite = (permission: WritePermission) => canWrite(member, permission);
  const accountPermissionLabels = writePermissions.filter(permission => mayWrite(permission.id)).map(permission => permission.label);
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
  const changeField = <K extends keyof StoreState>(key: K) =>
    (next: StoreState[K] | ((previous: StoreState[K]) => StoreState[K])) => engine.field(key, next);
  const setItems = changeField('items');
  const setProductionBatches = changeField('productionBatches');
  const setPurchaseInvoices = changeField('purchaseInvoices');
  const setSalesInvoices = changeField('salesInvoices');
  const setSuppliers = changeField('suppliers');
  const setCustomers = changeField('customers');
  const setExpenses = changeField('expenses');
  const setPartners = changeField('partners');
  const setAuditLogs = changeField('auditLogs');
  const setEmployees = changeField('employees');
  const setEmployeeTransactions = changeField('employeeTransactions');
  const setStocktakingRecords = changeField('stocktakingRecords');
  const setAccountPayments = changeField('accountPayments');

  const [receiptModalInvoice, setReceiptModalInvoice] =
    useState<SalesInvoice | null>(null);

  const returnBusy = useRef(false);
  const {queueError, queuedReports, setQueuedReports}=useCashierQueue(activeScreen==='cashier_sync',member?.userId,engine);

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
    if(engine.isOffline)throw Error('أدوات تصفير البيانات تحتاج اتصالًا بالخادم.');
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
    if(engine.isOffline)throw Error('أدوات تصفير البيانات تحتاج اتصالًا بالخادم.');
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

  return {
    activeScreen, setActiveScreen, moreInitialTab, setMoreInitialTab, reportPeriod, setReportPeriod,
    toastNotification, setToastNotification, scheduleToastDismiss, pauseToastDismiss, showToast,
    setSelectedFinancialPartnerId, historyEditing, setHistoryEditing, salesHistoryView,
    setSalesHistoryView, needsFullStore, cloud, engine, member, dashboard, needsTodayRead,
    dailyDashboard, recipeTargetId, purchaseTargetId, setPurchaseTargetId, setMovementId,
    setExpenseDetailId, setCashierDetailId, customerTargetId, setCustomerTargetId, customerView,
    setCustomerView, supplierView, setSupplierView, returnFromCustomer, openPurchase, openCustomer,
    openRecipes, confirmSave, loggedPartnerId, items, productionBatches, purchaseInvoices,
    salesInvoices, cashierDays, suppliers, customers, expenses, partners, auditLogs, employees,
    employeeTransactions, stocktakingRecords, accountPayments, expenseDetail, cashierDetail,
    movementItem, reportSales, cashierCosts, cashierDaysForDisplay, financialPartner, currentPartner,
    defineRecipe, requireFinancialPartner, safeAction, setItems, setSuppliers, setCustomers,
    setPartners, setEmployees, receiptModalInvoice, setReceiptModalInvoice, returnBusy, queueError,
    queuedReports, setQueuedReports, addAuditLog, handleLogout, handleExecuteProduction,
    handleSavePurchase, handleSaveSale, handleCommitStocktaking, handleRecordEmployeeAction,
    handleClearTransactionsKeepCatalog, handleClearAllDemoData, handleRestoreDefaultDemoData,
    saveInvoice, navigateScreen, mayWrite, accountPermissionLabels,
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
export type ActiveWorkspace = WorkspaceController & { member: NonNullable<WorkspaceController['member']> };
