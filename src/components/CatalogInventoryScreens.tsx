import {decimalValue} from '../lib/decimalInput';
import {unitLabel as displayUnit} from '../lib/units';
import { Tag as HeaderTag, Package as HeaderPackage } from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {Modal} from './Modal';
import {matchesRecordSearch} from '../lib/recordSearch';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {CatalogNameDraftPanel} from './CatalogNameDraftPanel';
import {CatalogListControls,CatalogListNavigation} from './CatalogListControls';
import {CatalogProductRows} from './CatalogProductRows';
import {ActionButton} from './ActionButton';
import {browseCatalog,type CatalogSort} from '../lib/catalogBrowse';
import type {CatalogNameDraft,RecipeProductDefinition} from '../types/erp';
import { itemCategories, requiresRecipe, isStockItem, isRecipeOnUse } from '../lib/itemPolicy';
import React, { useState, useMemo } from "react";
import {RecordPagination,useRecordPage} from './RecordPagination';
import { Search, Plus, Flame, Trash2 } from 'lucide-react';
import { InventoryItem, ItemCategory } from "../types/erp";
import { itemEditPatch } from "../lib/operationChecks";

// التحقق أن كل القيم أرقام صحيحة غير سالبة (لحقول النص في النوافذ)
function allValidNumbers(values: string[]): boolean {
  return values.every((v) => {
    const n = decimalValue(v);
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
    if(!editDraft.stock?.trim()||!Number.isFinite(decimalValue(editDraft.stock))||(decimalValue(editDraft.stock)<0&&decimalValue(editDraft.stock)!==editingOriginal?.stock)){setEditError('الجرد الفعلي لا يقل عن صفر؛ يمكن إبقاء العجز الحالي دون تعديله');return;}
    const live = items.find((i) => i.id === editingItem.id);
    try {
      const code=editingItem.code.trim();
      if(!code)throw Error('كود المنتج مطلوب');
      if(items.some(item=>item.id!==editingItem.id&&(item.code.trim().toUpperCase()===code.toUpperCase()||item.barcode===code)))throw Error('كود المنتج مستخدم لصنف آخر');
      const patch = itemEditPatch(editingOriginal!, live, {
        code,
        name: editingItem.name.trim() || (live ? live.name : "صنف"),
        category: editingItem.category,
        costPrice: decimalValue(editDraft.costPrice),
        retailPrice: decimalValue(editDraft.retailPrice),
        wholesalePrice: decimalValue(editDraft.wholesalePrice),
        stock: decimalValue(editDraft.stock),
        minStock: decimalValue(editDraft.minStock),
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
    if(!editDraft.stock?.trim()||!Number.isFinite(decimalValue(editDraft.stock))||(decimalValue(editDraft.stock)<0&&decimalValue(editDraft.stock)!==editingOriginal?.stock)){setEditError('الجرد الفعلي لا يقل عن صفر؛ يمكن إبقاء العجز الحالي دون تعديله');return;}
    const live = items.find((i) => i.id === editingItem.id);
    try {
      const patch = itemEditPatch(editingOriginal!, live, {
        name: editingItem.name.trim() || (live ? live.name : "صنف"),
        category: editingItem.category,
        stock: decimalValue(editDraft.stock),
        minStock: decimalValue(editDraft.minStock),
        costPrice: decimalValue(editDraft.costPrice),
        retailPrice: decimalValue(editDraft.retailPrice),
        wholesalePrice: decimalValue(editDraft.wholesalePrice),
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
                  type="text" inputMode="decimal"
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
