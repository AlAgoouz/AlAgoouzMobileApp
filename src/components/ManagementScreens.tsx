import {unitLabel as displayUnit} from '../lib/units';
import {useThemePreference, type ThemePreference} from '../lib/theme';
import {Tag as HeaderTag,Package as HeaderPackage,TriangleAlert as HeaderTriangleAlert,Users as HeaderUsers,ReceiptText as HeaderReceiptText,DatabaseBackup as HeaderDatabaseBackup,Wallet as HeaderWallet,Cloud as HeaderCloud,CircleUser as HeaderCircleUser} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {Modal} from './Modal';
import {FinancialPartnersScreen} from './FinancialPartnersScreen';
import {CashierDayHistory} from './CashierDayHistory';
import type {CashierDay} from '../types/erp';
import {SupplierPurchasePanels} from './SupplierPurchasePanels';
import {OperationalHealth} from './OperationalHealth';
import {matchesRecordSearch} from '../lib/recordSearch';
import {supplierPurchaseHistory} from '../lib/supplierPurchases';
import {ContactEditModal} from './ContactEditModal';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {CatalogNameDraftPanel} from './CatalogNameDraftPanel';
import {CatalogListControls,CatalogListNavigation} from './CatalogListControls';
import {CatalogProductRows} from './CatalogProductRows';
import {ActionButton} from './ActionButton';
import {browseCatalog,type CatalogSort} from '../lib/catalogBrowse';
import type {CatalogNameDraft,RecipeProductDefinition} from '../types/erp';
import {categoryLabel,itemCategories,requiresRecipe,isStockItem,isRecipeOnUse} from '../lib/itemPolicy';
import React, { useState, useMemo } from "react";
import {RecordPagination,useRecordPage} from './RecordPagination';
import {checkCustomerDetails,checkSupplierDetails} from '../lib/contactDetails';
import {Search, Plus, RotateCcw, Flame, Printer, LogOut, Trash2, Download, RefreshCw, MessageCircle, FileText, Upload, FileSpreadsheet, Sun, Moon, Monitor} from 'lucide-react';
import {
  InventoryItem,
  Supplier,
  Customer,
  SalesInvoice,
  PurchaseInvoice,
  AccountPaymentRecord,
  Expense,
  Partner,
  AuditLogEntry,
  ItemCategory,
} from "../types/erp";
import {
  getSupabaseCredentials,
  saveSupabaseCredentials,
} from "../lib/supabaseSync";
import {
  InvoiceReceiptModal,
  AccountStatementModal,
} from "./ReceiptAndStatementModals";
import { businessDate } from "../lib/dates";
import { nextItemCode, itemEditPatch } from "../lib/operationChecks";

// توليد كود فريد غير متنازع مع الأكواد الحالية (كان الرقم العشوائي يتكرر أحياناً)
function uniqueCode(existingCodes: string[], make: () => string): string {
  const sample = make();
  const prefix = sample.split("-")[0];
  return nextItemCode(
    existingCodes.map((code) => ({ code })),
    prefix,
    110,
  );
}

// التحقق أن كل القيم أرقام صحيحة غير سالبة (لحقول النص في النوافذ)
function allValidNumbers(values: string[]): boolean {
  return values.every((v) => {
    const n = Number(v);
    return typeof v === "string" && !!v.trim() && Number.isFinite(n) && n >= 0;
  });
}

// ============================================================================
// 0. شاشة المنتجات والتسعير (ProductsCatalogScreen) - الأساس الذي تعتمد عليه الدورة التشغيلية كلها
// ============================================================================
interface ProductsCatalogScreenProps {
  onOpenRecipe?:(targetId?:string)=>void;
  onOpenMovement?: (id:string)=>void;
  onDefineRecipe?:(id:string,name:string,definition:RecipeProductDefinition,original?:CatalogNameDraft)=>Promise<void>;
  canManage?:boolean;
  nameDrafts?:CatalogNameDraft[];
  onChangeNameDraft?:(id:string,name:string|null)=>Promise<void>;
  onCompleteNameDraft?:(id:string,item:Omit<InventoryItem,'id'>)=>Promise<void>;
  items: InventoryItem[];
  onAddNewItem: (item: Omit<InventoryItem, "id">) => void|boolean;
  onUpdateItem: (id: string, patch: Partial<InventoryItem>) => void | boolean;
  onDeleteItem: (id: string) => void|boolean|Promise<void|boolean>;
  onNavigateToProduction: () => void;
  onNavigateToInventory: () => void;
  onNavigateToPurchase: () => void;
  onBack: () => void;
}

export const ProductsCatalogScreen: React.FC<ProductsCatalogScreenProps> = ({
  onOpenRecipe,onDefineRecipe,onOpenMovement,
  nameDrafts=[],onCompleteNameDraft,onChangeNameDraft,canManage=true,
  items,
  onAddNewItem,
  onUpdateItem,
  onDeleteItem,
  onNavigateToProduction,
  onNavigateToInventory,
  onNavigateToPurchase,
  onBack,
}) => {
  const [filterCat, setFilterCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [compact,setCompact] = useState(() => {
    try { return localStorage.getItem('agouz-catalog-density') === 'compact'; }
    catch { return false; }
  });
  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    try { localStorage.setItem('agouz-catalog-density', next ? 'compact' : 'comfortable'); }
    catch { /* The preference remains active for this visit. */ }
  };
  const [catalogPane,setCatalogPane]=useState<'pending'|'ready'>(()=>nameDrafts.length?'pending':'ready');
  const [catalogSort,setCatalogSort]=useState<CatalogSort>('name'),[catalogPageSize,setCatalogPageSize]=useState(50);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<InventoryItem | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleting,setDeleting]=useState<InventoryItem|null>(null),[deleteBusy,setDeleteBusy]=useState(false),[deleteError,setDeleteError]=useState('');
  const confirmDelete=async()=>{if(!deleting||deleteBusy)return;setDeleteBusy(true);setDeleteError('');try{if(await onDeleteItem(deleting.id)===false)throw Error('تعذر حذف المنتج؛ راجع ارتباطه بالحركات والوصفات');setDeleting(null);}catch(e){setDeleteError(e instanceof Error?e.message:'تعذر تأكيد الحذف');}finally{setDeleteBusy(false);}};
  // قيم نصية مؤقتة لحقول الأرقام حتى لا يفقد المستخدم ما يكتبه عند الإدخال الوسيط
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState("");

  const catalogStats = useMemo(() => {
    const rawAndSpices = items.filter(i=>!requiresRecipe(i.category)).length;
    const blendsAndDrinks = items.filter(i=>requiresRecipe(i.category)).length;
    const sellable = items.filter((i) => i.retailPrice > 0);
    const avgMargin =
      sellable.length > 0
        ? sellable.reduce(
            (s, i) =>
              s +
              ((i.retailPrice - i.costPrice) / i.retailPrice) *
                100,
            0,
          ) / sellable.length
        : 0;

    return {
      total: items.length,
      rawAndSpices,
      blendsAndDrinks,
      avgMargin: Math.round(avgMargin),
    };
  }, [items]);

  const filtered = useMemo(() => {
    return browseCatalog(items.filter(i=>filterCat==='all'||(i.category==='raw_spice'?'direct_product':i.category)===filterCat),search,catalogSort);
  }, [items, filterCat, search,catalogSort]);
  const catalogPage=useRecordPage(filtered,filterCat+'|'+search+'|'+catalogSort+'|'+catalogPageSize,catalogPageSize);

  const handleOpenAddModal=()=>setShowAddModal(true);

  // فتح نافذة التعديل: نسخة حيّة من الصنف + مسودة نصية لكل حقل رقمي
  const openEditItem = (item: InventoryItem) => {
    setEditingItem({ ...item });
    setEditingOriginal(item);
    setEditDraft({
      costPrice: String(item.costPrice),
      retailPrice: String(item.retailPrice),
      wholesalePrice: String(item.wholesalePrice),
      stock: String(item.stock),
      minStock: String(item.minStock),
    });
    setEditError("");
  };

  const handleSaveItemEdits = () => {
    if (!editingItem) return;
    if (
      !allValidNumbers([
        editDraft.costPrice,
        editDraft.retailPrice,
        editDraft.wholesalePrice,
        editDraft.minStock,
      ])
    ) {
      setEditError("أدخل أرقامًا صحيحة غير سالبة؛ لا تعتمد القيمة حتى تكتمل");
      return;
    }
    // نأخذ الاسم من النافذة (التعديل النصي)، مع الرجوع لاسم الكتالوج لو تُرك فارغًا
    if(!editDraft.stock?.trim()||!Number.isFinite(Number(editDraft.stock))||(Number(editDraft.stock)<0&&Number(editDraft.stock)!==editingOriginal?.stock)){setEditError('الجرد الفعلي لا يقل عن صفر؛ يمكن إبقاء العجز الحالي دون تعديله');return;}
    const live = items.find((i) => i.id === editingItem.id);
    try {
      const code=editingItem.code.trim();
      if(!code)throw Error('كود المنتج مطلوب');
      if(items.some(item=>item.id!==editingItem.id&&(item.code.trim().toUpperCase()===code.toUpperCase()||item.barcode===code)))throw Error('كود المنتج مستخدم لصنف آخر');
      const patch = itemEditPatch(editingOriginal!, live, {
        code,
        name: editingItem.name.trim() || (live ? live.name : "صنف"),
        category: editingItem.category,
        costPrice: parseFloat(editDraft.costPrice),
        retailPrice: parseFloat(editDraft.retailPrice),
        wholesalePrice: parseFloat(editDraft.wholesalePrice),
        stock: parseFloat(editDraft.stock),
        minStock: parseFloat(editDraft.minStock),
      });
      if (onUpdateItem(editingItem.id, patch) === false) {
        setEditError("لم تُحفظ التعديلات؛ راجع التنبيه");
        return;
      }
    } catch (error) {
      setEditError((error as Error).message);
      return;
    }
    setEditingItem(null);
  };

  return (
    <div className="operation-screen min-h-screen pb-24">
      {/* هيدر قسم المنتجات والتسعير */}
      <OperationHeader title="المنتجات والتسعير" description="راجع تعريفات المنتجات والأكواد والأسعار." icon={HeaderTag} onBack={onBack}>{canManage && <button
          type="button"
          onClick={handleOpenAddModal}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>منتج جديد</span>
        </button>}</OperationHeader>

      <div className="catalog-workspace">
        <div className="catalog-overview">
          <nav className="catalog-status-tabs" aria-label="حالة المنتجات">
            <button type="button" aria-pressed={catalogPane==='pending'} onClick={()=>setCatalogPane('pending')}>تحتاج استكمال ({nameDrafts.length})</button>
            <button type="button" aria-pressed={catalogPane==='ready'} onClick={()=>setCatalogPane('ready')}>جاهزة للاستخدام ({items.length})</button>
          </nav>
          <details className="catalog-shortcuts"><summary>انتقالات سريعة</summary><div><button type="button" onClick={onNavigateToPurchase}>المشتريات</button><button type="button" onClick={()=>onOpenRecipe?.()}>الوصفات</button><button type="button" onClick={onNavigateToProduction}>إنتاج التوليفات</button><button type="button" onClick={onNavigateToInventory}>أرصدة المخزن</button></div></details>
        </div>
        <section className="catalog-pane" hidden={catalogPane!=='pending'} aria-label="المنتجات التي تحتاج استكمالًا">
          <CatalogNameDraftPanel drafts={nameDrafts} items={items} onComplete={onCompleteNameDraft} onChange={onChangeNameDraft} onDefineRecipe={onDefineRecipe} onOpenRecipe={id=>onOpenRecipe?.('draft:'+id)} onShowReady={()=>setCatalogPane('ready')}/>
        </section>
        <section className="catalog-pane space-y-3" data-density={compact ? 'compact' : undefined} hidden={catalogPane!=='ready'} aria-label="المنتجات الجاهزة">
          <div className="catalog-summary"><span>أصناف مباشرة <b>{catalogStats.rawAndSpices}</b></span><span>أصناف لها وصفة <b>{catalogStats.blendsAndDrinks}</b></span><span>متوسط هامش البيع الإرشادي <b>{catalogStats.avgMargin}%</b></span></div>
          <div className="filter-pills" aria-label="تصفية أنواع المنتجات">
            {[{id:'all',label:'كل المنتجات ('+items.length+')'},...itemCategories].map(category=><button type="button" key={category.id} aria-pressed={filterCat===category.id} onClick={()=>{catalogPage.setPage(0);setFilterCat(category.id);}} className="filter-pill">{category.label}</button>)}
          </div>
          <CatalogListControls label="البحث في المنتجات الجاهزة" search={search} onSearch={value=>{catalogPage.setPage(0);setSearch(value);}} sort={catalogSort} onSort={value=>{catalogPage.setPage(0);setCatalogSort(value);}} pageSize={catalogPageSize} onPageSize={value=>{catalogPage.setPage(0);setCatalogPageSize(value);}}/>
          <div className="catalog-controls-end"><CatalogListNavigation page={catalogPage} label="انتقل إلى صفحة المنتجات الجاهزة"/><ActionButton aria-pressed={compact} onClick={toggleCompact}>عرض مضغوط</ActionButton></div>
          {filtered.length?<CatalogProductRows items={catalogPage.visible} canManage={canManage} onEdit={openEditItem} onDelete={item=>{setDeleting(item);setDeleteError('');}} onRecipe={item=>onOpenRecipe?.('item:'+item.id)} onMovement={onOpenMovement}/>:<p role="status" className="catalog-empty">لا توجد منتجات جاهزة مطابقة لهذا العرض.</p>}
        </section>
      </div>

      {/* نافذة تعريف وإضافة منتج جديد */}
      {deleting&&<Modal title="حذف المنتج" description={`هل تريد حذف (${deleting.name})؟ لا يمكن حذف منتج مرتبط بفواتير أو وصفات أو حركات مخزون.`} busy={deleteBusy} onClose={()=>setDeleting(null)} footer={<div className="record-actions"><button type="button" className="action-button" disabled={deleteBusy} onClick={()=>setDeleting(null)}>إلغاء</button><button type="button" disabled={deleteBusy} className="action-button text-status-danger border-status-danger-line" onClick={()=>void confirmDelete()}>{deleteBusy?'جارٍ تأكيد الحذف…':'تأكيد حذف المنتج'}</button></div>}>{deleteError&&<p role="alert">{deleteError}</p>}</Modal>}
      {canManage && showAddModal && <ItemDefinitionModal items={items} reservedCodes={nameDrafts.flatMap(d=>d.definition?[d.definition.code]:[])} onSaveRecipeDefinition={onDefineRecipe} onSave={onAddNewItem} onClose={()=>setShowAddModal(false)}/>}

      {/* نافذة تعديل بيانات وتسعير المنتج */}
      {editingItem && (
        <Modal title={<>تعديل بيانات وتسعير المنتج ( {editingItem.name} )</>} onClose={()=>setEditingItem(null)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={handleSaveItemEdits}
                className="operation-primary flex-1"
              >
                حفظ التعديلات
              </button>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}>
            <label className="block">
              اسم المنتج
              <input
                type="text"
                value={editingItem.name}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, name: e.target.value })
                }
                className="operation-input font-extrabold"
              />
            </label>
            <label className="block">كود الكاشير / كود المنتج<input type="text" value={editingItem.code} onChange={e=>setEditingItem({...editingItem,code:e.target.value})} className="operation-input"/></label>
            <p className="operation-caption">للمنتج المباع، اكتب نفس الكود الظاهر في تقرير الكاشير. تاريخ الصنف وحركاته يظلان مرتبطين به.</p>
            <div className="operation-fields">
              <label>
                تصنيف المنتج
                <select
                  value={editingItem.category==='raw_spice'?'direct_product':editingItem.category}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: editingItem.category==='raw_spice'&&e.target.value==='direct_product'?'raw_spice':e.target.value as ItemCategory,
                    })
                  }
                  className="operation-input"
                >
                  {itemCategories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label>
                سعر التكلفة (ج.م)
                <input
                  type="number"
                  value={editDraft.costPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, costPrice: e.target.value })
                  }
                  className="operation-input font-black"
                />
              </label>
              <label>
                سعر البيع القطاعي (ج.م)
                <input
                  type="number"
                  value={editDraft.retailPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, retailPrice: e.target.value })
                  }
                  className="operation-input font-black"
                />
              </label>
              <label>
                سعر البيع الجملة (ج.م)
                <input
                  type="number"
                  value={editDraft.wholesalePrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      wholesalePrice: e.target.value,
                    })
                  }
                  className="operation-input font-black"
                />
              </label>
              <label>
                الرصيد الحالي بالمخزن
                <input
                  type="number"
                  step="0.25"
                  value={editDraft.stock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, stock: e.target.value })
                  }
                  className="operation-input font-bold"
                />
              </label>
              <label>
                حد النواقص
                <input
                  type="number"
                  value={editDraft.minStock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, minStock: e.target.value })
                  }
                  className="operation-input font-bold"
                />
              </label>
            </div>
            {editError && (
              <p role="alert" className="field-error">{editError}</p>
            )}</Modal>
      )}
    </div>
  );
};

// ============================================================================
// 1. شاشة المخزن (InventoryScreen) - مع التحكم الكامل (إضافة / تعديل / حذف)
// ============================================================================
interface InventoryScreenProps {
  onOpenMovement?: (id:string)=>void;
  canManage?: boolean;
  items: InventoryItem[];
  onAddNewItem: (item: Omit<InventoryItem, "id">) => void;
  onUpdateItemPricesAndStock: (
    id: string,
    patch: Partial<
      Pick<
        InventoryItem,
        | "name"
        | "category"
        | "stock"
        | "minStock"
        | "costPrice"
        | "retailPrice"
        | "wholesalePrice"
      >
    >,
  ) => void | boolean;
  onDeleteItem: (id: string) => void;
  onNavigateToProduction: () => void;
  onBack: () => void;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({
  onOpenMovement,
  canManage = true,
  items,
  onAddNewItem,
  onUpdateItemPricesAndStock,
  onDeleteItem,
  onNavigateToProduction,
  onBack,
}) => {
  const [filterCat, setFilterCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<InventoryItem | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);

  // مسودة نصية لحقول التعديل الرقمية + رسالة خطأ داخلية
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState("");

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filterCat !== "all" && (i.category==='raw_spice'?'direct_product':i.category) !== filterCat) return false;
      return matchesRecordSearch(search,i.name,i.code);
    });
  }, [items, filterCat, search]);

  const inventoryPage=useRecordPage(filtered,filterCat+'|'+search,20);

  const totalInventoryCapital = useMemo(
    () =>
      items
        .filter((i) => isStockItem(i))
        .reduce((s, i) => s + i.stock * i.costPrice, 0),
    [items],
  );

  // فتح نافذة التعديل للصنف: نسخة حيّة + مسودة نصية للأرقام
  const openEditItem = (item: InventoryItem) => {
    setEditingItem({ ...item });
    setEditingOriginal(item);
    setEditDraft({
      stock: String(item.stock),
      minStock: String(item.minStock),
      costPrice: String(item.costPrice),
      retailPrice: String(item.retailPrice),
      wholesalePrice: String(item.wholesalePrice),
    });
    setEditError("");
  };

  const handleSaveItemEdits = () => {
    if (!editingItem) return;
    if (
      !allValidNumbers([
        editDraft.minStock,
        editDraft.costPrice,
        editDraft.retailPrice,
        editDraft.wholesalePrice,
      ])
    ) {
      setEditError("أدخل أرقامًا صحيحة غير سالبة؛ لا تعتمد القيمة حتى تكتمل");
      return;
    }
    if(!editDraft.stock?.trim()||!Number.isFinite(Number(editDraft.stock))||(Number(editDraft.stock)<0&&Number(editDraft.stock)!==editingOriginal?.stock)){setEditError('الجرد الفعلي لا يقل عن صفر؛ يمكن إبقاء العجز الحالي دون تعديله');return;}
    const live = items.find((i) => i.id === editingItem.id);
    try {
      const patch = itemEditPatch(editingOriginal!, live, {
        name: editingItem.name.trim() || (live ? live.name : "صنف"),
        category: editingItem.category,
        stock: parseFloat(editDraft.stock),
        minStock: parseFloat(editDraft.minStock),
        costPrice: parseFloat(editDraft.costPrice),
        retailPrice: parseFloat(editDraft.retailPrice),
        wholesalePrice: parseFloat(editDraft.wholesalePrice),
      });
      if (onUpdateItemPricesAndStock(editingItem.id, patch) === false) {
        setEditError("لم تُحفظ التعديلات؛ راجع التنبيه");
        return;
      }
    } catch (error) {
      setEditError((error as Error).message);
      return;
    }
    setEditingItem(null);
  };

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title={<>المخزن والأصناف</>} description={<>قيمة المخزون الحالية {Math.round(totalInventoryCapital).toLocaleString("ar-EG")} ج.م</>} icon={HeaderPackage} onBack={onBack}>{canManage && <button
          type="button"
          onClick={() => setShowAddModal(true)}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          إضافة صنف
        </button>}</OperationHeader>

      <div className="record-workspace">
        {/* فلاتر الأقسام المختصرة */}
        <div className="filter-pills" aria-label="تصفية أقسام المخزن">
          {[
            { id: 'all', label: `الكل (${items.length})` },...itemCategories,
          ].map((t) => (
            <button
              type="button"
              key={t.id}
              aria-pressed={filterCat === t.id}
              onClick={() => setFilterCat(t.id)}
              className="filter-pill"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="sections-search flex-1 min-w-56">
            <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="البحث في المخزون"
              placeholder="بحث باسم الصنف أو الكود…"
            />
          </div>
          <button
            type="button"
            onClick={onNavigateToProduction}
            className="operation-primary shrink-0"
          >
            <Flame className="w-4 h-4" aria-hidden="true" />
            الإنتاج
          </button>
        </div>

        {inventoryPage.total>inventoryPage.pageSize&&<RecordPagination {...inventoryPage}/>}
        {filtered.length === 0 ? (
          <p className="record-state" role="status">
            {search || filterCat !== 'all' ? 'لا توجد أصناف مطابقة. جرّب تعديل البحث أو التصفية.' : 'لا توجد أصناف في المخزن بعد.'}
          </p>
        ) : (
          <div className="record-grid-3">
            {inventoryPage.visible.map((item) => {
              const isLow =
                isStockItem(item) && item.stock <= item.minStock;
              const unitLabel =
                displayUnit(item.baseUnit);

              return (
                <article
                  key={item.id}
                  className={`record-card flex flex-col justify-between gap-3 ${
                    isLow ? "border-status-warn bg-status-warn-bg/30" : ""
                  }`}
                >
                  <div className="record-heading mb-0">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="record-badge" dir="ltr">
                          {item.code}
                        </span>
                        {isLow && (
                          <span className="record-badge bg-status-danger-bg text-status-danger border-status-danger-line">
                            ناقص
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-extrabold text-ink-strong mt-1.5">
                        {item.name}
                      </h3>
                    </div>
                  </div>

                  <dl className="record-facts mb-0">
                    <div>
                      <dt>الرصيد</dt>
                      <dd className={isLow ? "text-status-danger" : ""}>
                        {isRecipeOnUse(item)
                          ? "وصفة"
                          : `${item.stock} ${unitLabel}`}
                      </dd>
                    </div>
                    <div>
                      <dt>التكلفة</dt>
                      <dd className="text-gold">{item.costPrice.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt>قطاعي</dt>
                      <dd className="text-status-ok">{item.retailPrice}</dd>
                    </div>
                    <div>
                      <dt>جملة</dt>
                      <dd>{item.wholesalePrice}</dd>
                    </div>
                  </dl>

                  <div className="register-actions">
                    {onOpenMovement&&<button type="button" className="record-action flex-1" onClick={()=>onOpenMovement(item.id)}>حركات الصنف</button>}
                    {canManage && <><button
                      type="button"
                      onClick={() => openEditItem(item)}
                      className="action-button flex-1"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `هل تريد حذف الصنف (${item.name}) نهائيًا؟`,
                          )
                        ) {
                          onDeleteItem(item.id);
                        }
                      }}
                      className="action-button text-status-danger border-status-danger-line"
                      aria-label={`حذف ${item.name}`}
                      title="حذف الصنف"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button></>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* نافذة تعديل الصنف */}
      {canManage && editingItem && (
        <Modal title={<>تعديل الصنف</>} onClose={()=>setEditingItem(null)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={handleSaveItemEdits}
                className="operation-primary flex-1"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}>
            <label className="block">
              اسم الصنف
              <input
                type="text"
                value={editingItem.name}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, name: e.target.value })
                }
                className="operation-input font-bold"
              />
            </label>
            <div className="operation-fields">
              <label>
                القسم
                <select
                  value={editingItem.category==='raw_spice'?'direct_product':editingItem.category}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: editingItem.category==='raw_spice'&&e.target.value==='direct_product'?'raw_spice':e.target.value as ItemCategory,
                    })
                  }
                  className="operation-input"
                >
                  {itemCategories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label>
                الرصيد ({displayUnit(editingItem.baseUnit)})
                <input
                  type="number"
                  step="0.25"
                  value={editDraft.stock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, stock: e.target.value })
                  }
                  className="operation-input font-bold"
                />
              </label>
              <label>
                التكلفة (ج.م)
                <input
                  type="number"
                  value={editDraft.costPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, costPrice: e.target.value })
                  }
                  className="operation-input font-bold"
                />
              </label>
              <label>
                حد النواقص
                <input
                  type="number"
                  value={editDraft.minStock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, minStock: e.target.value })
                  }
                  className="operation-input font-bold"
                />
              </label>
              <label>
                سعر القطاعي
                <input
                  type="number"
                  value={editDraft.retailPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, retailPrice: e.target.value })
                  }
                  className="operation-input font-bold"
                />
              </label>
              <label>
                سعر الجملة
                <input
                  type="number"
                  value={editDraft.wholesalePrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      wholesalePrice: e.target.value,
                    })
                  }
                  className="operation-input font-bold"
                />
              </label>
            </div>
            {editError && (
              <p role="alert" className="field-error">{editError}</p>
            )}</Modal>
      )}

      {/* نافذة إضافة صنف جديد */}
      {canManage && showAddModal && <ItemDefinitionModal items={items} onSave={onAddNewItem} onClose={()=>setShowAddModal(false)}/>}
    </div>
  );
};

// ============================================================================
// 2. شاشة النواقص (ShortagesScreen)
// ============================================================================
export const ShortagesScreen: React.FC<{
  items: InventoryItem[];
  onOpenMovement?: (id:string)=>void;
  onNavigateToPurchase: () => void;
  onNavigateToProduction: () => void;
  onBack: () => void;
}> = ({ items, onOpenMovement, onNavigateToPurchase, onNavigateToProduction, onBack }) => {
  const [query,setQuery]=useState('');
  const lowItems = useMemo(()=>items.filter(i=>isStockItem(i)&&i.stock<=i.minStock),[items]);
  const matches=useMemo(()=>lowItems.filter(item=>matchesRecordSearch(query,item.name,item.code)),[lowItems,query]);
  const shortagePage=useRecordPage(matches,query,20);

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title={<>النواقص ( {lowItems.length} )</>} description={<>الأصناف التي تحتاج توريدًا أو مراجعة رصيدها.</>} icon={HeaderTriangleAlert} onBack={onBack}></OperationHeader>

      <div className="record-workspace">
        <label className="record-search">البحث في النواقص
          <input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="اسم الصنف أو الكود" />
        </label>
        {shortagePage.total>shortagePage.pageSize&&<RecordPagination {...shortagePage}/>}
        {shortagePage.total === 0 ? (
          <p className="record-state">
            {lowItems.length?'لا توجد نواقص مطابقة.':'لا توجد نواقص حاليًا.'}
          </p>
        ) : (
          <div className="record-grid">
            {shortagePage.visible.map((item) => {
              const cheapest =
                item.supplierPrices.length > 0
                  ? item.supplierPrices.reduce(
                      (min, p) => (p.price < min.price ? p : min),
                      item.supplierPrices[0],
                    )
                  : null;

              return (
                <article
                  key={item.id}
                  className="record-card flex flex-col justify-between gap-3 border-gold-edge"
                >
                  <div className="record-heading mb-0">
                    <div>
                      <h2 className="text-sm font-extrabold text-ink-strong">
                        {item.name}
                      </h2>
                      <p className="mt-1">
                        حد الطلب: <b>{item.minStock}</b>
                        {cheapest &&
                          ` • أرخص مورد: ${cheapest.supplierName} (${cheapest.price} ج.م)`}
                      </p>
                    </div>
                    <span className="record-badge bg-status-danger-bg text-status-danger border-status-danger-line font-black">
                      المتبقي: {item.stock}{" "}
                      {displayUnit(item.baseUnit)}
                    </span>
                  </div>
                  <div className="record-actions">
                    {onOpenMovement&&<button type="button" className="record-action" onClick={()=>onOpenMovement(item.id)}>فتح حركة الصنف</button>}
                    <button
                      type="button"
                      onClick={
                        item.category === "manufactured_blend"
                          ? onNavigateToProduction
                          : onNavigateToPurchase
                      }
                      className="operation-primary"
                    >
                      {item.category === "manufactured_blend"
                        ? "تصنيع في الإنتاج"
                        : "شراء من المورد"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. شاشة الموردين والعملاء (مع كشف حساب تفصيلي + واتساب + طباعة + إضافة وحذف)
// ============================================================================
export const SuppliersAndCustomersScreen: React.FC<{
  mode: "suppliers" | "customers";
  initialStatementId?: string;
  listView?:{query:string;page:number};
  onListViewChange?:(view:{query:string;page:number})=>void;
  onOpenPurchase?: (id:string)=>void;
  onOpenSale?: (id:string)=>void;
  suppliers: Supplier[];
  customers: Customer[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  accountPayments: AccountPaymentRecord[];
  onPaySupplier: (
    supplierId: string,
    amount: number,
    notes?: string,
  ) => boolean;
  onCollectCustomer: (
    customerId: string,
    amount: number,
    notes?: string,
  ) => boolean;
  onDeletePayment?: (paymentId: string) => void;
  onAddSupplier: (sup: Omit<Supplier, "id">) => void|boolean;
  onUpdateContact?:(mode:'suppliers'|'customers',id:string,details:{name:string;phone:string;area?:string;address?:string;representativeName?:string})=>boolean;
  onDeleteSupplier: (id: string) => void;
  onAddCustomer: (cust: Omit<Customer, "id">) => void|boolean;
  onDeleteCustomer: (id: string) => void;
  canManageContacts?: boolean;
  canManagePayments?: boolean;
  onBack: () => void;
}> = ({
  mode,
  initialStatementId,
  listView,
  onListViewChange,
  onOpenPurchase,
  onOpenSale,
  suppliers,
  customers,
  purchaseInvoices,
  salesInvoices,
  accountPayments,
  onPaySupplier,
  onUpdateContact,
  onCollectCustomer,
  onDeletePayment,
  onAddSupplier,
  onDeleteSupplier,
  onAddCustomer,
  onDeleteCustomer,
  canManageContacts = true,
  canManagePayments = true,
  onBack,
}) => {
  const [localView,setLocalView]=useState({query:'',page:0});
  const view=listView??localView;
  const {query}=view;
  const setView=onListViewChange??setLocalView;
  const matchingSuppliers=useMemo(()=>suppliers.filter(supplier=>
    matchesRecordSearch(query,supplier.name,supplier.phone,supplier.address,supplier.representativeName)),[suppliers,query]);
  const matchingCustomers=useMemo(()=>customers.filter(customer=>
    matchesRecordSearch(query,customer.name,customer.phone,customer.area)),[customers,query]);
  const pagination={page:view.page,setPage:(next:number)=>setView({...view,page:next})};
  const supplierPage=useRecordPage(matchingSuppliers,query,20,pagination);
  const customerPage=useRecordPage(matchingCustomers,query,20,pagination);
  const page=mode==='suppliers'?supplierPage:customerPage;
  const [editingContact,setEditingContact]=useState<Customer|Supplier|null>(null);
  const [payModalTarget, setPayModalTarget] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [statementTargetId, setStatementTargetId] = useState<string | null>(initialStatementId ?? null);
  const [amountInput, setAmountInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newArea,setNewArea]=useState('');
  const [newAddress,setNewAddress]=useState('');
  const [newRepresentative,setNewRepresentative]=useState('');
  const [newCatOrType, setNewCatOrType] = useState("");
  const [newBalance, setNewBalance] = useState("0");
  const [addModalError, setAddModalError] = useState("");
  const [payModalError, setPayModalError] = useState("");

  const activeStatementEntity = useMemo(() => {
    if (!statementTargetId) return null;
    if (mode === "suppliers") {
      return suppliers.find((s) => s.id === statementTargetId) || null;
    }
    return customers.find((c) => c.id === statementTargetId) || null;
  }, [statementTargetId, mode, suppliers, customers]);

  const handleCreate = () => {
    try {
      if(mode==='suppliers')checkSupplierDetails({name:newName,phone:newPhone,address:newAddress,representativeName:newRepresentative});
      else checkCustomerDetails({name:newName,phone:newPhone,area:newArea});
    }catch(error){setAddModalError((error as Error).message);return;}
    if (!newName.trim()) {
      setAddModalError("أدخل الاسم أولاً");
      return;
    }
    const balance = parseFloat(newBalance);
    if (!Number.isFinite(balance) || balance < 0) {
      setAddModalError("الرصيد الافتتاحي يجب أن يكون رقمًا غير سالب");
      return;
    }
    if (mode === "suppliers") {
      const accepted=onAddSupplier({
        name: newName.trim(),
        phone: newPhone.trim(),
        address:newAddress.trim(),
        representativeName:newRepresentative.trim(),
        category: newCatOrType || "مورد بن وخامات",
        balance:0,
        totalPurchases: 0,
        invoicesCount: 0,
      });
      if(accepted===false){setAddModalError("لم يتم حفظ المورد؛ راجع التنبيه");return;}
    } else {
      const accepted=onAddCustomer({
        name: newName.trim(),
        phone: newPhone.trim(),
        area:newArea.trim(),
        type: "جملة - كافيه",
        balance,
        totalSales: 0,
        invoicesCount: 0,
      });
      if(accepted===false){setAddModalError("لم يتم حفظ العميل؛ راجع التنبيه");return;}
    }
    setAddModalError("");
    setNewName("");
    setNewPhone("");
    setNewArea('');setNewAddress('');setNewRepresentative('');
    setNewBalance("0");
    setShowAddModal(false);
  };

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title={<>{mode === "suppliers"
            ? `الموردين (${suppliers.length})`
            : `العملاء (${customers.length})`}</>} description={<>بيانات التواصل وسجل المعاملات والأرصدة.</>} icon={HeaderUsers} onBack={onBack}>{canManageContacts && <button
          type="button"
          onClick={() => setShowAddModal(true)}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          إضافة
        </button>}</OperationHeader>

      <div className="record-workspace">
        <label className="record-search">{mode==='suppliers'?'بحث في الموردين':'بحث في العملاء'}
          <input type="search" value={query} onChange={event=>setView({query:event.target.value,page:0})}
            placeholder={mode==='suppliers'?'الاسم أو التليفون أو المندوب':'الاسم أو التليفون أو المنطقة'}/>
        </label>
        {!page.total&&<p className="record-state" role="status">{query.trim()?'مفيش نتائج مطابقة للبحث.':mode==='suppliers'?'لسه مفيش موردين مسجلين.':'لسه مفيش عملاء مسجلين.'}</p>}
        {page.total>page.pageSize&&<RecordPagination {...page}/>}
        <div className="contact-records">
          {mode === "suppliers"
            ? supplierPage.visible.map(sup=>{
                const purchases=supplierPurchaseHistory(purchaseInvoices,sup.id);
                return <article key={sup.id} className="record-card space-y-3">
                  <div className="record-heading mb-0">
                    <div>
                      <h2 className="font-black text-ink-strong">{sup.name}</h2>
                      <p>{sup.phone} — {sup.address||'العنوان غير مسجل'}</p>
                      <p>المندوب: {sup.representativeName||'غير مسجل'}</p>
                    </div>
                    <span className="record-badge">{purchases.purchases.length} فواتير</span>
                  </div>
                  <dl className="record-facts mb-0">
                    <div><dt>إجمالي الشراء</dt><dd>{purchases.total.toLocaleString('ar-EG')} ج.م</dd></div>
                    <div><dt>عدد الفواتير</dt><dd>{purchases.purchases.length}</dd></div>
                  </dl>
                  <div className="register-actions">
                    {canManageContacts&&onUpdateContact&&<button type="button" onClick={()=>setEditingContact(sup)} className="action-button flex-1">تعديل البيانات</button>}
                    {canManageContacts&&<button type="button" onClick={()=>onDeleteSupplier(sup.id)} className="action-button text-status-danger border-status-danger-line">حذف المورد</button>}
                  </div>
                  <SupplierPurchasePanels data={purchases} onOpenInvoice={onOpenPurchase}/>
                </article>;
              })
            : customerPage.visible.map((cust) => (
                <article
                  key={cust.id}
                  className="record-card space-y-3"
                >
                  <div className="record-heading mb-0">
                    <div>
                      <h2 className="font-black text-ink-strong">
                        {cust.name}
                      </h2>
                      <p>
                        {cust.type} • {cust.phone}
                      </p>
                      <p>المنطقة: {cust.area || 'غير مسجلة'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-end">
                        <div className="text-xs text-ink">عليه</div>
                        <div
                          className={`text-sm font-black ${
                            cust.balance > 0
                              ? "text-gold"
                              : "text-status-ok"
                          }`}
                        >
                          {cust.balance.toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>
                      {canManageContacts && <button
                        type="button"
                        onClick={() => onDeleteCustomer(cust.id)}
                        className="action-button text-status-danger border-status-danger-line"
                        aria-label={`حذف ${cust.name}`}
                        title="حذف العميل"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>}
                    </div>
                  </div>
                  <div className="record-actions pt-2 border-t border-line-subtle">
                    {canManageContacts&&onUpdateContact&&<button type="button" className="action-button" onClick={()=>setEditingContact(cust)}>تعديل البيانات</button>}
                    <button
                      type="button"
                      onClick={() => setStatementTargetId(cust.id)}
                      className="record-action flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>كشف حساب تفصيلي / واتساب</span>
                    </button>
                    {canManagePayments && cust.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayModalTarget({
                            id: cust.id,
                            name: cust.name,
                            balance: cust.balance,
                          });
                          setAmountInput(String(cust.balance));
                        }}
                        className="operation-primary"
                      >
                        تحصيل دفعة
                      </button>
                    )}
                  </div>
                </article>
              ))}
        </div>
      </div>

      {canManageContacts&&editingContact&&onUpdateContact&&<ContactEditModal target={editingContact} mode={mode} onSave={(id,details)=>onUpdateContact(mode,id,details)} onClose={()=>setEditingContact(null)}/>}
      {/* نافذة كشف الحساب التفصيلي للمورد أو العميل */}
      {activeStatementEntity && (
        <AccountStatementModal
          mode={mode === "suppliers" ? "supplier" : "customer"}
          target={activeStatementEntity}
          onOpenInvoice={mode==="customers"&&onOpenSale?(id)=>{setStatementTargetId(null);onOpenSale(id);}:onOpenPurchase}
          purchaseInvoices={purchaseInvoices}
          salesInvoices={salesInvoices}
          accountPayments={accountPayments}
          onRecordPayment={canManagePayments ? (amt, notes) => {
            if (mode === "suppliers") {
              return onPaySupplier(activeStatementEntity.id, amt, notes);
            } else {
              return onCollectCustomer(activeStatementEntity.id, amt, notes);
            }
          } : undefined}
          onDeletePayment={canManagePayments ? onDeletePayment : undefined}
          onClose={() => setStatementTargetId(null)}
        />
      )}

      {canManagePayments && payModalTarget && (
        <Modal title={<>{mode === "suppliers" ? "سداد للمورد:" : "تحصيل من العميل:"} {" "}  {payModalTarget.name}</>}  onClose={()=>setPayModalTarget(null)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  const val = parseFloat(amountInput);
                  if (!Number.isFinite(val) || val <= 0) {
                    setPayModalError("أدخل مبلغًا صحيحًا أكبر من صفر");
                    return;
                  }
                  const ok =
                    mode === "suppliers"
                      ? onPaySupplier(payModalTarget.id, val)
                      : onCollectCustomer(payModalTarget.id, val);
                  if (!ok) {
                    setPayModalError(
                      "رفض النظام الحركة (راجع المبلغ والرصيد)؛ جرّب قيمة أخرى",
                    );
                    return;
                  }
                  setPayModalError("");
                  setPayModalTarget(null);
                }}
                className="operation-primary flex-1"
              >
                تأكيد
              </button>
              <button
                type="button"
                onClick={() => setPayModalTarget(null)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}><div className="operation-caption">
              {mode === "suppliers" ? "له حاليًا" : "عليه حاليًا"}:{" "}
              <b>
                {(mode === "suppliers"
                  ? suppliers.find((s) => s.id === payModalTarget.id)?.balance
                  : customers.find((c) => c.id === payModalTarget.id)
                      ?.balance) ?? payModalTarget.balance}
                {" ج.م"}
              </b>
            </div>
<input
              type="number"
              aria-label="المبلغ"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                if (payModalError) setPayModalError("");
              }}
              className="operation-input font-black text-center"
            />
{payModalError && (
              <p role="alert" className="field-error text-center">
                {payModalError}
              </p>
            )}</Modal>
      )}

      {canManageContacts && showAddModal && (
        <Modal title={<>{mode === "suppliers" ? "إضافة مورد جديد" : "إضافة عميل جديد"}</>}  onClose={()=>setShowAddModal(false)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={handleCreate}
                className="operation-primary flex-1"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}><input
              type="text"
              aria-label="الاسم"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="الاسم باختصار..."
              className="operation-input font-bold"
            />
<input
              type="text"
              aria-label="رقم التليفون"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="رقم التليفون..."
              className="operation-input font-bold"
            />
{mode==='customers' ? <input aria-label="منطقة العميل" value={newArea} onChange={e=>setNewArea(e.target.value)} placeholder="المنطقة" className="operation-input"/> : <>
              <input aria-label="عنوان المورد" value={newAddress} onChange={e=>setNewAddress(e.target.value)} placeholder="العنوان" className="operation-input"/>
              <input aria-label="اسم المندوب" value={newRepresentative} onChange={e=>setNewRepresentative(e.target.value)} placeholder="اسم المندوب" className="operation-input"/>
            </>}
{addModalError && <p role="alert" className="field-error">{addModalError}</p>}
{mode==='customers'&&<input
              type="number"
              aria-label="الرصيد الافتتاحي"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              placeholder="الرصيد الافتتاحي (ج.م)"
              className="operation-input font-bold"
            />}</Modal>
      )}
    </div>
  );
};

// ============================================================================
// 4. شاشة الفواتير والمرتجعات (مع طباعة إيصال وإرسال واتساب وحذف الفاتورة)
// ============================================================================
export const SalesInvoicesAndReturnsScreen: React.FC<{
  salesInvoices: SalesInvoice[];
  cashierDays?:CashierDay[];
  customers: Customer[];
  onReturnInvoice: (invoiceId: string) => void;
  onDeleteInvoice: (invoiceId: string) => void;
  onBack: () => void;
}> = ({
  salesInvoices,
  cashierDays=[],
  customers,
  onReturnInvoice,
  onDeleteInvoice,
  onBack,
}) => {
  const [historyKind,setHistoryKind]=useState<'wholesale'|'cashier'|'legacy'>(()=>cashierDays.length?'cashier':salesInvoices.some(i=>i.saleType!=='wholesale')?'legacy':'wholesale');
  const invoiceRecords=useMemo(()=>salesInvoices.filter(i=>historyKind==='wholesale'?i.saleType==='wholesale':i.saleType!=='wholesale'),[salesInvoices,historyKind]);
  const [selectedReceiptInv, setSelectedReceiptInv] =
    useState<SalesInvoice | null>(null);
  const [invoiceSearch,setInvoiceSearch]=useState('');
  const matchingInvoices=useMemo(()=>{
    const q=invoiceSearch.trim().toLocaleLowerCase();
    return q?invoiceRecords.filter(inv=>[inv.invoiceNumber,inv.customerName,inv.date,...inv.items.map(line=>line.itemName)].some(text=>text.toLocaleLowerCase().includes(q))):invoiceRecords;
  },[invoiceRecords,invoiceSearch]);
  const invoicePage=useRecordPage(matchingInvoices,invoiceSearch);

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title={<>سجل المبيعات ( {salesInvoices.length} )</>} description={<>فواتير الجملة وأيام الكاشير والسجل السابق.</>} icon={HeaderReceiptText} onBack={onBack}><button
          type="button"
          onClick={() => window.print()}
          aria-label="طباعة الصفحة الحالية"
          title="طباعة الصفحة الحالية"
        >
          <Printer className="w-5 h-5" aria-hidden="true" />
        </button></OperationHeader>

      <div className="operation-tab-strip">
        <nav aria-label="نوع سجل المبيعات" className="record-tabs">
          {([{id:'wholesale',label:'فواتير الجملة'},{id:'cashier',label:'مبيعات أيام الكاشير'},{id:'legacy',label:'السجل السابق'}] as const).map(t=><button type="button" key={t.id} aria-pressed={historyKind===t.id} onClick={()=>setHistoryKind(t.id)}>{t.label}</button>)}
        </nav>
      </div>
      {historyKind==='cashier'?<CashierDayHistory days={cashierDays}/>:<>
      <div className="record-workspace">
        <label className="record-search">البحث في الفواتير
          <input aria-label="بحث في كل الفواتير" placeholder="رقم الفاتورة أو العميل أو التاريخ أو الصنف" value={invoiceSearch} onChange={event=>setInvoiceSearch(event.target.value)} />
        </label>
        <RecordPagination {...invoicePage} />
        {matchingInvoices.length === 0 ? (
          <p className="record-state">
            {invoiceSearch.trim() ? 'لا توجد فواتير مطابقة للبحث.' : 'لا توجد فواتير مسجلة حالياً.'}
          </p>
        ) : (
          <div className="record-grid">
            {invoicePage.visible.map((inv) => (
              <article
                key={inv.id}
                className={`record-card space-y-3 ${
                  inv.isReturned ? "border-status-danger-line bg-status-danger-bg/40 opacity-85" : ""
                }`}
              >
                <div className="record-heading mb-0">
                  <div>
                    <p className="font-extrabold text-gold" dir="ltr">
                      #{inv.invoiceNumber} • {inv.date}
                    </p>
                    <h2 className="font-extrabold text-ink-strong">
                      {inv.customerName}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="record-badge">
                      {inv.isReturned
                        ? "مرتجع"
                        : inv.saleType === "wholesale"
                          ? "جملة"
                          : inv.saleType === "cashier_sync"
                            ? "كاشير"
                            : "محل"}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteInvoice(inv.id)}
                      className="action-button text-status-danger border-status-danger-line"
                      disabled
                      aria-label="حذف المستند المعتمد معطل"
                      title="حذف المستند المعتمد معطل؛ استخدم المرتجع"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="bg-surface-sunken rounded-md p-2.5 space-y-1 border border-line-subtle text-xs">
                  {inv.items.map((line, idx) => (
                    <div key={idx} className="flex justify-between font-bold">
                      <span>
                        • {line.itemName} ({line.quantity} {line.unitLabel})
                      </span>
                      <span>{line.totalPrice} ج.م</span>
                    </div>
                  ))}
                </div>

                <dl className="record-facts mb-0">
                  <div>
                    <dt>الإجمالي</dt>
                    <dd>{inv.totalAmount} ج.م</dd>
                  </div>
                  <div>
                    <dt>الربح</dt>
                    <dd className="text-status-ok">+{inv.netProfit.toFixed(1)} ج.م</dd>
                  </div>
                </dl>

                <div className="record-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedReceiptInv(inv)}
                    className="record-action flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>طباعة / واتساب</span>
                  </button>
                  {inv.isReturned && inv.returnRefundAmount !== undefined && (
                    <p className="text-xs text-status-warn">
                      مبلغ الاسترداد المسجل:{" "}
                      {inv.returnRefundAmount.toLocaleString("ar-EG")} ج.م
                    </p>
                  )}
                  {!inv.isReturned && (<details className="w-full"><summary className="action-button w-full cursor-pointer justify-center">تسوية استثنائية</summary>
                    <button
                      type="button"
                      onClick={() => onReturnInvoice(inv.id)}
                      className="action-button w-full mt-2 text-status-warn border-status-warn-line"
                    >
                      <RotateCcw className="w-4 h-4" aria-hidden="true" />
                      تسجيل مرتجع استثنائي
                    </button></details>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <RecordPagination {...invoicePage} />
      </div>
      </>}
      {selectedReceiptInv && (
        <InvoiceReceiptModal
          invoice={selectedReceiptInv}
          customerPhone={
            customers.find(
              (c) =>
                c.id === selectedReceiptInv.customerId ||
                c.name === selectedReceiptInv.customerName,
            )?.phone || ""
          }
          onClose={() => setSelectedReceiptInv(null)}
        />
      )}
    </div>
  );
};

// ============================================================================
// 5. شاشة الإدارة والتحكم في البيانات وتصفير البيانات التجريبية (MoreMenuScreen)
// ============================================================================
interface MoreMenuProps {
  accountPermissions?:string[];
  expenses: Expense[];
  partners: Partner[];
  auditLogs: AuditLogEntry[];
  currentPartner: Partner;
  onOpenCashier?:()=>void;
  showBackupHealth?:boolean;
  initialSubPage?:
    | "menu"
    | "data_control"
    | "expenses"
    | "partners"
    | "cloud";
  onAddExpense: (exp: Omit<Expense, "id">) => void | boolean;
  showDemoTools?: boolean;
  canManageData?:boolean;
  canManageExpenses?:boolean;
  canEditPartners?:boolean;
  onSavePartners?:(next:Partner[])=>boolean;
  selectedFinancialPartnerId?:string;
  onSelectFinancialPartnerId?:(id:string)=>void;
  onDeleteExpense: (id: string) => void;
  onUpdatePartnerAccount: (
    id: string,
    patch: Partial<Pick<Partner, "name" | "phone">>,
  ) => void;
  onClearAllDemoData: () => void;
  onClearTransactionsKeepCatalog: () => void;
  onRestoreDefaultDemoData: () => void;
  onDownloadBackupJson: () => void;
  onExportFullExcel: () => void;
  onRestoreBackupJson: (parsedData: Record<string, unknown>) => void;
  onLogout: () => void;
  onNavigate: (screen: string) => void;
  onBack: () => void;
}

export const MoreMenuScreen: React.FC<MoreMenuProps> = ({
  expenses,
  partners,
  auditLogs,
  currentPartner,
  initialSubPage = "menu",
  onOpenCashier,
  showBackupHealth,
  showDemoTools = false,
  accountPermissions=[],
  canManageData=true,canManageExpenses=true,canEditPartners=false,onSavePartners,
  selectedFinancialPartnerId,onSelectFinancialPartnerId,
  onAddExpense,
  onDeleteExpense,
  onUpdatePartnerAccount,
  onClearAllDemoData,
  onClearTransactionsKeepCatalog,
  onRestoreDefaultDemoData,
  onDownloadBackupJson,
  onExportFullExcel,
  onRestoreBackupJson,
  onLogout,
  onNavigate,
  onBack,
}) => {
  const [subPage, setSubPage] = useState<
    "menu" | "data_control" | "expenses" | "partners" | "cloud"
  >(initialSubPage);

  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expFrequency,setExpFrequency]=useState<NonNullable<Expense['frequency']>>('daily');
  const [expenseFilter,setExpenseFilter]=useState<'all'|'monthly_fixed'|'daily'>('all');
  const [expenseQuery,setExpenseQuery]=useState('');
  const matchingExpenses=useMemo(()=>expenses.filter(expense=>
    (expenseFilter==='all'||expense.frequency===expenseFilter)&&
    matchesRecordSearch(expenseQuery,expense.date,expense.category,expense.title,expense.notes)),[expenses,expenseFilter,expenseQuery]);
  const expensePage=useRecordPage(matchingExpenses,expenseFilter+'|'+expenseQuery,20);
  const [expenseError, setExpenseError] = useState("");
  const [expCategory, setExpCategory] =
    useState<Expense["category"]>("أكياس وتغليف");
  const [expPaidFrom, setExpPaidFrom] =
    useState<Expense["paidFrom"]>("درج المحل");

  const creds = getSupabaseCredentials();
  const [sbUrl, setSbUrl] = useState(creds.url);
  const [sbKey, setSbKey] = useState(creds.anonKey);
  const [savedCloudMsg, setSavedCloudMsg] = useState(false);

  // صفحة التحكم في البيانات وحذف الداتا التجريبية
  if ((subPage==='data_control'||subPage==='cloud')&&!canManageData)return <div className="p-6 space-y-4"><p>إدارة البيانات متاحة للمالك الرئيسي فقط.</p><button onClick={()=>setSubPage('menu')}>رجوع</button></div>;
  if (subPage === "data_control") {
    return (
      <div className="operation-screen min-h-screen pb-24">
        <OperationHeader title={<>النسخ الاحتياطي واسترجاع البيانات</>} description={<>تصدير بيانات المحل واسترجاع نسخة محفوظة.</>} icon={HeaderDatabaseBackup} onBack={onBack}></OperationHeader>

        <div className="record-workspace">
          {onOpenCashier&&<OperationalHealth showBackup={showBackupHealth} onCashier={onOpenCashier}/> }
          <div className="summary-banner-dark space-y-3">
            <div className="flex items-center gap-2 text-sm font-black text-gold-highlight">
              <Download className="w-5 h-5 text-gold-soft" aria-hidden="true" />
              <span>النسخ الاحتياطي الشامل واسترجاع البيانات</span>
            </div>
            <p className="text-xs text-ink-on-dark leading-relaxed">
              احفظ نسخة كاملة من بيانات المحل (أصناف، وصفات، فواتير، موردين،
              عملاء، وعمال) على جهازك أو استرجعها في أي وقت بضغطة زر.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onDownloadBackupJson}
                className="operation-primary"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>حفظ نسخة (Backup)</span>
              </button>
              <button
                type="button"
                onClick={onExportFullExcel}
                className="action-button bg-status-ok text-white border-status-ok"
              >
                <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                <span>تصدير إكسيل شامل</span>
              </button>
            </div>
            <label className="w-full min-h-[44px] bg-white/10 hover:bg-white/15 border border-gold-edge text-gold-highlight font-extrabold py-2.5 px-3 rounded-md text-xs flex items-center justify-center gap-2 cursor-pointer transition">
              <Upload className="w-4 h-4 text-gold-soft" aria-hidden="true" />
              <span>استرجاع نسخة احتياطية من ملف (.json)</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) {
                    alert(
                      "حجم النسخة أكبر من 10 ميجابايت؛ يلزم استرجاعها من أداة الإدارة.",
                    );
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      const parsed = JSON.parse(
                        String(ev.target?.result || "{}"),
                      );
                      if (parsed && typeof parsed === "object") {
                        onRestoreBackupJson(parsed);
                      }
                    } catch {
                      alert(
                        "الملف غير صالح، يرجى اختيار ملف النسخة الاحتياطية الصحيح.",
                      );
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>

          {showDemoTools && (
            <div className="record-grid">
              {/* الخيار 1: تصفير الفواتير والحركات فقط مع بقاء الأصناف والوصفات */}
              <div className="record-card border-gold-edge space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-black text-ink-strong">
                  <RotateCcw className="w-5 h-5 text-gold" aria-hidden="true" />
                  <span>حذف الفواتير والحركات التجريبية فقط</span>
                </div>
                <p className="text-xs text-ink leading-relaxed">
                  يحذف فواتير البيع والشراء والمصروفات والسجل التجريبي ويصفّر
                  الأرصدة، مع{" "}
                  <b>الإبقاء على أسماء أصناف البن والتوليفات والوصفات</b>{" "}
                  لتعديلها كما تريد.
                </p>
                <button
                  type="button"
                  onClick={onClearTransactionsKeepCatalog}
                  className="operation-primary w-full"
                >
                  تصفير الفواتير والأرصدة مع بقاء الأصناف
                </button>
              </div>

              {/* الخيار 2: حذف كل البيانات التجريبية بالكامل والبدء من الصفر */}
              <div className="record-card border-status-danger-line space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-black text-status-danger">
                  <Trash2 className="w-5 h-5" aria-hidden="true" />
                  <span>
                    حذف كل البيانات التجريبية بالكامل (البدء من الصفر)
                  </span>
                </div>
                <p className="text-xs text-ink leading-relaxed">
                  يمسح كل الأصناف، التوليفات، الفواتير، الموردين، العملاء،
                  والعمال التجريبيين بالكامل لتبدأ بإدخال بيانات محلك الحقيقية
                  من الصفر.
                </p>
                <button
                  type="button"
                  onClick={onClearAllDemoData}
                  className="action-button w-full bg-status-danger text-white border-status-danger"
                >
                  حذف جميع البيانات التجريبية نهائياً
                </button>
              </div>

              {/* الخيار 3: استعادة البيانات التجريبية */}
              <div className="record-card space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-black text-ink-strong">
                  <RefreshCw className="w-5 h-5 text-status-ok" aria-hidden="true" />
                  <span>استعادة البيانات التجريبية الافتراضية</span>
                </div>
                <p className="text-xs text-ink">
                  إرجاع أصناف البن والتوليفات والفواتير التجريبية لمعاينة
                  النظام.
                </p>
                <button
                  type="button"
                  onClick={onRestoreDefaultDemoData}
                  className="action-button w-full bg-status-ok text-white border-status-ok"
                >
                  استعادة الداتا التجريبية
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (subPage === "expenses") {
    return (
      <div className="operation-screen min-h-screen pb-24">
        <OperationHeader title={<>المصروفات</>} description={<>المصروفات اليومية والشهرية الثابتة.</>} icon={HeaderWallet} onBack={onBack}></OperationHeader>
        <div className="record-workspace">
          <div className={canManageExpenses ? "workspace-split-layout" : undefined}>
            {canManageExpenses && <section className="operation-surface space-y-3">
              <h2 className="text-xs font-extrabold text-gold mb-0">
                + تسجيل مصروف جديد
              </h2>
              {onSelectFinancialPartnerId&&<label className="block">حساب الشريك المالي للحركة<select aria-label="حساب الشريك المالي للحركة" className="operation-input" value={selectedFinancialPartnerId??''} onChange={e=>onSelectFinancialPartnerId(e.target.value)}><option value="">اختر الحساب المالي</option>{partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
              <input
                type="text"
                aria-label="بيان المصروف"
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="بيان المصروف باختصار..."
                className="operation-input font-bold"
              />
              <div className="operation-fields">
                <input
                  type="number"
                  aria-label="مبلغ المصروف"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="المبلغ (ج.م)"
                  className="operation-input font-bold"
                />
                <select
                  aria-label="تصنيف المصروف"
                  value={expCategory}
                  onChange={(e) =>
                    setExpCategory(e.target.value as Expense["category"])
                  }
                  className="operation-input font-bold"
                >
                  <option value="أكياس وتغليف">تغليف وأكياس</option>
                  <option value="صيانة مطاحن وماكينات">صيانة</option>
                  <option value="رواتب ويوميات">رواتب</option>
                  <option value="إيجار">إيجار</option>
                  <option value="كهرباء ومياه وغاز">مرافق</option>
                  <option value="مسحوبات شركاء">مسحوبات شريك</option>
                  <option value="نثريات أخرى">نثريات</option>
                </select>
              </div>
              <label className="block">نوع المصروف
                <select aria-label="نوع المصروف" value={expFrequency} onChange={e=>setExpFrequency(e.target.value as NonNullable<Expense['frequency']>)} className="operation-input">
                  <option value="daily">مصروف يومي</option><option value="monthly_fixed">مصروف شهري ثابت</option>
                </select>
              </label>
              <p className="operation-caption">التصنيف الشهري يحفظ نوع المصروف؛ كل عملية صرف تُسجل عند حدوثها.</p>
              <div className="grid grid-cols-3 gap-2">
                {(["درج المحل", "خزنة الشركة", "من جيب الشريك"] as const).map(
                  (src) => (
                    <button
                      type="button"
                      key={src}
                      aria-pressed={expPaidFrom === src}
                      onClick={() => setExpPaidFrom(src)}
                      className={`action-button ${
                        expPaidFrom === src ? "action-button-primary" : ""
                      }`}
                    >
                      {src}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const amt = Number(expAmount);
                  if (!expTitle.trim() || !Number.isFinite(amt) || amt <= 0) {
                    setExpenseError(
                      "أدخل بيان المصروف ومبلغًا صحيحًا أكبر من صفر",
                    );
                    return;
                  }
                  const accepted = onAddExpense({
                    date: businessDate(),
                    category: expCategory,
                    frequency:expFrequency,
                    title: expTitle.trim(),
                    amount: amt,
                    partnerName: currentPartner.name,
                    paidFrom: expPaidFrom,
                  });
                  if (accepted === false) {
                    setExpenseError(
                      "لم يُحفظ المصروف؛ راجع التنبيه وصحّح البيانات",
                    );
                    return;
                  }
                  setExpenseError("");
                  setExpTitle("");
                  setExpAmount("");
                }}
                className="operation-primary w-full"
              >
                حفظ المصروف
              </button>
              {expenseError && (
                <p role="alert" className="field-error">
                  {expenseError}
                </p>
              )}
            </section>}

            <div className="space-y-3">
              <div className="operation-surface space-y-3">
                <label className="block">عرض المصروفات
                  <select aria-label="تصفية المصروفات" value={expenseFilter} onChange={e=>setExpenseFilter(e.target.value as typeof expenseFilter)} className="operation-input">
                    <option value="all">كل المصروفات</option><option value="daily">اليومية</option><option value="monthly_fixed">الشهرية الثابتة</option>
                  </select>
                </label>
                <label className="record-search">البحث في المصروفات
                  <input type="search" value={expenseQuery} onChange={event=>setExpenseQuery(event.target.value)}
                    placeholder="التاريخ أو نوع المصروف أو البيان" />
                </label>
              </div>
              <RecordPagination {...expensePage}/>
              {expenses.length>0&&!expensePage.total&&<p className="record-state">لا توجد مصروفات مطابقة.</p>}
              {expensePage.visible.map((e) => (
                <article
                  key={e.id}
                  className="record-card flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-ink-strong">
                      {e.title}
                      {e.isCancelled ? " — ملغى" : ""}
                    </div>
                    <div className="text-xs text-ink">{e.frequency==='monthly_fixed'?'شهري ثابت':e.frequency==='daily'?'يومي':'سجل سابق غير مصنّف'}</div>
                    <div className="text-xs text-ink">
                      {e.category} • {e.paidFrom} • {e.partnerName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-black text-status-danger">
                      {e.amount} ج.م
                    </span>
                    {canManageExpenses && <button
                      type="button"
                      disabled={e.isCancelled || Boolean(e.sourceInvoiceId) || Boolean(e.sourceEmployeeTransactionId)}
                      title="إلغاء المصروف مع حفظ السجل"
                      aria-label={`إلغاء ${e.title}`}
                      onClick={() => onDeleteExpense(e.id)}
                      className="action-button text-status-danger border-status-danger-line"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if(subPage==='partners')return <FinancialPartnersScreen partners={partners} canEdit={canEditPartners&&!!onSavePartners} onSave={onSavePartners??(()=>false)} onBack={onBack} onReports={()=>onNavigate('reports')}/>;

  if (subPage === "cloud") {
    return (
      <div className="operation-screen min-h-screen pb-24">
        <OperationHeader title={<>ربط Supabase</>} description={<>إعداد اتصال بيانات المحل.</>} icon={HeaderCloud} onBack={onBack}></OperationHeader>
        <div className="record-workspace">
          <div className="operation-surface space-y-3 max-w-xl">
            <label className="block">
              VITE_SUPABASE_URL
              <input
                type="text"
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="operation-input font-bold"
              />
            </label>
            <label className="block">
              VITE_SUPABASE_ANON_KEY
              <input
                type="password"
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="Anon Key..."
                className="operation-input font-bold"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                saveSupabaseCredentials(sbUrl, sbKey);
                setSavedCloudMsg(true);
              }}
              className="operation-primary w-full"
            >
              حفظ وتفعيل المزامنة
            </button>
            {savedCloudMsg && (
              <div className="text-xs text-status-ok font-bold text-center">
                ✓ تم الحفظ بنجاح
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { preference, setPreference, systemScheme } = useThemePreference();
  const themeOptions: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
    { id: 'system', label: `حسب الجهاز (${systemScheme === 'dark' ? 'ليلي' : 'نهاري'})`, icon: Monitor },
    { id: 'light', label: 'نهاري', icon: Sun },
    { id: 'dark', label: 'ليلي', icon: Moon },
  ];

  return (
    <div className="operation-screen pb-6">
      <OperationHeader title={<>حسابي</>} description={<>بيانات حساب الدخول والصلاحيات.</>} icon={HeaderCircleUser} onBack={onBack}></OperationHeader>

      <div className="account-content p-3.5">
        <div className="summary-banner-dark flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo.png"
              alt="بُن العجوز"
              className="w-10 h-10 rounded-md object-contain bg-surface-card p-0.5 border border-gold-edge shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-black text-gold-highlight">
                {currentPartner.name}
              </div>
              <div className="text-xs text-gold-soft">
                @{currentPartner.username} • {currentPartner.role}
              </div>
            </div>
          </div>
          <span className="record-badge bg-white/10 text-gold-highlight border-gold-edge shrink-0">
            حساب دخول
          </span>
        </div>

        <section className="account-access operation-surface space-y-3" aria-label="صلاحيات حسابك">
          <h2 className="font-black">صلاحيات حسابك</h2>
          <p className="text-xs text-ink">الاطلاع على بيانات المحل والحسابات والتقارير.</p>
          <p className="text-xs font-bold">{accountPermissions.length?'الأقسام المسموح لك بالتعديل فيها':'حساب للعرض فقط'}</p>
          <div className="flex flex-wrap gap-2">{accountPermissions.map(label=><span key={label} className="text-xs bg-surface-sunken border border-line rounded-md px-3 py-2">{label}</span>)}</div>
          <p className="text-xs text-ink-faint">حساب الدخول مستقل عن الشراكة والحصص المالية. يدير المالك الرئيسي المستخدمين والصلاحيات من قسم المستخدمين.</p>
          <div className="border-t border-line-subtle pt-3 space-y-2">
            <h3 className="text-xs font-extrabold text-ink-strong">مظهر الشاشة (وضع النهار والمناوبة الليلية)</h3>
            <div className="filter-pills" role="group" aria-label="اختيار مظهر الشاشة">
              {themeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={preference === opt.id}
                  onClick={() => setPreference(opt.id)}
                  className="filter-pill inline-flex items-center gap-1.5"
                >
                  <opt.icon size={15} aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
        <button type="button" onClick={onLogout} className="account-signout action-button w-full text-status-danger border-status-danger-line bg-status-danger-bg"><LogOut size={18} aria-hidden="true"/>تسجيل الخروج</button>

      </div>
    </div>
  );
};
