import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import {
  InventoryItem,
  ProductionBatch,
  PurchaseInvoice,
  SalesInvoice,
  SalesInvoiceItem,
  Supplier,
  Customer,
  Expense,
  Partner,
  AuditLogEntry,
  ShiftRecord,
  RecipeIngredient,
  Employee,
  EmployeeTransaction,
  StocktakingAuditRecord,
  StocktakingItemVariance,
  AccountPaymentRecord,
} from './types/erp';
import {
  INITIAL_ITEMS,
  INITIAL_PRODUCTION_BATCHES,
  INITIAL_PURCHASE_INVOICES,
  INITIAL_SALES_INVOICES,
  INITIAL_SUPPLIERS,
  INITIAL_CUSTOMERS,
  INITIAL_EXPENSES,
  INITIAL_PARTNERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_SHIFTS,
  INITIAL_EMPLOYEES,
  INITIAL_EMPLOYEE_TRANSACTIONS,
  INITIAL_STOCKTAKING_RECORDS,
  INITIAL_ACCOUNT_PAYMENTS,
  calculateRecipeTotalCost,
  convertToBaseUnit,
} from './data/initialData';
import { LoginScreen } from './components/LoginScreen';
import { PurchaseScreen } from './components/PurchaseScreen';
import { ProductionAndRecipesScreen } from './components/ProductionAndRecipesScreen';
import {
  SmartInsightsScreen,
  ProfitReportsScreen,
} from './components/ReportsAndInsightsScreens';
import {
  SalesPosScreen,
  CashierSyncScreen,
} from './components/SalesAndCashierSyncScreens';
import {
  ProductsCatalogScreen,
  InventoryScreen,
  ShortagesScreen,
  SuppliersAndCustomersScreen,
  SalesInvoicesAndReturnsScreen,
  MoreMenuScreen,
} from './components/ManagementScreens';
import {
  StocktakingScreen,
  StaffAndPayrollScreen,
} from './components/StocktakingAndStaffScreens';
import {
  InvoiceReceiptModal,
  downloadFullBackupJson,
  exportFullStoreExcel,
} from './components/ReceiptAndStatementModals';
import { ParsedCashierRow, mapRawCashierRows } from './lib/cashierExcelParser';
import { getSupabaseClient } from './lib/supabaseSync';

const LOCAL_STATE_KEY = 'bon_elagouz_erp_state_v3';
const SESSION_OWNER_KEY = 'bon_elagouz_logged_owner_v2';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<string>('home');
  const [moreInitialTab, setMoreInitialTab] = useState<
    'menu' | 'data_control' | 'expenses' | 'partners' | 'shifts' | 'cloud'
  >('menu');
  const [hideProfits, setHideProfits] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [toastNotification, setToastNotification] = useState<string | null>(
    null
  );

  // تحميل البيانات من التخزين المحلي أو البيانات الافتراضية لمحل (بُن العجوز)
  const [items, setItems] = useState<InventoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved) return JSON.parse(saved).items || INITIAL_ITEMS;
    } catch {}
    return INITIAL_ITEMS;
  });

  const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>(
    () => {
      try {
        const saved = localStorage.getItem(LOCAL_STATE_KEY);
        if (saved)
          return (
            JSON.parse(saved).productionBatches || INITIAL_PRODUCTION_BATCHES
          );
      } catch {}
      return INITIAL_PRODUCTION_BATCHES;
    }
  );

  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(
    () => {
      try {
        const saved = localStorage.getItem(LOCAL_STATE_KEY);
        if (saved)
          return (
            JSON.parse(saved).purchaseInvoices || INITIAL_PURCHASE_INVOICES
          );
      } catch {}
      return INITIAL_PURCHASE_INVOICES;
    }
  );

  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved)
        return JSON.parse(saved).salesInvoices || INITIAL_SALES_INVOICES;
    } catch {}
    return INITIAL_SALES_INVOICES;
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved) return JSON.parse(saved).suppliers || INITIAL_SUPPLIERS;
    } catch {}
    return INITIAL_SUPPLIERS;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved) return JSON.parse(saved).customers || INITIAL_CUSTOMERS;
    } catch {}
    return INITIAL_CUSTOMERS;
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved) return JSON.parse(saved).expenses || INITIAL_EXPENSES;
    } catch {}
    return INITIAL_EXPENSES;
  });

  const [partners, setPartners] = useState<Partner[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved) {
        const loaded: Partner[] = JSON.parse(saved).partners || INITIAL_PARTNERS;
        return loaded.map((p, idx) => ({
          ...INITIAL_PARTNERS[idx],
          ...p,
          username: p.username || INITIAL_PARTNERS[idx]?.username || `owner${idx + 1}`,
          password: p.password || INITIAL_PARTNERS[idx]?.password || '123',
        }));
      }
    } catch {}
    return INITIAL_PARTNERS;
  });

  // حالة تسجيل الدخول المستقلة لكل مالك من الـ 4 مالكين
  const [loggedPartnerId, setLoggedPartnerId] = useState<string | null>(() => {
    return sessionStorage.getItem(SESSION_OWNER_KEY) || null;
  });

  const currentPartner = useMemo(
    () => partners.find((p) => p.id === loggedPartnerId) || partners[0],
    [partners, loggedPartnerId]
  );

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved) return JSON.parse(saved).auditLogs || INITIAL_AUDIT_LOGS;
    } catch {}
    return INITIAL_AUDIT_LOGS;
  });

  const [shifts] = useState<ShiftRecord[]>(INITIAL_SHIFTS);

  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved) return JSON.parse(saved).employees || INITIAL_EMPLOYEES;
    } catch {}
    return INITIAL_EMPLOYEES;
  });

  const [employeeTransactions, setEmployeeTransactions] = useState<
    EmployeeTransaction[]
  >(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved)
        return (
          JSON.parse(saved).employeeTransactions ||
          INITIAL_EMPLOYEE_TRANSACTIONS
        );
    } catch {}
    return INITIAL_EMPLOYEE_TRANSACTIONS;
  });

  const [stocktakingRecords, setStocktakingRecords] = useState<
    StocktakingAuditRecord[]
  >(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved)
        return (
          JSON.parse(saved).stocktakingRecords || INITIAL_STOCKTAKING_RECORDS
        );
    } catch {}
    return INITIAL_STOCKTAKING_RECORDS;
  });

  const [accountPayments, setAccountPayments] = useState<
    AccountPaymentRecord[]
  >(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      if (saved)
        return JSON.parse(saved).accountPayments || INITIAL_ACCOUNT_PAYMENTS;
    } catch {}
    return INITIAL_ACCOUNT_PAYMENTS;
  });

  const [receiptModalInvoice, setReceiptModalInvoice] =
    useState<SalesInvoice | null>(null);

  const showToast = (msg: string) => {
    setToastNotification(msg);
    setTimeout(() => {
      setToastNotification((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // حفظ تلقائي في الجهاز ومزامنة مع Supabase إن وجد
  useEffect(() => {
    const payload = {
      items,
      productionBatches,
      purchaseInvoices,
      salesInvoices,
      suppliers,
      customers,
      expenses,
      partners,
      auditLogs,
      employees,
      employeeTransactions,
      stocktakingRecords,
      accountPayments,
    };
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(payload));
    } catch {}

    const sb = getSupabaseClient();
    if (sb) {
      sb.from('bon_elagouz_store')
        .upsert({
          id: 'main_store',
          updated_at: new Date().toISOString(),
          updated_by: currentPartner?.name || 'شريك',
          items,
          production_batches: productionBatches,
          purchase_invoices: purchaseInvoices,
          sales_invoices: salesInvoices,
          suppliers,
          customers,
          expenses,
          partners,
          audit_logs: auditLogs,
        })
        .then(() => {});
    }
  }, [
    items,
    productionBatches,
    purchaseInvoices,
    salesInvoices,
    suppliers,
    customers,
    expenses,
    partners,
    auditLogs,
    employees,
    employeeTransactions,
    stocktakingRecords,
    accountPayments,
    currentPartner,
  ]);

  // الاستماع اللحظي لـ Supabase لشيتات الكاشير التلقائية (cashier_sync_queue)
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const channel = sb
      .channel('bon-elagouz-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cashier_sync_queue',
        },
        (payload) => {
          const newRecord = payload.new as {
            id: string;
            file_name: string;
            raw_rows: Record<string, unknown>[];
            processed: boolean;
          };
          if (newRecord && !newRecord.processed && newRecord.raw_rows) {
            const parsed = mapRawCashierRows(newRecord.raw_rows, items);
            if (parsed.length > 0) {
              handleImportCashierRows(parsed, newRecord.file_name);
              sb.from('cashier_sync_queue')
                .update({
                  processed: true,
                  processed_at: new Date().toISOString(),
                })
                .eq('id', newRecord.id)
                .then(() => {});
            }
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [items]);

  const addAuditLog = (
    actionType: AuditLogEntry['actionType'],
    description: string,
    amount?: number,
    customActor?: string
  ) => {
    const entry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      partnerName: customActor || currentPartner.name,
      actionType,
      description,
      amount,
    };
    setAuditLogs((prev) => [entry, ...prev]);
  };

  const handleLoginSuccess = (partner: Partner, rememberMe: boolean) => {
    setLoggedPartnerId(partner.id);
    if (rememberMe) {
      sessionStorage.setItem(SESSION_OWNER_KEY, partner.id);
    }
    addAuditLog(
      'دخول للنظام',
      `تسجيل دخول بحساب المالك (@${partner.username})`,
      undefined,
      partner.name
    );
    showToast(`مرحباً بك يا ${partner.name.split('(')[0].trim()} في نظام بُن العجوز ☕`);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_OWNER_KEY);
    setLoggedPartnerId(null);
    setActiveScreen('home');
  };

  // إعادة حساب تكلفة جميع التوليفات والمشروبات التي لها وصفة بناءً على أحدث تكلفة للخامات
  const recalculateAllRecipeCosts = (currentCatalog: InventoryItem[]) => {
    const step1 = currentCatalog.map((item) => {
      if (
        item.category === 'manufactured_blend' &&
        item.hasRecipe &&
        item.recipe &&
        item.recipe.length > 0
      ) {
        const newCost = calculateRecipeTotalCost(item.recipe, currentCatalog);
        return { ...item, costPrice: newCost };
      }
      return item;
    });
    return step1.map((item) => {
      if (
        item.category === 'drink_recipe' &&
        item.hasRecipe &&
        item.recipe &&
        item.recipe.length > 0
      ) {
        const newCost = calculateRecipeTotalCost(item.recipe, step1);
        return { ...item, costPrice: newCost };
      }
      return item;
    });
  };

  // 1. تنفيذ أمر إنتاج وتخليط توليفة في قسم الإنتاج
  const handleExecuteProduction = (
    blendId: string,
    quantityKg: number,
    notes: string
  ): { ok: boolean; message: string } => {
    const blend = items.find((i) => i.id === blendId);
    if (!blend || !blend.recipe || blend.recipe.length === 0) {
      return { ok: false, message: 'هذه التوليفة ليس لها وصفة محددة بعد.' };
    }

    for (const ing of blend.recipe) {
      const raw = items.find((i) => i.id === ing.ingredientId);
      if (!raw) continue;
      const reqInBase =
        convertToBaseUnit(ing.quantity, ing.unit, raw.baseUnit) * quantityKg;
      if (raw.stock < reqInBase) {
        return {
          ok: false,
          message: `رصيد (${raw.name}) غير كافٍ! المتاح: ${raw.stock} كجم والمطلوب: ${reqInBase} كجم.`,
        };
      }
    }

    const consumedDetails: ProductionBatch['ingredientsConsumed'] = [];
    let totalBatchCost = 0;

    const updatedCatalog = items.map((item) => {
      const recipeIng = blend.recipe?.find((r) => r.ingredientId === item.id);
      if (recipeIng) {
        const usedInBase = Number(
          (
            convertToBaseUnit(recipeIng.quantity, recipeIng.unit, item.baseUnit) *
            quantityKg
          ).toFixed(3)
        );
        const ingCost = Number((usedInBase * item.costPrice).toFixed(2));
        totalBatchCost += ingCost;
        consumedDetails.push({
          ingredientId: item.id,
          ingredientName: item.name,
          quantityUsed: usedInBase,
          displayQuantity:
            item.baseUnit === 'kg'
              ? `${usedInBase} كجم (${Math.round(usedInBase * 1000)} جم)`
              : `${usedInBase} قطعة`,
          cost: ingCost,
        });
        return {
          ...item,
          stock: Number(Math.max(0, item.stock - usedInBase).toFixed(3)),
        };
      }
      return item;
    });

    const unitCostPerKg = Number((totalBatchCost / quantityKg).toFixed(2));

    const finalCatalog = updatedCatalog.map((item) => {
      if (item.id === blendId) {
        return {
          ...item,
          stock: Number((item.stock + quantityKg).toFixed(3)),
          costPrice: unitCostPerKg,
        };
      }
      return item;
    });

    const newBatch: ProductionBatch = {
      id: `batch-${Date.now()}`,
      batchNumber: `PRD-2026-${15 + productionBatches.length}`,
      date: new Date().toLocaleDateString('ar-EG'),
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
      'إنتاج توليفة',
      `تم تصنيع ${quantityKg} كجم من (${blend.name}) وسحب الحبوب الخام والتحويجة من المخزن وإضافتها لرصيد التوليفة`,
      totalBatchCost
    );
    showToast(
      `✅ تم تصنيع ${quantityKg} كجم من (${blend.name}) وإضافتها لرصيد المخزن بنجاح!`
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
    invoiceData: Omit<PurchaseInvoice, 'id' | 'invoiceNumber'>
  ) => {
    const invNum = `PUR-${1043 + purchaseInvoices.length}`;
    const newInvoice: PurchaseInvoice = {
      ...invoiceData,
      id: `pur-${Date.now()}`,
      invoiceNumber: invNum,
    };

    const nextItems = items.map((item) => {
      const purchasedLine = invoiceData.items.find((l) => l.itemId === item.id);
      if (!purchasedLine) return item;

      const oldStock = Math.max(0, item.stock);
      const newStock = Number((oldStock + purchasedLine.quantity).toFixed(3));
      const newWac =
        purchasedLine.updateProductCost && newStock > 0
          ? Number(
              (
                (oldStock * item.costPrice +
                  purchasedLine.quantity * purchasedLine.purchasePrice) /
                newStock
              ).toFixed(2)
            )
          : item.costPrice;

      const updatedSupplierPrices = [
        {
          supplierId: invoiceData.supplierId,
          supplierName: invoiceData.supplierName,
          price: purchasedLine.purchasePrice,
          date: invoiceData.date,
          invoiceId: invNum,
        },
        ...item.supplierPrices.filter(
          (sp) => sp.supplierId !== invoiceData.supplierId
        ),
      ];

      return {
        ...item,
        stock: newStock,
        costPrice: newWac,
        lastPurchasePrice: purchasedLine.purchasePrice,
        retailPrice: purchasedLine.newRetailPrice || item.retailPrice,
        supplierPrices: updatedSupplierPrices,
      };
    });

    const cascadedCatalog = recalculateAllRecipeCosts(nextItems);
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
          : sup
      )
    );

    addAuditLog(
      'شراء',
      `فاتورة شراء #${invNum} من (${invoiceData.supplierName}) وتحديث متوسط التكلفة (WAC) وتكلفة التوليفات المرتبطة`,
      invoiceData.totalAmount
    );
    showToast(
      `✅ تم حفظ فاتورة المشتريات #${invNum} وتحديث المخزن وتكلفة التوليفات أوتوماتيك!`
    );
  };

  // دالة خصم الأصناف من المخزون (خصم مباشر للبن والتوليفات الجاهزة، وفك الوصفة للمشروبات!)
  const deductSoldItemsFromInventory = (
    soldItems: SalesInvoiceItem[],
    currentCatalog: InventoryItem[]
  ): InventoryItem[] => {
    const deductionsMap = new Map<string, number>();

    for (const line of soldItems) {
      const target = currentCatalog.find((i) => i.id === line.itemId);
      if (!target) continue;

      if (
        target.category === 'drink_recipe' &&
        target.hasRecipe &&
        target.recipe
      ) {
        for (const ing of target.recipe) {
          const ingItem = currentCatalog.find((i) => i.id === ing.ingredientId);
          if (!ingItem) continue;
          const qtyInIngBase =
            convertToBaseUnit(ing.quantity, ing.unit, ingItem.baseUnit) *
            line.normalizedQtyInBaseUnit;
          deductionsMap.set(
            ingItem.id,
            (deductionsMap.get(ingItem.id) || 0) + qtyInIngBase
          );
        }
      } else {
        deductionsMap.set(
          target.id,
          (deductionsMap.get(target.id) || 0) + line.normalizedQtyInBaseUnit
        );
      }
    }

    return currentCatalog.map((item) => {
      const toDeduct = deductionsMap.get(item.id);
      if (!toDeduct) return item;
      return {
        ...item,
        stock: Number(Math.max(0, item.stock - toDeduct).toFixed(3)),
        lastSoldDate: new Date().toISOString().slice(0, 10),
      };
    });
  };

  // 3. حفظ فاتورة بيع (جملة أو قطاعي مباشر)
  const handleSaveSale = (
    saleData: Omit<SalesInvoice, 'id' | 'invoiceNumber'>
  ) => {
    const prefix = saleData.saleType === 'wholesale' ? 'WH' : 'POS';
    const invNum = `${prefix}-${2046 + salesInvoices.length}`;
    const newSale: SalesInvoice = {
      ...saleData,
      id: `sal-${Date.now()}`,
      invoiceNumber: invNum,
    };

    setItems((prev) => deductSoldItemsFromInventory(saleData.items, prev));
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
            : c
        )
      );
    }

    addAuditLog(
      saleData.saleType === 'wholesale' ? 'بيع جملة' : 'بيع محل',
      `فاتورة ${
        saleData.saleType === 'wholesale' ? 'بيع جملة' : 'بيع محل'
      } #${invNum} للعميل (${saleData.customerName}) وخصم الأصناف من المخزن`,
      saleData.totalAmount
    );
    showToast(`✅ تم حفظ الفاتورة #${invNum} وخصم المخزون والوصفات بنجاح!`);
    setReceiptModalInvoice(newSale);
    setActiveScreen('home');
  };

  // 4. استيراد شيت مبيعات الكاشير (Excel / CSV أو من الفولدر المراقب)
  const handleImportCashierRows = (
    rows: ParsedCashierRow[],
    sourceFileName: string
  ) => {
    const validRows = rows.filter((r) => r.matchedItem);
    if (validRows.length === 0) return;

    const invoiceItems: SalesInvoiceItem[] = validRows.map((r) => {
      const item = r.matchedItem!;
      const normalizedQty =
        r.unitHint === 'gram' ? Number((r.quantity / 1000).toFixed(3)) : r.quantity;
      const totalLinePrice =
        r.totalPrice || Number((normalizedQty * item.retailPrice).toFixed(2));
      const totalLineCost = Number((normalizedQty * item.costPrice).toFixed(2));

      const deductionDetails =
        item.category === 'drink_recipe' && item.recipe
          ? `تم فك وصفة المشروب وخصم: ${item.recipe
              .map(
                (ing) =>
                  `${ing.quantity * normalizedQty} ${
                    ing.unit === 'gram' ? 'جم' : ing.unit === 'ml' ? 'مل' : 'قطعة'
                  } (${ing.ingredientName.split('(')[0]})`
              )
              .join(' + ')}`
          : `منتج/توليفة جاهزة — خُصم ${normalizedQty} ${
              item.baseUnit === 'kg' ? 'كجم' : 'قطعة'
            } مباشرة من المخزن`;

      return {
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        quantity: r.quantity,
        unitLabel:
          r.unitHint === 'gram'
            ? 'جرام'
            : r.unitHint === 'kg'
            ? 'كجم'
            : 'كوب/قطعة',
        normalizedQtyInBaseUnit: normalizedQty,
        unitPrice: item.retailPrice,
        unitCost: item.costPrice,
        totalPrice: totalLinePrice,
        totalCost: totalLineCost,
        profit: Number((totalLinePrice - totalLineCost).toFixed(2)),
        deductionDetails,
      };
    });

    const totalAmount = invoiceItems.reduce((s, i) => s + i.totalPrice, 0);
    const totalCost = invoiceItems.reduce((s, i) => s + i.totalCost, 0);
    const netProfit = Number((totalAmount - totalCost).toFixed(2));
    const invNum = `POS-SYNC-${3011 + salesInvoices.length}`;

    const syncInvoice: SalesInvoice = {
      id: `sync-${Date.now()}`,
      invoiceNumber: invNum,
      date: new Date().toISOString().slice(0, 10),
      saleType: 'cashier_sync',
      customerName: `مبيعات كاشير المحل (${sourceFileName})`,
      sourceFile: sourceFileName,
      items: invoiceItems,
      subtotal: totalAmount,
      discount: 0,
      totalAmount,
      totalCost,
      netProfit,
      paidAmount: totalAmount,
      remainingAmount: 0,
      paymentMethod: 'نقدي',
      partnerName: currentPartner.name,
    };

    setItems((prev) => deductSoldItemsFromInventory(invoiceItems, prev));
    setSalesInvoices((prev) => [syncInvoice, ...prev]);
    addAuditLog(
      'مزامنة كاشير',
      `استيراد شيت كاشير المحل (${sourceFileName}) بإجمالي ${totalAmount} ج.م وخصم الأصناف المباشرة والتوليفات وفك وصفات المشروبات`,
      totalAmount,
      'مزامنة الكاشير التلقائية'
    );
    showToast(
      `🚀 تم استيراد شيت الكاشير (${sourceFileName}) وخصم التوليفات ووصفات المشروبات!`
    );
  };

  // 5. اعتماد محضر الجرد الفعلي على الميزان وتحديث المخزن
  const handleCommitStocktaking = (
    variances: StocktakingItemVariance[],
    notes: string,
    chargeShortageToEmployeeId?: string
  ) => {
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
      })
    );

    const newRecord: StocktakingAuditRecord = {
      id: `aud-${Date.now()}`,
      auditNumber: `AUD-2026-0${2 + stocktakingRecords.length}`,
      date: new Date().toISOString().slice(0, 10),
      partnerName: currentPartner.name,
      notes,
      totalShortageValue: Number(totalShortage.toFixed(2)),
      totalSurplusValue: Number(totalSurplus.toFixed(2)),
      netVarianceValue: Number((totalSurplus - totalShortage).toFixed(2)),
      itemsAudited: changed.length > 0 ? changed : variances.slice(0, 3),
    };

    setStocktakingRecords((prev) => [newRecord, ...prev]);

    // إذا تم اختيار تحميل العجز على أحد العمال
    if (chargeShortageToEmployeeId && totalShortage > 0) {
      handleRecordEmployeeAction(
        chargeShortageToEmployeeId,
        'خصم/عجز',
        Number(totalShortage.toFixed(2)),
        `تحميل عجز محضر الجرد #${newRecord.auditNumber}`
      );
    }

    addAuditLog(
      'جرد مخزن',
      `اعتماد محضر الجرد الفعلي #${newRecord.auditNumber} (${changed.length} فروقات على الميزان) — صافي الفرق: ${newRecord.netVarianceValue} ج.م`,
      Math.abs(newRecord.netVarianceValue)
    );
    showToast(
      `✅ تم اعتماد محضر الجرد #${newRecord.auditNumber} وتحديث أرصدة المخزن!`
    );
  };

  // 6. تسجيل حركة للعامل (سلفة، يومية حضور، خصم/عجز، مكافأة، صرف راتب)
  const handleRecordEmployeeAction = (
    employeeId: string,
    type: EmployeeTransaction['type'],
    amount: number,
    notes: string
  ) => {
    const targetEmp = employees.find((e) => e.id === employeeId);
    if (!targetEmp) return;

    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== employeeId) return emp;
        if (type === 'سلفة') {
          return { ...emp, totalAdvances: emp.totalAdvances + amount };
        }
        if (type === 'حضور يومية') {
          return {
            ...emp,
            workedDaysThisMonth: emp.workedDaysThisMonth + 1,
          };
        }
        if (type === 'خصم/عجز') {
          return { ...emp, totalDeductions: emp.totalDeductions + amount };
        }
        if (type === 'مكافأة') {
          return { ...emp, totalBonuses: emp.totalBonuses + amount };
        }
        if (type === 'صرف راتب') {
          return { ...emp, totalPaidOut: emp.totalPaidOut + amount };
        }
        return emp;
      })
    );

    const newTr: EmployeeTransaction = {
      id: `etr-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      employeeId,
      employeeName: targetEmp.name,
      type,
      amount,
      notes,
      partnerName: currentPartner.name,
    };

    setEmployeeTransactions((prev) => [newTr, ...prev]);
    addAuditLog(
      'شؤون عمال',
      `${type} للعامل (${targetEmp.name}): ${notes}`,
      amount
    );
    showToast(`✅ تم تسجيل (${type}) للعامل ${targetEmp.name} بنجاح!`);
  };

  // 7. أدوات التحكم الشامل في البيانات (تصفير وحذف الداتا التجريبية)
  const handleClearTransactionsKeepCatalog = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        stock: item.category === 'drink_recipe' ? 999 : 0,
      }))
    );
    setSalesInvoices([]);
    setPurchaseInvoices([]);
    setProductionBatches([]);
    setExpenses([]);
    setStocktakingRecords([]);
    setEmployeeTransactions([]);
    setAccountPayments([]);
    setSuppliers((prev) =>
      prev.map((s) => ({ ...s, balance: 0, totalPurchases: 0, invoicesCount: 0 }))
    );
    setCustomers((prev) =>
      prev.map((c) => ({ ...c, balance: 0, totalSales: 0, invoicesCount: 0 }))
    );
    setEmployees((prev) =>
      prev.map((e) => ({
        ...e,
        workedDaysThisMonth: 0,
        totalAdvances: 0,
        totalDeductions: 0,
        totalBonuses: 0,
        totalPaidOut: 0,
      }))
    );
    setPartners((prev) =>
      prev.map((p) => ({ ...p, totalWithdrawn: 0, totalPaidFromPocket: 0 }))
    );
    setAuditLogs([
      {
        id: `log-${Date.now()}`,
        timestamp: 'الآن',
        partnerName: currentPartner.name,
        actionType: 'تعديل وصفة/صنف',
        description: 'تصفير الفواتير والأرصدة مع الإبقاء على كتالوج الأصناف والوصفات',
      },
    ]);
    showToast('🧹 تم تصفير الفواتير والأرصدة مع الاحتفاظ بالأصناف والوصفات!');
  };

  const handleClearAllDemoData = () => {
    setItems([]);
    setSalesInvoices([]);
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
      prev.map((p) => ({ ...p, totalWithdrawn: 0, totalPaidFromPocket: 0 }))
    );
    setAuditLogs([
      {
        id: `log-${Date.now()}`,
        timestamp: 'الآن',
        partnerName: currentPartner.name,
        actionType: 'تعديل وصفة/صنف',
        description: 'حذف كافة البيانات التجريبية بالكامل للبدء من الصفر',
      },
    ]);
    showToast('🗑️ تم حذف جميع البيانات التجريبية بالكامل!');
  };

  const handleRestoreDefaultDemoData = () => {
    setItems(INITIAL_ITEMS);
    setProductionBatches(INITIAL_PRODUCTION_BATCHES);
    setPurchaseInvoices(INITIAL_PURCHASE_INVOICES);
    setSalesInvoices(INITIAL_SALES_INVOICES);
    setSuppliers(INITIAL_SUPPLIERS);
    setCustomers(INITIAL_CUSTOMERS);
    setExpenses(INITIAL_EXPENSES);
    setEmployees(INITIAL_EMPLOYEES);
    setEmployeeTransactions(INITIAL_EMPLOYEE_TRANSACTIONS);
    setStocktakingRecords(INITIAL_STOCKTAKING_RECORDS);
    setAccountPayments(INITIAL_ACCOUNT_PAYMENTS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    showToast('🔄 تمت استعادة البيانات التجريبية المختصرة بنجاح!');
  };

  // حسابات الشاشة الرئيسية والإحصائيات والرسوم البيانية
  const shortagesCount = useMemo(
    () =>
      items.filter(
        (i) => i.category !== 'drink_recipe' && i.stock <= i.minStock
      ).length,
    [items]
  );

  const dashboardAnalytics = useMemo(() => {
    const activeSales = salesInvoices.filter((i) => !i.isReturned);
    const salesTotal = activeSales.reduce((s, i) => s + i.totalAmount, 0);
    const costTotal = activeSales.reduce((s, i) => s + i.totalCost, 0);
    const grossProfit = activeSales.reduce((s, i) => s + i.netProfit, 0);
    const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfitAfterExpenses = grossProfit - expensesTotal;
    const margin = salesTotal > 0 ? (grossProfit / salesTotal) * 100 : 0;

    // توزيع المبيعات حسب القناة
    const cashierSales = activeSales
      .filter((i) => i.saleType === 'cashier_sync')
      .reduce((s, i) => s + i.totalAmount, 0);
    const retailPosSales = activeSales
      .filter((i) => i.saleType === 'retail')
      .reduce((s, i) => s + i.totalAmount, 0);
    const wholesaleSales = activeSales
      .filter((i) => i.saleType === 'wholesale')
      .reduce((s, i) => s + i.totalAmount, 0);

    // قيمة المخزن الفعلية بالتكلفة وتوزيعها
    const rawStockValue = items
      .filter(
        (i) =>
          i.category === 'raw_bean' ||
          i.category === 'raw_spice' ||
          i.category === 'direct_product'
      )
      .reduce((s, i) => s + Math.max(0, i.stock) * i.costPrice, 0);
    const blendStockValue = items
      .filter((i) => i.category === 'manufactured_blend')
      .reduce((s, i) => s + Math.max(0, i.stock) * i.costPrice, 0);
    const totalInventoryValue = Math.round(rawStockValue + blendStockValue);

    // المديونيات (لنا وعليها)
    const totalCustomerDebts = customers.reduce((s, c) => s + c.balance, 0);
    const totalSupplierBalances = suppliers.reduce((s, sup) => s + sup.balance, 0);

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
      totalSupplierBalances,
      topSellingProducts,
      maxProductRevenue,
    };
  }, [salesInvoices, expenses, items, customers, suppliers]);

  const globalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.toLowerCase();
    return items
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [items, globalSearch]);

  // إذا لم يكن هناك شريك مسجل دخوله، نعرض صفحة الدخول الاحترافية الخاصة بـ (بُن العجوز)
  if (!loggedPartnerId) {
    return (
      <LoginScreen
        partners={partners}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#EFECE4] flex flex-col items-center justify-start">
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
        {activeScreen === 'home' && (
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
                  onClick={() => setActiveScreen('insights')}
                  className="p-2 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] hover:bg-[#F5EBD0] transition"
                  title="التحليلات الذكية"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMoreInitialTab('data_control');
                    setActiveScreen('more');
                  }}
                  className="p-2 rounded-xl bg-[#FAF8F4] text-[#7A6855] border border-[#E6DEC8] hover:text-red-600 transition"
                  title="إدارة البيانات والنسخ الاحتياطي"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMoreInitialTab('menu');
                    setActiveScreen('more');
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
                        setGlobalSearch('');
                        setActiveScreen('inventory');
                      }}
                      className="w-full px-4 py-2.5 text-right hover:bg-[#FDF8EB] flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-extrabold text-[#1E1612]">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[#7A6855]">
                          الرصيد: {item.stock}{' '}
                          {item.baseUnit === 'kg' ? 'كجم' : 'وحدة'} • التكلفة:{' '}
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
                onClick={() => setActiveScreen('shortages')}
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
                      بُن العجوز — تحديث لحظي بين الـ 4 شركاء
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setHideProfits(!hideProfits)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-[#FBF5B7] border border-[#C59B27]/40 transition"
                    title={hideProfits ? 'إظهار الأرباح' : 'إخفاء الأرباح'}
                  >
                    {hideProfits ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveScreen('sections')}
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
                    إجمالي المبيعات ({dashboardAnalytics.invoicesCount} فاتورة)
                  </div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {dashboardAnalytics.salesTotal.toLocaleString('ar-EG')}{' '}
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
                        ? '••%'
                        : `${dashboardAnalytics.margin.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">
                    {hideProfits
                      ? '••••••'
                      : dashboardAnalytics.netProfitAfterExpenses.toLocaleString(
                          'ar-EG'
                        )}{' '}
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
                        'ar-EG'
                      )}{' '}
                      ج.م
                    </div>
                  </div>
                  <Package className="w-4 h-4 text-[#D4AF37]" />
                </div>

                <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-[#D8CBB8]">
                      نصيب الشريك (25%)
                    </div>
                    <div className="text-xs font-black text-[#FBF5B7] mt-0.5">
                      {hideProfits
                        ? '••••'
                        : Math.round(
                            dashboardAnalytics.netProfitAfterExpenses / 4
                          ).toLocaleString('ar-EG')}{' '}
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
                  onClick={() => setActiveScreen('reports')}
                  className="text-[11px] font-extrabold text-[#9E7918] hover:underline"
                >
                  التقرير الكامل &gt;
                </button>
              </div>

              {(() => {
                const maxVal = Math.max(
                  dashboardAnalytics.salesTotal,
                  dashboardAnalytics.costTotal,
                  1
                );
                const bars = [
                  {
                    label: 'المبيعات',
                    value: dashboardAnalytics.salesTotal,
                    color: 'from-[#1E1612] to-[#3A2B22]',
                    textColor: 'text-[#1E1612]',
                    hide: false,
                  },
                  {
                    label: 'تكلفة البن',
                    value: dashboardAnalytics.costTotal,
                    color: 'from-[#9E7918] to-[#D4AF37]',
                    textColor: 'text-[#9E7918]',
                    hide: hideProfits,
                  },
                  {
                    label: 'مجمل الربح',
                    value: dashboardAnalytics.grossProfit,
                    color: 'from-[#1F9D62] to-[#34D399]',
                    textColor: 'text-[#1F9D62]',
                    hide: hideProfits,
                  },
                  {
                    label: 'المصروفات',
                    value: dashboardAnalytics.expensesTotal,
                    color: 'from-[#D97706] to-[#F59E0B]',
                    textColor: 'text-[#D97706]',
                    hide: false,
                  },
                  {
                    label: 'الصافي النهائي',
                    value: Math.max(0, dashboardAnalytics.netProfitAfterExpenses),
                    color: 'from-[#047857] to-[#10B981]',
                    textColor: 'text-[#047857]',
                    hide: hideProfits,
                  },
                ];

                return (
                  <div className="pt-3 pb-1">
                    <div className="h-36 flex items-end justify-between gap-2.5 px-2 border-b border-[#EDE6D8] pb-2">
                      {bars.map((bar, idx) => {
                        const heightPct = Math.max(
                          12,
                          Math.min(100, Math.round((bar.value / maxVal) * 100))
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
                                ? '•••'
                                : bar.value.toLocaleString('ar-EG')}
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
                      نسبة مبيعات الجملة مقابل المحل وشيت الكاشير
                    </p>
                  </div>
                </div>
              </div>

              {(() => {
                const total = Math.max(1, dashboardAnalytics.salesTotal);
                const wholesalePct = Math.round(
                  (dashboardAnalytics.wholesaleSales / total) * 100
                );
                const retailPct = Math.round(
                  (dashboardAnalytics.retailPosSales / total) * 100
                );
                const cashierPct = Math.max(
                  0,
                  100 - wholesalePct - retailPct
                );

                return (
                  <div className="space-y-3">
                    {/* شريط التوزيع المجمع */}
                    <div className="w-full h-4 rounded-full bg-[#FAF8F4] overflow-hidden flex border border-[#E6DEC8] p-0.5 gap-0.5">
                      <div
                        style={{ width: `${Math.max(5, wholesalePct)}%` }}
                        className="h-full bg-[#1E1612] rounded-r-full transition-all"
                        title="مبيعات الجملة"
                      />
                      <div
                        style={{ width: `${Math.max(5, retailPct)}%` }}
                        className="h-full bg-[#C59B27] transition-all"
                        title="مبيعات المحل المباشرة"
                      />
                      <div
                        style={{ width: `${Math.max(5, cashierPct)}%` }}
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
                            'ar-EG'
                          )}{' '}
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
                            'ar-EG'
                          )}{' '}
                          ج.م
                        </div>
                        <div className="text-[10px] text-[#9E7918] font-bold">
                          {retailPct}%
                        </div>
                      </div>

                      <div className="bg-[#FAF8F4] rounded-xl p-2.5 border border-[#EDE6D8]">
                        <div className="flex items-center justify-center gap-1 text-[10px] font-extrabold text-[#1E1612]">
                          <span className="w-2 h-2 rounded-full bg-[#1F9D62]" />
                          <span>شيت الكاشير</span>
                        </div>
                        <div className="text-xs font-black text-[#1E1612] mt-1">
                          {dashboardAnalytics.cashierSales.toLocaleString(
                            'ar-EG'
                          )}{' '}
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
                          100
                      )
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
                              {prod.revenue.toLocaleString('ar-EG')} ج.م
                            </span>
                            {!hideProfits && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                ربح: {prod.profit.toLocaleString('ar-EG')}
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
                onClick={() => setActiveScreen('customers')}
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
                    'ar-EG'
                  )}{' '}
                  <span className="text-[10px] font-normal text-[#7A6855]">
                    ج.م
                  </span>
                </div>
                <div className="text-[10px] text-[#9E7918] font-bold mt-0.5">
                  اضغط للتحصيل وكشف الحساب &gt;
                </div>
              </button>

              <button
                onClick={() => setActiveScreen('suppliers')}
                className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm text-right transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-[#7A6855]">
                    حسابات الموردين (علينا)
                  </span>
                  <Truck className="w-4 h-4 text-[#1E1612]" />
                </div>
                <div className="text-base font-black text-[#1E1612] mt-1">
                  {dashboardAnalytics.totalSupplierBalances.toLocaleString(
                    'ar-EG'
                  )}{' '}
                  <span className="text-[10px] font-normal text-[#7A6855]">
                    ج.م
                  </span>
                </div>
                <div className="text-[10px] text-[#9E7918] font-bold mt-0.5">
                  اضغط للسداد وكشف الحساب &gt;
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
                        {log.amount.toLocaleString('ar-EG')} ج.م
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. قسم الأقسام (بالتصميم الاحترافي الأول الفخم بالإسبريسو والذهبي) ================= */}
        {activeScreen === 'sections' && (
          <div className="px-4 pt-4 pb-24 space-y-4">
            {/* هيدر قسم الأقسام الفاخر */}
            <div className="bg-gradient-to-l from-[#1E1612] via-[#2A1F1A] to-[#1E1612] rounded-2xl p-3.5 text-[#FAF8F4] border border-[#C59B27]/60 shadow-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="بُن العجوز"
                  className="w-12 h-12 object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.65)] shrink-0"
                />
                <div>
                  <h1 className="text-sm font-black text-[#FBF5B7]">
                    أقسام وإدارة بُن العجوز
                  </h1>
                  <p className="text-[11px] text-[#D4AF37]">
                    اختر القسم المطلوب للعمل المباشر
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveScreen('home')}
                className="bg-white/10 hover:bg-white/20 text-[#FBF5B7] border border-[#C59B27]/40 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition"
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>الإحصائيات</span>
              </button>
            </div>

            {/* شريط البحث السريع داخل الأقسام */}
            <div className="relative">
              <div className="bg-white rounded-2xl border border-[#E6DEC8] focus-within:border-[#C59B27] px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm">
                <Search className="w-4 h-4 text-[#9E7918] shrink-0" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="ابحث عن صنف بن أو توليفة أو مشروب..."
                  className="w-full text-xs font-bold bg-transparent focus:outline-none text-[#1E1612] placeholder:text-[#9C8B7A]"
                />
              </div>

              {globalSearchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-12 bg-white rounded-2xl shadow-xl border border-[#C59B27] z-30 divide-y divide-[#F0EAE0]">
                  {globalSearchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setGlobalSearch('');
                        setActiveScreen('inventory');
                      }}
                      className="w-full px-4 py-2.5 text-right hover:bg-[#FDF8EB] flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-extrabold text-[#1E1612]">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[#7A6855]">
                          الرصيد: {item.stock}{' '}
                          {item.baseUnit === 'kg' ? 'كجم' : 'وحدة'} • التكلفة:{' '}
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

            {/* القسم الأول: تأسيس المنتجات والعمليات اليومية الأساسية */}
            <div className="space-y-2">
              <div className="text-xs font-black text-[#6E5D4F] px-1">
                تأسيس المنتجات والعمليات اليومية
              </div>

              {/* كارت المنتجات والتسعير (الأساس الذي تعتمد عليه الدورة التشغيلية كلها) */}
              <button
                onClick={() => setActiveScreen('products')}
                className="w-full bg-gradient-to-l from-[#1E1612] via-[#2A1F1A] to-[#1E1612] rounded-2xl p-3.5 border border-[#C59B27] shadow-md text-right transition flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#9E7918] via-[#FBF5B7] to-[#C59B27] text-[#1E1612] flex items-center justify-center shrink-0 shadow group-hover:scale-105 transition">
                    <Tag className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-[#FBF5B7]">
                        المنتجات والتسعير
                      </span>
                      <span className="text-[10px] font-black bg-white/10 text-[#D4AF37] border border-[#C59B27]/40 px-2 py-0.5 rounded-full">
                        {items.length} منتج
                      </span>
                    </div>
                    <div className="text-[11px] text-[#D8CBB8] font-semibold mt-0.5 truncate">
                      أساس الدورة التشغيلية: تعريف البن الخام والتوليفات والمشروبات وأسعارها
                    </div>
                  </div>
                </div>
                <ChevronLeft className="w-5 h-5 text-[#D4AF37] shrink-0" />
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                {/* 1. بيع جملة ومحل */}
                <button
                  onClick={() => setActiveScreen('sales_pos')}
                  className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm text-right transition flex items-start gap-3 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition">
                    <Calculator className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[#1E1612]">
                      بيع جملة ومحل
                    </div>
                    <div className="text-[10px] text-[#8C7A6B] font-semibold mt-0.5 leading-tight">
                      كاشير جرام وكيلو وفاتورة واتساب
                    </div>
                  </div>
                </button>

                {/* 2. شيت الكاشير */}
                <button
                  onClick={() => setActiveScreen('cashier_sync')}
                  className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm text-right transition flex items-start gap-3 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition">
                    <FolderSync className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[#1E1612]">
                      شيت الكاشير
                    </div>
                    <div className="text-[10px] text-[#8C7A6B] font-semibold mt-0.5 leading-tight">
                      رفع الإكسيل وخصم الوصفات
                    </div>
                  </div>
                </button>

                {/* 3. الإنتاج والوصفات */}
                <button
                  onClick={() => setActiveScreen('production')}
                  className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm text-right transition flex items-start gap-3 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition">
                    <Flame className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[#1E1612]">
                      الإنتاج والوصفات
                    </div>
                    <div className="text-[10px] text-[#8C7A6B] font-semibold mt-0.5 leading-tight">
                      تخليط التوليفات ومقادير المشروبات
                    </div>
                  </div>
                </button>

                {/* 4. جرد الميزان */}
                <button
                  onClick={() => setActiveScreen('stocktaking')}
                  className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm text-right transition flex items-start gap-3 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[#1E1612]">
                      جرد الميزان
                    </div>
                    <div className="text-[10px] text-[#8C7A6B] font-semibold mt-0.5 leading-tight">
                      مطابقة الرصيد الفعلي بالجرام
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* القسم الثاني: شبكة إدارة المخزن والحسابات والتقارير (3×3 بالتصميم الاحترافي الأول) */}
            <div className="space-y-2">
              <div className="text-xs font-black text-[#6E5D4F] px-1">
                إدارة المخزون والحسابات والرقابة
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {/* 1. مخزن البن */}
                <button
                  onClick={() => setActiveScreen('inventory')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5 relative"
                >
                  <span className="absolute top-2 left-2 text-[9px] font-black bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] px-1.5 py-0.5 rounded-md">
                    {items.length}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shadow-sm">
                    <Package className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    مخزن البن
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    الخام والتوليفات
                  </div>
                </button>

                {/* 2. المشتريات */}
                <button
                  onClick={() => setActiveScreen('purchase')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5 relative"
                >
                  <span className="absolute top-2 left-2 text-[9px] font-black bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] px-1.5 py-0.5 rounded-md">
                    {purchaseInvoices.length}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center shadow-sm">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    المشتريات
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    إنشاء وسجل الفواتير
                  </div>
                </button>

                {/* 3. فواتير البيع */}
                <button
                  onClick={() => setActiveScreen('sales_invoices')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5 relative"
                >
                  <span className="absolute top-2 left-2 text-[9px] font-black bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] px-1.5 py-0.5 rounded-md">
                    {salesInvoices.length}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shadow-sm">
                    <FileText className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    فواتير البيع
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    طباعة ومرتجعات
                  </div>
                </button>

                {/* 4. الموردين */}
                <button
                  onClick={() => setActiveScreen('suppliers')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5 relative"
                >
                  <span className="absolute top-2 left-2 text-[9px] font-black bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] px-1.5 py-0.5 rounded-md">
                    {suppliers.length}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center shadow-sm">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    الموردين
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    الأرصدة وكشف حساب
                  </div>
                </button>

                {/* 5. عملاء الجملة */}
                <button
                  onClick={() => setActiveScreen('customers')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5 relative"
                >
                  <span className="absolute top-2 left-2 text-[9px] font-black bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] px-1.5 py-0.5 rounded-md">
                    {customers.length}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shadow-sm">
                    <Users className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    عملاء الجملة
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    المديونيات والتحصيل
                  </div>
                </button>

                {/* 6. العمال والرواتب */}
                <button
                  onClick={() => setActiveScreen('staff_payroll')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5 relative"
                >
                  <span className="absolute top-2 left-2 text-[9px] font-black bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] px-1.5 py-0.5 rounded-md">
                    {employees.length}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center shadow-sm">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    العمال والرواتب
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    السلف واليوميات
                  </div>
                </button>

                {/* 7. التقارير والأرباح */}
                <button
                  onClick={() => setActiveScreen('reports')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shadow-sm">
                    <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    التقارير والأرباح
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    أرباح الشركاء الـ 4
                  </div>
                </button>

                {/* 8. النواقص */}
                <button
                  onClick={() => setActiveScreen('shortages')}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5 relative"
                >
                  {shortagesCount > 0 && (
                    <span className="absolute top-2 left-2 text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded-full">
                      {shortagesCount}
                    </span>
                  )}
                  <div className="w-11 h-11 rounded-xl bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] flex items-center justify-center shadow-sm">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    النواقص
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    حد الطلب والتوريد
                  </div>
                </button>

                {/* 9. إدارة البيانات والنسخ الاحتياطي */}
                <button
                  onClick={() => {
                    setMoreInitialTab('data_control');
                    setActiveScreen('more');
                  }}
                  className="bg-white rounded-2xl p-3 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm transition flex flex-col items-center text-center gap-1.5"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] flex items-center justify-center shadow-sm">
                    <RotateCcw className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="text-xs font-black text-[#1E1612]">
                    إدارة البيانات
                  </div>
                  <div className="text-[10px] text-[#8C7A6B] font-medium">
                    نسخ وحذف التجريبي
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= الشاشات الفرعية ================= */}
        {activeScreen === 'purchase' && (
          <PurchaseScreen
            items={items}
            suppliers={suppliers}
            purchaseInvoices={purchaseInvoices}
            currentPartnerName={currentPartner.name}
            onSavePurchase={handleSavePurchase}
            onDeletePurchaseInvoice={(invId) => {
              setPurchaseInvoices((prev) => prev.filter((p) => p.id !== invId));
              showToast('🗑️ تم حذف فاتورة المشتريات!');
            }}
            onQuickAddSupplier={(newSup) => {
              const created: Supplier = {
                ...newSup,
                id: `sup-${Date.now()}`,
              };
              setSuppliers((prev) => [created, ...prev]);
              showToast(`✅ تمت إضافة المورد (${created.name})!`);
            }}
            onQuickAddItem={(newItem) => {
              const created: InventoryItem = {
                ...newItem,
                id: `item-${Date.now()}`,
              };
              setItems((prev) => [created, ...prev]);
              showToast(`✅ تمت إضافة الصنف (${created.name}) للمخزن!`);
            }}
            onBack={() => setActiveScreen('sections')}
          />
        )}

        {activeScreen === 'production' && (
          <ProductionAndRecipesScreen
            items={items}
            productionBatches={productionBatches}
            currentPartnerName={currentPartner.name}
            onExecuteProduction={handleExecuteProduction}
            onSaveItemRecipe={(
              targetId: string,
              recipe: RecipeIngredient[],
              retail?: number,
              wholesale?: number
            ) => {
              setItems((prev) => {
                const updated = prev.map((item) =>
                  item.id === targetId
                    ? {
                        ...item,
                        hasRecipe: true,
                        recipe,
                        retailPrice: retail ?? item.retailPrice,
                        wholesalePrice: wholesale ?? item.wholesalePrice,
                      }
                    : item
                );
                return recalculateAllRecipeCosts(updated);
              });
              addAuditLog('تعديل وصفة/صنف', `تحديث وصفة صنف`);
            }}
            onCreateNewBlendOrDrink={(newItem) => {
              const created: InventoryItem = {
                ...newItem,
                id: `item-${Date.now()}`,
              };
              setItems((prev) => [created, ...prev]);
              addAuditLog('تعديل وصفة/صنف', `إضافة صنف: ${created.name}`);
            }}
            onDeleteItem={(id) => {
              setItems((prev) => prev.filter((i) => i.id !== id));
              showToast('🗑️ تم حذف الصنف بنجاح');
            }}
            onDeleteBatch={(batchId) => {
              setProductionBatches((prev) =>
                prev.filter((b) => b.id !== batchId)
              );
              showToast('🗑️ تم حذف تشغيلة الإنتاج');
            }}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'sales_pos' && (
          <SalesPosScreen
            items={items}
            customers={customers}
            currentPartnerName={currentPartner.name}
            onSaveSale={handleSaveSale}
            onNavigateToCashierSync={() => setActiveScreen('cashier_sync')}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'cashier_sync' && (
          <CashierSyncScreen
            items={items}
            onImportCashierRows={handleImportCashierRows}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'products' && (
          <ProductsCatalogScreen
            items={items}
            onAddNewItem={(newItem) => {
              setItems((prev) => [
                { ...newItem, id: `item-${Date.now()}` },
                ...prev,
              ]);
              addAuditLog('تعديل وصفة/صنف', `تعريف منتج جديد: ${newItem.name}`);
              showToast(`✅ تمت إضافة المنتج (${newItem.name}) في الكتالوج!`);
            }}
            onUpdateItem={(id, patch) => {
              setItems((prev) => {
                const next = prev.map((i) =>
                  i.id === id ? { ...i, ...patch } : i
                );
                return recalculateAllRecipeCosts(next);
              });
              addAuditLog('تعديل وصفة/صنف', `تحديث تسعير/بيانات منتج`);
              showToast('✅ تم تحديث المنتج وإعادة حساب تكلفة الوصفات المرتبطة!');
            }}
            onDeleteItem={(id) => {
              setItems((prev) => prev.filter((i) => i.id !== id));
              addAuditLog('تعديل وصفة/صنف', `حذف منتج من الكتالوج`);
              showToast('🗑️ تم حذف المنتج بنجاح!');
            }}
            onNavigateToProduction={() => setActiveScreen('production')}
            onNavigateToInventory={() => setActiveScreen('inventory')}
            onNavigateToPurchase={() => setActiveScreen('purchase')}
            onBack={() => setActiveScreen('sections')}
          />
        )}

        {activeScreen === 'inventory' && (
          <InventoryScreen
            items={items}
            onAddNewItem={(newItem) => {
              setItems((prev) => [
                { ...newItem, id: `item-${Date.now()}` },
                ...prev,
              ]);
              addAuditLog('تعديل وصفة/صنف', `إضافة صنف: ${newItem.name}`);
              showToast(`✅ تمت إضافة (${newItem.name}) للمخزن!`);
            }}
            onUpdateItemPricesAndStock={(id, patch) => {
              setItems((prev) => {
                const next = prev.map((i) =>
                  i.id === id ? { ...i, ...patch } : i
                );
                return recalculateAllRecipeCosts(next);
              });
              addAuditLog('تعديل وصفة/صنف', `تعديل رصيد/سعر صنف`);
              showToast('✅ تم تحديث الصنف وتكلفة الوصفات!');
            }}
            onDeleteItem={(id) => {
              setItems((prev) => prev.filter((i) => i.id !== id));
              addAuditLog('تعديل وصفة/صنف', `حذف صنف من المخزن`);
              showToast('🗑️ تم حذف الصنف من المخزن!');
            }}
            onNavigateToProduction={() => setActiveScreen('production')}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'shortages' && (
          <ShortagesScreen
            items={items}
            onNavigateToPurchase={() => setActiveScreen('purchase')}
            onNavigateToProduction={() => setActiveScreen('production')}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'suppliers' && (
          <SuppliersAndCustomersScreen
            mode="suppliers"
            suppliers={suppliers}
            customers={customers}
            purchaseInvoices={purchaseInvoices}
            salesInvoices={salesInvoices}
            accountPayments={accountPayments}
            onPaySupplier={(supId, amount, notes) => {
              const targetSup = suppliers.find((s) => s.id === supId);
              setSuppliers((prev) =>
                prev.map((s) =>
                  s.id === supId
                    ? { ...s, balance: Math.max(0, s.balance - amount) }
                    : s
                )
              );
              setAccountPayments((prev) => [
                {
                  id: `pay-${Date.now()}`,
                  date: new Date().toISOString().slice(0, 10),
                  targetType: 'supplier',
                  targetId: supId,
                  targetName: targetSup?.name || 'مورد',
                  amount,
                  partnerName: currentPartner.name,
                  notes: notes || 'سداد دفعة للمورد',
                },
                ...prev,
              ]);
              addAuditLog('سداد/تحصيل', `سداد للمورد ${amount} ج.م`, amount);
              showToast(`✅ تم سداد ${amount} ج.م للمورد!`);
            }}
            onDeletePayment={(payId) => {
              setAccountPayments((prev) => prev.filter((p) => p.id !== payId));
              showToast('🗑️ تم حذف سجل الدفعة!');
            }}
            onAddSupplier={(sup) => {
              setSuppliers((prev) => [
                { ...sup, id: `sup-${Date.now()}` },
                ...prev,
              ]);
              showToast(`✅ تمت إضافة المورد (${sup.name})!`);
            }}
            onDeleteSupplier={(id) => {
              setSuppliers((prev) => prev.filter((s) => s.id !== id));
              showToast('🗑️ تم حذف المورد!');
            }}
            onCollectCustomer={() => {}}
            onAddCustomer={() => {}}
            onDeleteCustomer={() => {}}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'customers' && (
          <SuppliersAndCustomersScreen
            mode="customers"
            suppliers={suppliers}
            customers={customers}
            purchaseInvoices={purchaseInvoices}
            salesInvoices={salesInvoices}
            accountPayments={accountPayments}
            onPaySupplier={() => {}}
            onAddSupplier={() => {}}
            onDeleteSupplier={() => {}}
            onCollectCustomer={(custId, amount, notes) => {
              const targetCust = customers.find((c) => c.id === custId);
              setCustomers((prev) =>
                prev.map((c) =>
                  c.id === custId
                    ? { ...c, balance: Math.max(0, c.balance - amount) }
                    : c
                )
              );
              setAccountPayments((prev) => [
                {
                  id: `pay-${Date.now()}`,
                  date: new Date().toISOString().slice(0, 10),
                  targetType: 'customer',
                  targetId: custId,
                  targetName: targetCust?.name || 'عميل',
                  amount,
                  partnerName: currentPartner.name,
                  notes: notes || 'تحصيل دفعة من العميل',
                },
                ...prev,
              ]);
              addAuditLog('سداد/تحصيل', `تحصيل من عميل ${amount} ج.م`, amount);
              showToast(`✅ تم تحصيل ${amount} ج.م من العميل!`);
            }}
            onDeletePayment={(payId) => {
              setAccountPayments((prev) => prev.filter((p) => p.id !== payId));
              showToast('🗑️ تم حذف سجل الدفعة!');
            }}
            onAddCustomer={(cust) => {
              setCustomers((prev) => [
                { ...cust, id: `cust-${Date.now()}` },
                ...prev,
              ]);
              showToast(`✅ تمت إضافة العميل (${cust.name})!`);
            }}
            onDeleteCustomer={(id) => {
              setCustomers((prev) => prev.filter((c) => c.id !== id));
              showToast('🗑️ تم حذف العميل!');
            }}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'sales_invoices' && (
          <SalesInvoicesAndReturnsScreen
            salesInvoices={salesInvoices}
            customers={customers}
            onReturnInvoice={(invId) => {
              const target = salesInvoices.find((s) => s.id === invId);
              if (!target || target.isReturned) return;
              setSalesInvoices((prev) =>
                prev.map((s) =>
                  s.id === invId ? { ...s, isReturned: true } : s
                )
              );
              addAuditLog(
                'مرتجع',
                `مرتجع فاتورة #${target.invoiceNumber}`,
                target.totalAmount
              );
              showToast(`✅ تم عمل مرتجع للفاتورة #${target.invoiceNumber}!`);
            }}
            onDeleteInvoice={(invId) => {
              setSalesInvoices((prev) => prev.filter((s) => s.id !== invId));
              showToast('🗑️ تم حذف الفاتورة!');
            }}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'insights' && (
          <SmartInsightsScreen
            items={items}
            salesInvoices={salesInvoices}
            customers={customers}
            onNavigate={(sc) => setActiveScreen(sc)}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'reports' && (
          <ProfitReportsScreen
            items={items}
            salesInvoices={salesInvoices}
            expenses={expenses}
            partners={partners}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'stocktaking' && (
          <StocktakingScreen
            items={items}
            auditRecords={stocktakingRecords}
            employees={employees}
            currentPartnerName={currentPartner.name}
            onCommitStocktaking={handleCommitStocktaking}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'staff_payroll' && (
          <StaffAndPayrollScreen
            employees={employees}
            transactions={employeeTransactions}
            currentPartnerName={currentPartner.name}
            onRecordEmployeeAction={handleRecordEmployeeAction}
            onAddNewEmployee={(newEmp) => {
              const created: Employee = {
                ...newEmp,
                id: `emp-${Date.now()}`,
              };
              setEmployees((prev) => [created, ...prev]);
              addAuditLog('شؤون عمال', `إضافة عامل: ${created.name}`);
              showToast(`✅ تمت إضافة العامل (${created.name})!`);
            }}
            onDeleteEmployee={(empId) => {
              setEmployees((prev) => prev.filter((e) => e.id !== empId));
              showToast('🗑️ تم حذف العامل!');
            }}
            onBack={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'more' && (
          <MoreMenuScreen
            expenses={expenses}
            partners={partners}
            auditLogs={auditLogs}
            shifts={shifts}
            currentPartner={currentPartner}
            initialSubPage={moreInitialTab}
            onAddExpense={(exp) => {
              setExpenses((prev) => [
                { ...exp, id: `exp-${Date.now()}` },
                ...prev,
              ]);
              if (exp.paidFrom === 'من جيب الشريك') {
                setPartners((prev) =>
                  prev.map((p) =>
                    p.id === currentPartner.id
                      ? {
                          ...p,
                          totalPaidFromPocket:
                            p.totalPaidFromPocket + exp.amount,
                        }
                      : p
                  )
                );
              }
              addAuditLog('مصروف', `مصروف: ${exp.title}`, exp.amount);
              showToast(`✅ تم تسجيل المصروف (${exp.amount} ج.م)!`);
            }}
            onDeleteExpense={(expId) => {
              setExpenses((prev) => prev.filter((e) => e.id !== expId));
              showToast('🗑️ تم حذف المصروف!');
            }}
            onUpdatePartnerAccount={(id, patch) => {
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
                    : p
                )
              );
              showToast('✅ تم تحديث حساب المالك!');
            }}
            onClearAllDemoData={handleClearAllDemoData}
            onClearTransactionsKeepCatalog={handleClearTransactionsKeepCatalog}
            onRestoreDefaultDemoData={handleRestoreDefaultDemoData}
            onDownloadBackupJson={() => {
              downloadFullBackupJson({
                items,
                productionBatches,
                purchaseInvoices,
                salesInvoices,
                suppliers,
                customers,
                expenses,
                partners,
                auditLogs,
                employees,
                employeeTransactions,
                stocktakingRecords,
                accountPayments,
              });
              showToast('📥 تم تحميل النسخة الاحتياطية الكاملة بنجاح!');
            }}
            onExportFullExcel={() => {
              exportFullStoreExcel(
                items,
                salesInvoices,
                purchaseInvoices,
                suppliers,
                customers,
                expenses
              );
              showToast('📊 تم تصدير ملف الإكسيل الشامل للمحل بنجاح!');
            }}
            onRestoreBackupJson={(data) => {
              if (Array.isArray(data.items)) setItems(data.items as InventoryItem[]);
              if (Array.isArray(data.productionBatches))
                setProductionBatches(data.productionBatches as ProductionBatch[]);
              if (Array.isArray(data.purchaseInvoices))
                setPurchaseInvoices(data.purchaseInvoices as PurchaseInvoice[]);
              if (Array.isArray(data.salesInvoices))
                setSalesInvoices(data.salesInvoices as SalesInvoice[]);
              if (Array.isArray(data.suppliers))
                setSuppliers(data.suppliers as Supplier[]);
              if (Array.isArray(data.customers))
                setCustomers(data.customers as Customer[]);
              if (Array.isArray(data.expenses))
                setExpenses(data.expenses as Expense[]);
              if (Array.isArray(data.employees))
                setEmployees(data.employees as Employee[]);
              if (Array.isArray(data.employeeTransactions))
                setEmployeeTransactions(
                  data.employeeTransactions as EmployeeTransaction[]
                );
              if (Array.isArray(data.stocktakingRecords))
                setStocktakingRecords(
                  data.stocktakingRecords as StocktakingAuditRecord[]
                );
              if (Array.isArray(data.accountPayments))
                setAccountPayments(
                  data.accountPayments as AccountPaymentRecord[]
                );
              showToast('✅ تم استرجاع النسخة الاحتياطية بالكامل بنجاح!');
            }}
            onLogout={handleLogout}
            onNavigate={(sc) => setActiveScreen(sc)}
            onBack={() => {
              setMoreInitialTab('menu');
              setActiveScreen('home');
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
                  c.name === receiptModalInvoice.customerName
              )?.phone || ''
            }
            onClose={() => setReceiptModalInvoice(null)}
          />
        )}

        {/* شريط القوائم السفلي المثبت دائماً في أسفل الشاشة مع قسم "الأقسام" بجانب "الرئيسية" */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E6DEC8] py-1.5 px-2 grid grid-cols-5 z-40 max-w-[445px] mx-auto shadow-[0_-4px_20px_rgba(30,22,18,0.06)]">
          {[
            { id: 'home', label: 'الرئيسية', icon: Home },
            { id: 'sections', label: 'الأقسام', icon: LayoutGrid },
            { id: 'production', label: 'الإنتاج', icon: Flame },
            { id: 'inventory', label: 'المخزن', icon: Package },
            { id: 'more', label: 'المزيد', icon: Settings },
          ].map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeScreen === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'more') setMoreInitialTab('menu');
                  setActiveScreen(tab.id);
                }}
                className="flex flex-col items-center justify-center gap-0.5 py-0.5 transition"
              >
                <div
                  className={`px-3.5 py-1 rounded-full transition-all ${
                    isActive
                      ? 'bg-[#1E1612] text-[#D4AF37] shadow-sm border border-[#C59B27]/50'
                      : 'text-[#8C7B6B] hover:text-[#1E1612]'
                  }`}
                >
                  <IconComp className="w-4 h-4" />
                </div>
                <span
                  className={`text-[10px] ${
                    isActive
                      ? 'font-black text-[#1E1612]'
                      : 'font-semibold text-[#8C7B6B]'
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
