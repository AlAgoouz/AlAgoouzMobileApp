import {Tag as HeaderTag,Package as HeaderPackage,TriangleAlert as HeaderTriangleAlert,Users as HeaderUsers,ReceiptText as HeaderReceiptText,DatabaseBackup as HeaderDatabaseBackup,Wallet as HeaderWallet,Cloud as HeaderCloud,CircleUser as HeaderCircleUser} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {Modal} from './Modal';
import {FinancialPartnersScreen} from './FinancialPartnersScreen';
import {CashierDayHistory} from './CashierDayHistory';
import type {CashierDay} from '../types/erp';
import {SupplierPurchasePanels} from './SupplierPurchasePanels';
import {supplierPurchaseHistory} from '../lib/supplierPurchases';
import {ContactEditModal} from './ContactEditModal';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {categoryLabel,itemCategories,requiresRecipe,isStockItem,isRecipeOnUse} from '../lib/itemPolicy';
import React, { useState, useMemo } from "react";
import {RecordPagination,useRecordPage} from './RecordPagination';
import {checkCustomerDetails,checkSupplierDetails} from '../lib/contactDetails';
import {Search, Plus, RotateCcw, Flame, Printer, LogOut, Trash2, Download, RefreshCw, MessageCircle, FileText, Upload, FileSpreadsheet} from 'lucide-react';
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
  items: InventoryItem[];
  onAddNewItem: (item: Omit<InventoryItem, "id">) => void|boolean;
  onUpdateItem: (id: string, patch: Partial<InventoryItem>) => void | boolean;
  onDeleteItem: (id: string) => void;
  onNavigateToProduction: () => void;
  onNavigateToInventory: () => void;
  onNavigateToPurchase: () => void;
  onBack: () => void;
}

export const ProductsCatalogScreen: React.FC<ProductsCatalogScreenProps> = ({
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
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<InventoryItem | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);
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
    return items.filter((i) => {
      if (filterCat !== "all" && (i.category==='raw_spice'?'direct_product':i.category) !== filterCat) return false;
      if (
        search.trim() &&
        !i.name.toLowerCase().includes(search.toLowerCase()) &&
        !i.code.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [items, filterCat, search]);

  const getCategoryBadge = (cat:ItemCategory)=>({label:categoryLabel(cat),cls:'bg-[#FDF8EB] text-[#9E7918] border-[#E8D8A8]'});

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
      const patch = itemEditPatch(editingOriginal!, live, {
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
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      {/* هيدر قسم المنتجات والتسعير */}
      <OperationHeader title={<>المنتجات والتسعير</>} description={<>الكتالوج الأساسي للدورة التشغيلية (شراء • إنتاج • بيع)</>} icon={HeaderTag} onBack={onBack}><button
          onClick={handleOpenAddModal}
          className="bg-gradient-to-l from-[#D4AF37] to-[#B38728] text-[#1E1612] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
        >
          <Plus className="w-4 h-4" />
          <span>منتج جديد</span>
        </button></OperationHeader>

      <div className="p-3.5 space-y-3.5">
        {/* كارت الملخص التوضيحي للدورة التشغيلية وزر إضافة منتج */}
        <div className="bg-gradient-to-br from-[#1E1612] via-[#2A1F1A] to-[#17110E] rounded-3xl p-4 text-[#FAF8F4] border border-[#C59B27]/60 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-[#FBF5B7]">
                دليل المنتجات وأسعار البيع والتكلفة
              </h2>
              <p className="text-[10px] text-[#D4AF37] mt-0.5">
                من هنا تُعرّف الأصناف التي تعتمد عليها المشتريات والإنتاج
                والمبيعات
              </p>
            </div>
            <span className="text-xs font-black bg-white/10 border border-[#C59B27]/40 text-[#FBF5B7] px-2.5 py-1 rounded-xl">
              {catalogStats.total} منتج
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5">
              <div className="text-[10px] text-[#D8CBB8]">أصناف مباشرة</div>
              <div className="text-sm font-black text-white mt-0.5">
                {catalogStats.rawAndSpices}{" "}
                <span className="text-[10px] text-[#D4AF37]">صنف</span>
              </div>
            </div>
            <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5">
              <div className="text-[10px] text-[#D8CBB8]">أصناف لها وصفة</div>
              <div className="text-sm font-black text-[#FBF5B7] mt-0.5">
                {catalogStats.blendsAndDrinks}{" "}
                <span className="text-[10px] text-[#D4AF37]">صنف</span>
              </div>
            </div>
            <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5">
              <div className="text-[10px] text-[#D8CBB8]">متوسط هامش الربح</div>
              <div className="text-sm font-black text-emerald-400 mt-0.5">
                {catalogStats.avgMargin}%
              </div>
            </div>
          </div>

          {/* أزرار الربط السريع بالدورة التشغيلية */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              onClick={handleOpenAddModal}
              className="col-span-3 bg-gradient-to-l from-[#C59B27] via-[#D4AF37] to-[#B38728] text-[#1E1612] font-black text-xs py-3 rounded-2xl shadow flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>تعريف وإضافة منتج جديد للنظام</span>
            </button>
            <button
              onClick={onNavigateToPurchase}
              className="bg-white/10 hover:bg-white/15 border border-[#C59B27]/30 text-[#FBF5B7] py-2 rounded-xl text-[10px] font-bold"
            >
              1. شراء خامات &gt;
            </button>
            <button
              onClick={onNavigateToProduction}
              className="bg-white/10 hover:bg-white/15 border border-[#C59B27]/30 text-[#FBF5B7] py-2 rounded-xl text-[10px] font-bold"
            >
              2. الوصفات والإنتاج &gt;
            </button>
            <button
              onClick={onNavigateToInventory}
              className="bg-white/10 hover:bg-white/15 border border-[#C59B27]/30 text-[#FBF5B7] py-2 rounded-xl text-[10px] font-bold"
            >
              3. أرصدة المخزن &gt;
            </button>
          </div>
        </div>

        {/* فلاتر تصنيف المنتجات */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "all", label: `كل المنتجات (${items.length})` },
            ...itemCategories,
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterCat(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 border transition ${
                filterCat === t.id
                  ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
                  : "bg-white text-[#5C4B3E] border-[#E6DEC8]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* شريط البحث */}
        <div className="bg-white rounded-2xl border border-[#E6DEC8] px-3.5 py-2.5 flex items-center gap-2 shadow-sm">
          <Search className="w-4 h-4 text-[#9E7918]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم المنتج أو الكود (مثلاً: برازيلي، توليفة، تركي...)"
            className="w-full text-xs font-bold bg-transparent focus:outline-none text-[#1E1612]"
          />
        </div>

        {/* قائمة بطاقات المنتجات والتسعير */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#7A6855] border border-[#E6DEC8]">
            لا توجد منتجات مسجلة في هذا التصنيف. اضغط (+ تعريف وإضافة منتج جديد)
            للبدء.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((item) => {
              const catInfo = getCategoryBadge(item.category);
              const unitLabel =
                item.baseUnit === "kg"
                  ? "كجم"
                  : item.baseUnit === "liter"
                    ? "لتر"
                    : "كوب/قطعة";
              const profitPerUnit = Number(
                (item.retailPrice - item.costPrice).toFixed(1),
              );
              const marginPct =
                item.retailPrice > 0
                  ? Math.round((profitPerUnit / item.retailPrice) * 100)
                  : 0;
              const price100g =
                item.baseUnit === "kg"
                  ? Math.round(item.retailPrice / 10)
                  : null;
              const price250g =
                item.baseUnit === "kg"
                  ? Math.round(item.retailPrice / 4)
                  : null;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] hover:border-[#C59B27] shadow-sm space-y-2.5 transition"
                >
                  {/* السطر العلوي: الكود، التصنيف، الاسم، وأزرار التعديل والحذف */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center flex-wrap gap-1.5 mb-1">
                        <span className="text-[10px] font-black bg-[#FAF8F4] text-[#7A6855] px-2 py-0.5 rounded border border-[#E6DEC8]">
                          {item.code}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${catInfo.cls}`}
                        >
                          {catInfo.label}
                        </span>
                        {item.roastLevel && item.roastLevel !== "بدون" && (
                          <span className="text-[10px] font-bold bg-[#FAF8F4] text-[#6E5D4F] px-2 py-0.5 rounded border border-[#E6DEC8]">
                            تحميص {item.roastLevel}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-black text-[#1E1612]">
                        {item.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEditItem(item)}
                        className="text-xs font-extrabold text-[#1E1612] bg-[#FDF8EB] border border-[#C59B27] px-2.5 py-1 rounded-xl hover:bg-[#F5EBD0] transition"
                      >
                        تعديل السعر/البيانات
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(`هل تريد حذف المنتج (${item.name})؟`)
                          ) {
                            onDeleteItem(item.id);
                          }
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl border border-red-100"
                        title="حذف المنتج"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* شبكة الأسعار والربحية */}
                  <div className="grid grid-cols-4 gap-1.5 text-center bg-[#FAF8F4] rounded-xl p-2.5 border border-[#EDE6D8]">
                    <div>
                      <div className="text-[10px] text-[#7A6855] font-semibold">
                        التكلفة/{unitLabel}
                      </div>
                      <div className="text-xs font-black text-[#9E7918] mt-0.5">
                        {item.costPrice.toFixed(1)} ج
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855] font-semibold">
                        بيع قطاعي
                      </div>
                      <div className="text-xs font-black text-[#1E1612] mt-0.5">
                        {item.retailPrice} ج
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855] font-semibold">
                        بيع جملة
                      </div>
                      <div className="text-xs font-black text-[#1E1612] mt-0.5">
                        {item.wholesalePrice} ج
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855] font-semibold">
                        ربح الـ {unitLabel}
                      </div>
                      <div className="text-xs font-black text-emerald-700 mt-0.5">
                        +{profitPerUnit} ج ({marginPct}%)
                      </div>
                    </div>
                  </div>

                  {/* أسعار الأوزان السريعة لو المنتج بالكيلو + حالة الوصفة */}
                  <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] pt-0.5">
                    {price100g !== null && price250g !== null ? (
                      <div className="flex items-center gap-2 text-[#6E5D4F] font-bold">
                        <span className="bg-[#FDF8EB] border border-[#E8D8A8] px-2 py-0.5 rounded-lg text-[#9E7918]">
                          100 جم: {price100g} ج.م
                        </span>
                        <span className="bg-[#FDF8EB] border border-[#E8D8A8] px-2 py-0.5 rounded-lg text-[#9E7918]">
                          ثمن (125 جم): {Math.round(item.retailPrice / 8)} ج.م
                        </span>
                        <span className="bg-[#FDF8EB] border border-[#E8D8A8] px-2 py-0.5 rounded-lg text-[#9E7918]">
                          ربع كجم: {price250g} ج.م
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#8C7A6B] font-bold">
                        يُباع بالعدد / الكوب المباشر
                      </span>
                    )}

                    {requiresRecipe(item.category) && (
                      <button
                        onClick={onNavigateToProduction}
                        className="text-[10px] font-black text-[#1E1612] bg-[#FAF8F4] border border-[#C59B27] px-2.5 py-1 rounded-lg flex items-center gap-1"
                      >
                        <Flame className="w-3 h-3 text-[#9E7918]" />
                        <span>
                          {item.recipe && item.recipe.length > 0
                            ? `مكونات الوصفة (${item.recipe.length})`
                            : "ضبط مقادير الوصفة"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* نافذة تعريف وإضافة منتج جديد */}
      {showAddModal && <ItemDefinitionModal items={items} onSave={onAddNewItem} onClose={()=>setShowAddModal(false)}/>}

      {/* نافذة تعديل بيانات وتسعير المنتج */}
      {editingItem && (
        <Modal title={<>تعديل بيانات وتسعير المنتج ( {editingItem.name} )</>}  onClose={()=>setEditingItem(null)} footer={<div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveItemEdits}
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-black py-2.5 rounded-xl text-xs"
              >
                حفظ التعديلات
              </button>
              <button
                onClick={() => setEditingItem(null)}
                className="px-5 py-2.5 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold text-xs"
              >
                إلغاء
              </button>
            </div>}><div>
              <label className="text-xs font-bold text-[#7A6855] block mb-1">
                اسم المنتج
              </label>
              <input
                type="text"
                value={editingItem.name}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, name: e.target.value })
                }
                className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-extrabold"
              />
            </div>
<div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  تصنيف المنتج
                </label>
                <select
                  value={editingItem.category==='raw_spice'?'direct_product':editingItem.category}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: editingItem.category==='raw_spice'&&e.target.value==='direct_product'?'raw_spice':e.target.value as ItemCategory,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-[#FAF8F4]"
                >
                  {itemCategories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  سعر التكلفة (ج.م)
                </label>
                <input
                  type="number"
                  value={editDraft.costPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, costPrice: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-black"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  سعر البيع القطاعي (ج.م)
                </label>
                <input
                  type="number"
                  value={editDraft.retailPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, retailPrice: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-black text-emerald-700"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  سعر البيع الجملة (ج.م)
                </label>
                <input
                  type="number"
                  value={editDraft.wholesalePrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      wholesalePrice: e.target.value,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-black"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  الرصيد الحالي بالمخزن
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={editDraft.stock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, stock: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  حد النواقص
                </label>
                <input
                  type="number"
                  value={editDraft.minStock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, minStock: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>
            </div>
{editError && (
              <p className="text-[11px] font-bold text-red-600">{editError}</p>
            )}</Modal>
      )}
    </div>
  );
};

// ============================================================================
// 1. شاشة المخزن (InventoryScreen) - مع التحكم الكامل (إضافة / تعديل / حذف)
// ============================================================================
interface InventoryScreenProps {
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
      if (
        search.trim() &&
        !i.name.toLowerCase().includes(search.toLowerCase()) &&
        !i.code.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [items, filterCat, search]);

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
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <OperationHeader title={<>المخزن والأصناف</>} description={<>القيمة:  {Math.round(totalInventoryCapital).toLocaleString("ar-EG")} {" "} ج.م</>} icon={HeaderPackage} onBack={onBack}><button
          onClick={() => setShowAddModal(true)}
          className="bg-gradient-to-l from-[#D4AF37] to-[#B38728] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
        >
          <Plus className="w-4 h-4" />
          إضافة
        </button></OperationHeader>

      <div className="p-3.5 space-y-3">
        {/* فلاتر الأقسام المختصرة */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: `الكل (${items.length})` },...itemCategories,
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterCat(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 border transition ${
                filterCat === t.id
                  ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
                  : "bg-white text-[#5C4B3E] border-[#E6DEC8]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-xl border border-[#E6DEC8] px-3 py-2 flex items-center gap-2 shadow-sm">
            <Search className="w-4 h-4 text-[#A68429]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم الصنف أو الكود..."
              className="w-full text-xs font-bold bg-transparent focus:outline-none"
            />
          </div>
          <button
            onClick={onNavigateToProduction}
            className="bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 shrink-0"
          >
            <Flame className="w-4 h-4 text-[#D4AF37]" />
            الإنتاج
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#7A6855] border border-[#E6DEC8]">
            لا توجد أصناف في هذا القسم حالياً. اضغط (+ إضافة) لإضافة صنف جديد.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const isLow =
                isStockItem(item) && item.stock <= item.minStock;
              const unitLabel =
                item.baseUnit === "kg"
                  ? "كجم"
                  : item.baseUnit === "liter"
                    ? "لتر"
                    : "قطعة";

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl p-3 border shadow-sm space-y-2 ${
                    isLow
                      ? "border-amber-500 bg-amber-50/20"
                      : "border-[#E6DEC8]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-[#FAF8F4] text-[#7A6855] px-2 py-0.5 rounded border border-[#E6DEC8]">
                        {item.code}
                      </span>
                      <h3 className="text-sm font-extrabold text-[#1E1612]">
                        {item.name}
                      </h3>
                      {isLow && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                          ناقص
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditItem(item)}
                        className="text-xs font-extrabold text-[#9E7918] bg-[#FDF8EB] border border-[#E8D8A8] px-2.5 py-1 rounded-lg"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `هل تريد حذف الصنف (${item.name}) نهائيًا؟`,
                            )
                          ) {
                            onDeleteItem(item.id);
                          }
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg border border-red-100"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center bg-[#FAF8F4] rounded-xl p-2 border border-[#EDE6D8]">
                    <div>
                      <div className="text-[10px] text-[#7A6855]">الرصيد</div>
                      <div
                        className={`text-xs font-black ${
                          isLow ? "text-red-600" : "text-[#1E1612]"
                        }`}
                      >
                        {isRecipeOnUse(item)
                          ? "وصفة"
                          : `${item.stock} ${unitLabel}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">التكلفة</div>
                      <div className="text-xs font-black text-[#9E7918]">
                        {item.costPrice.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">قطاعي</div>
                      <div className="text-xs font-black text-emerald-700">
                        {item.retailPrice}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">جملة</div>
                      <div className="text-xs font-black text-[#1E1612]">
                        {item.wholesalePrice}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* نافذة تعديل الصنف */}
      {editingItem && (
        <Modal title={<>تعديل الصنف</>}  onClose={()=>setEditingItem(null)} footer={<div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveItemEdits}
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl"
              >
                حفظ
              </button>
              <button
                onClick={() => setEditingItem(null)}
                className="px-5 py-2.5 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold"
              >
                إلغاء
              </button>
            </div>}><div>
              <label className="text-xs font-bold text-[#7A6855] block mb-1">
                اسم الصنف
              </label>
              <input
                type="text"
                value={editingItem.name}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, name: e.target.value })
                }
                className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
              />
            </div>
<div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  القسم
                </label>
                <select
                  value={editingItem.category==='raw_spice'?'direct_product':editingItem.category}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: editingItem.category==='raw_spice'&&e.target.value==='direct_product'?'raw_spice':e.target.value as ItemCategory,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-white"
                >
                  {itemCategories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  الرصيد ({editingItem.baseUnit === "kg" ? "كجم" : "عدد"})
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={editDraft.stock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, stock: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  التكلفة (ج.م)
                </label>
                <input
                  type="number"
                  value={editDraft.costPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, costPrice: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  حد النواقص
                </label>
                <input
                  type="number"
                  value={editDraft.minStock ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, minStock: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  سعر القطاعي
                </label>
                <input
                  type="number"
                  value={editDraft.retailPrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, retailPrice: e.target.value })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  سعر الجملة
                </label>
                <input
                  type="number"
                  value={editDraft.wholesalePrice ?? ""}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      wholesalePrice: e.target.value,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
            </div>
{editError && (
              <p className="text-[11px] font-bold text-red-600">{editError}</p>
            )}</Modal>
      )}

      {/* نافذة إضافة صنف جديد */}
      {showAddModal && <ItemDefinitionModal items={items} onSave={onAddNewItem} onClose={()=>setShowAddModal(false)}/>}
    </div>
  );
};

// ============================================================================
// 2. شاشة النواقص (ShortagesScreen)
// ============================================================================
export const ShortagesScreen: React.FC<{
  items: InventoryItem[];
  onNavigateToPurchase: () => void;
  onNavigateToProduction: () => void;
  onBack: () => void;
}> = ({ items, onNavigateToPurchase, onNavigateToProduction, onBack }) => {
  const lowItems = items.filter(
    (i) => isStockItem(i) && i.stock <= i.minStock,
  );

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <OperationHeader title={<>النواقص ( {lowItems.length} )</>} description={<>الأصناف التي تحتاج توريدًا أو مراجعة رصيدها.</>} icon={HeaderTriangleAlert} onBack={onBack}></OperationHeader>

      <div className="p-3.5 space-y-2.5">
        {lowItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#7A6855] border border-[#E6DEC8]">
            لا توجد نواقص حالياً. جميع الأرصدة فوق الحد الأدنى.
          </div>
        ) : (
          lowItems.map((item) => {
            const cheapest =
              item.supplierPrices.length > 0
                ? item.supplierPrices.reduce(
                    (min, p) => (p.price < min.price ? p : min),
                    item.supplierPrices[0],
                  )
                : null;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-3.5 border border-[#C59B27] shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-[#1E1612]">
                    {item.name}
                  </span>
                  <span className="text-xs font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    المتبقي: {item.stock}{" "}
                    {item.baseUnit === "kg" ? "كجم" : "وحدة"}
                  </span>
                </div>
                <div className="text-xs text-[#7A6855]">
                  حد الطلب: <b>{item.minStock}</b>
                  {cheapest &&
                    ` • أرخص مورد: ${cheapest.supplierName} (${cheapest.price} ج.م)`}
                </div>
                <button
                  onClick={
                    item.category === "manufactured_blend"
                      ? onNavigateToProduction
                      : onNavigateToPurchase
                  }
                  className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] text-xs font-extrabold py-2 rounded-xl"
                >
                  {item.category === "manufactured_blend"
                    ? "تصنيع في الإنتاج"
                    : "شراء من المورد"}
                </button>
              </div>
            );
          })
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
  onBack: () => void;
}> = ({
  mode,
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
  onBack,
}) => {
  const [editingContact,setEditingContact]=useState<Customer|Supplier|null>(null);
  const [payModalTarget, setPayModalTarget] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [statementTargetId, setStatementTargetId] = useState<string | null>(
    null,
  );
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
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <OperationHeader title={<>{mode === "suppliers"
            ? `الموردين (${suppliers.length})`
            : `العملاء (${customers.length})`}</>} description={<>بيانات التواصل وسجل المعاملات والأرصدة.</>} icon={HeaderUsers} onBack={onBack}><button
          onClick={() => setShowAddModal(true)}
          className="bg-[#C59B27] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          إضافة
        </button></OperationHeader>

      <div className="p-3.5 space-y-2.5">
        {mode === "suppliers"
          ? suppliers.map(sup=>{
              const purchases=supplierPurchaseHistory(purchaseInvoices,sup.id);
              return <article key={sup.id} className="bg-white border rounded-2xl p-4 space-y-3">
                <h2 className="font-black">{sup.name}</h2><p>{sup.phone} — {sup.address||'العنوان غير مسجل'}</p><p>المندوب: {sup.representativeName||'غير مسجل'}</p>
                <p>إجمالي الشراء: {purchases.total.toLocaleString('ar-EG')} ج.م — {purchases.purchases.length} فواتير</p>
                <div className="flex gap-3">{onUpdateContact&&<button onClick={()=>setEditingContact(sup)} className="border rounded-xl p-2">تعديل البيانات</button>}<button onClick={()=>onDeleteSupplier(sup.id)} className="text-red-700 p-2">حذف المورد</button></div>
                <SupplierPurchasePanels data={purchases}/>
              </article>;
            })
          : customers.map((cust) => (
              <div
                key={cust.id}
                className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#1E1612]">
                      {cust.name}
                    </div>
                    <div className="text-xs text-[#7A6855]">
                      {cust.type} • {cust.phone}
                    </div>
                    <div className="text-xs text-[#7A6855]">المنطقة: {cust.area || 'غير مسجلة'}</div>
                    {onUpdateContact&&<button className="border rounded-xl p-2 mt-2" onClick={()=>setEditingContact(cust)}>تعديل البيانات</button>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-[10px] text-[#7A6855]">عليه</div>
                      <div
                        className={`text-sm font-black ${
                          cust.balance > 0
                            ? "text-[#B38728]"
                            : "text-emerald-700"
                        }`}
                      >
                        {cust.balance.toLocaleString("ar-EG")} ج.م
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteCustomer(cust.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      title="حذف العميل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#F0EAE0] gap-2">
                  <button
                    onClick={() => setStatementTargetId(cust.id)}
                    className="flex-1 bg-[#FAF8F4] hover:bg-[#FDF8EB] text-[#1E1612] border border-[#DFD7C6] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#9E7918]" />
                    <span>كشف حساب تفصيلي / واتساب</span>
                  </button>
                  {cust.balance > 0 && (
                    <button
                      onClick={() => {
                        setPayModalTarget({
                          id: cust.id,
                          name: cust.name,
                          balance: cust.balance,
                        });
                        setAmountInput(String(cust.balance));
                      }}
                      className="bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0"
                    >
                      تحصيل دفعة
                    </button>
                  )}
                </div>
              </div>
            ))}
      </div>

      {editingContact&&onUpdateContact&&<ContactEditModal target={editingContact} mode={mode} onSave={(id,details)=>onUpdateContact(mode,id,details)} onClose={()=>setEditingContact(null)}/>}
      {/* نافذة كشف الحساب التفصيلي للمورد أو العميل */}
      {activeStatementEntity && (
        <AccountStatementModal
          mode={mode === "suppliers" ? "supplier" : "customer"}
          target={activeStatementEntity}
          purchaseInvoices={purchaseInvoices}
          salesInvoices={salesInvoices}
          accountPayments={accountPayments}
          onRecordPayment={(amt, notes) => {
            if (mode === "suppliers") {
              return onPaySupplier(activeStatementEntity.id, amt, notes);
            } else {
              return onCollectCustomer(activeStatementEntity.id, amt, notes);
            }
          }}
          onDeletePayment={onDeletePayment}
          onClose={() => setStatementTargetId(null)}
        />
      )}

      {payModalTarget && (
        <Modal title={<>{mode === "suppliers" ? "سداد للمورد:" : "تحصيل من العميل:"} {" "}  {payModalTarget.name}</>}  onClose={()=>setPayModalTarget(null)} footer={<div className="flex gap-2">
              <button
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
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl"
              >
                تأكيد
              </button>
              <button
                onClick={() => setPayModalTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold"
              >
                إلغاء
              </button>
            </div>}><div className="text-[11px] font-bold text-[#7A6855]">
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
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                if (payModalError) setPayModalError("");
              }}
              className="w-full border border-[#DFD7C6] rounded-xl px-3.5 py-2.5 text-base font-black text-center"
            />
{payModalError && (
              <p className="text-[11px] font-bold text-red-600 text-center">
                {payModalError}
              </p>
            )}</Modal>
      )}

      {showAddModal && (
        <Modal title={<>{mode === "suppliers" ? "إضافة مورد جديد" : "إضافة عميل جديد"}</>}  onClose={()=>setShowAddModal(false)} footer={<div className="flex gap-2 pt-1">
              <button
                onClick={handleCreate}
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl"
              >
                حفظ
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold"
              >
                إلغاء
              </button>
            </div>}><input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="الاسم باختصار..."
              className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
            />
<input
              type="text"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="رقم التليفون..."
              className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
            />
{mode==='customers' ? <input aria-label="منطقة العميل" value={newArea} onChange={e=>setNewArea(e.target.value)} placeholder="المنطقة" className="w-full border rounded-xl px-3 py-2 text-sm"/> : <>
              <input aria-label="عنوان المورد" value={newAddress} onChange={e=>setNewAddress(e.target.value)} placeholder="العنوان" className="w-full border rounded-xl px-3 py-2 text-sm"/>
              <input aria-label="اسم المندوب" value={newRepresentative} onChange={e=>setNewRepresentative(e.target.value)} placeholder="اسم المندوب" className="w-full border rounded-xl px-3 py-2 text-sm"/>
            </>}
{addModalError && <p role="alert" className="text-red-700 text-xs">{addModalError}</p>}
{mode==='customers'&&<input
              type="number"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              placeholder="الرصيد الافتتاحي (ج.م)"
              className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
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
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <OperationHeader title={<>سجل المبيعات ( {salesInvoices.length} )</>} description={<>فواتير الجملة وأيام الكاشير والسجل السابق.</>} icon={HeaderReceiptText} onBack={onBack}><button
          onClick={() => window.print()}
          aria-label="طباعة الصفحة الحالية"
          title="طباعة الصفحة الحالية"
          className="p-1.5 rounded-xl hover:bg-white/10 text-[#D4AF37]"
        >
          <Printer className="w-5 h-5" />
        </button></OperationHeader>

      <nav aria-label="نوع سجل المبيعات" className="flex gap-2 p-3">{([{id:'wholesale',label:'فواتير الجملة'},{id:'cashier',label:'مبيعات أيام الكاشير'},{id:'legacy',label:'السجل السابق'}] as const).map(t=><button key={t.id} onClick={()=>setHistoryKind(t.id)} className={`border rounded-xl p-2 text-xs ${historyKind===t.id?'bg-[#1E1612] text-white':''}`}>{t.label}</button>)}</nav>
      {historyKind==='cashier'?<CashierDayHistory days={cashierDays}/>:<>
      <div className="p-3.5 space-y-3">
        <input aria-label="بحث في كل الفواتير" placeholder="رقم الفاتورة أو العميل أو التاريخ أو الصنف" value={invoiceSearch} onChange={event=>setInvoiceSearch(event.target.value)} className="w-full rounded-xl border border-[#E6DEC8] p-3 text-sm" />
        <RecordPagination {...invoicePage} />
        {matchingInvoices.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#7A6855] border border-[#E6DEC8]">
            {invoiceSearch.trim() ? 'لا توجد فواتير مطابقة للبحث.' : 'لا توجد فواتير مسجلة حالياً.'}
          </div>
        ) : (
          invoicePage.visible.map((inv) => (
            <div
              key={inv.id}
              className={`bg-white rounded-2xl p-3.5 border shadow-sm space-y-2.5 ${
                inv.isReturned
                  ? "border-red-300 bg-red-50/30 opacity-75"
                  : "border-[#E6DEC8]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold text-[#9E7918]">
                    #{inv.invoiceNumber} • {inv.date}
                  </div>
                  <div className="text-sm font-extrabold text-[#1E1612]">
                    {inv.customerName}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8]">
                    {inv.isReturned
                      ? "مرتجع"
                      : inv.saleType === "wholesale"
                        ? "جملة"
                        : inv.saleType === "cashier_sync"
                          ? "كاشير"
                          : "محل"}
                  </span>
                  <button
                    onClick={() => onDeleteInvoice(inv.id)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded-lg"
                    disabled
                    title="حذف المستند المعتمد معطل؛ استخدم المرتجع"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-[#FAF8F4] rounded-xl p-2 space-y-1 border border-[#EDE6D8] text-xs">
                {inv.items.map((line, idx) => (
                  <div key={idx} className="flex justify-between font-bold">
                    <span>
                      • {line.itemName} ({line.quantity} {line.unitLabel})
                    </span>
                    <span>{line.totalPrice} ج.م</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <div>
                  الإجمالي: <b>{inv.totalAmount} ج.م</b> • الربح:{" "}
                  <b className="text-emerald-700">
                    +{inv.netProfit.toFixed(1)} ج.م
                  </b>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSelectedReceiptInv(inv)}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl font-extrabold flex items-center gap-1"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>طباعة / واتساب</span>
                  </button>
                  {inv.isReturned && inv.returnRefundAmount !== undefined && (
                    <p className="text-xs text-amber-800">
                      مبلغ الاسترداد المسجل:{" "}
                      {inv.returnRefundAmount.toLocaleString("ar-EG")} ج.م
                    </p>
                  )}
                  {!inv.isReturned && (<details><summary className="text-xs p-2">تسوية استثنائية</summary>
                    <button
                      onClick={() => onReturnInvoice(inv.id)}
                      className="text-amber-800 hover:bg-amber-50 px-2 py-1 rounded-lg font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      تسجيل مرتجع استثنائي
                    </button></details>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-3.5"><RecordPagination {...invoicePage} /></div>
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
  initialSubPage?:
    | "menu"
    | "data_control"
    | "expenses"
    | "partners"
    | "cloud";
  onAddExpense: (exp: Omit<Expense, "id">) => void | boolean;
  showDemoTools?: boolean;
  canManageData?:boolean;
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
  showDemoTools = false,
  accountPermissions=[],
  canManageData=true,canEditPartners=false,onSavePartners,
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
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <OperationHeader title={<>النسخ الاحتياطي واسترجاع البيانات</>} description={<>تصدير بيانات المحل واسترجاع نسخة محفوظة.</>} icon={HeaderDatabaseBackup} onBack={onBack}></OperationHeader>

        <div className="p-4 space-y-3.5">
          {/* قسم النسخ الاحتياطي الشامل والاسترجاع وتصدير الإكسيل */}
          <div className="bg-gradient-to-br from-[#1E1612] via-[#2B201A] to-[#1A130F] text-white rounded-3xl p-4 border-2 border-[#C59B27] shadow-md space-y-3">
            <div className="flex items-center gap-2 text-sm font-black text-[#FBF5B7]">
              <Download className="w-5 h-5 text-[#D4AF37]" />
              <span>النسخ الاحتياطي الشامل واسترجاع البيانات</span>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              احفظ نسخة كاملة من بيانات المحل (أصناف، وصفات، فواتير، موردين،
              عملاء، وعمال) على جهازك أو استرجعها في أي وقت بضغطة زر.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onDownloadBackupJson}
                className="bg-[#C59B27] hover:bg-[#D4AF37] text-[#1E1612] font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Download className="w-4 h-4" />
                <span>حفظ نسخة (Backup)</span>
              </button>
              <button
                onClick={onExportFullExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير إكسيل شامل</span>
              </button>
            </div>
            <label className="w-full bg-white/10 hover:bg-white/15 border border-[#C59B27]/50 text-[#FBF5B7] font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition">
              <Upload className="w-4 h-4 text-[#D4AF37]" />
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
            <>
              {/* الخيار 1: تصفير الفواتير والحركات فقط مع بقاء الأصناف والوصفات */}
              <div className="bg-white rounded-3xl p-4 border-2 border-[#C59B27] shadow-sm space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-black text-[#1E1612]">
                  <RotateCcw className="w-5 h-5 text-[#B38728]" />
                  <span>حذف الفواتير والحركات التجريبية فقط</span>
                </div>
                <p className="text-xs text-[#5C4B3E] leading-relaxed">
                  يحذف فواتير البيع والشراء والمصروفات والسجل التجريبي ويصفّر
                  الأرصدة، مع{" "}
                  <b>الإبقاء على أسماء أصناف البن والتوليفات والوصفات</b>{" "}
                  لتعديلها كما تريد.
                </p>
                <button
                  onClick={onClearTransactionsKeepCatalog}
                  className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl text-xs"
                >
                  تصفير الفواتير والأرصدة مع بقاء الأصناف
                </button>
              </div>

              {/* الخيار 2: حذف كل البيانات التجريبية بالكامل والبدء من الصفر */}
              <div className="bg-white rounded-3xl p-4 border-2 border-red-300 shadow-sm space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-black text-red-700">
                  <Trash2 className="w-5 h-5 text-red-600" />
                  <span>
                    حذف كل البيانات التجريبية بالكامل (البدء من الصفر)
                  </span>
                </div>
                <p className="text-xs text-[#5C4B3E] leading-relaxed">
                  يمسح كل الأصناف، التوليفات، الفواتير، الموردين، العملاء،
                  والعمال التجريبيين بالكامل لتبدأ بإدخال بيانات محلك الحقيقية
                  من الصفر.
                </p>
                <button
                  onClick={onClearAllDemoData}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-2.5 rounded-xl text-xs"
                >
                  حذف جميع البيانات التجريبية نهائياً
                </button>
              </div>

              {/* الخيار 3: استعادة البيانات التجريبية */}
              <div className="bg-white rounded-3xl p-4 border border-[#E6DEC8] shadow-sm space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-black text-[#1E1612]">
                  <RefreshCw className="w-5 h-5 text-emerald-700" />
                  <span>استعادة البيانات التجريبية الافتراضية</span>
                </div>
                <p className="text-xs text-[#5C4B3E]">
                  إرجاع أصناف البن والتوليفات والفواتير التجريبية لمعاينة
                  النظام.
                </p>
                <button
                  onClick={onRestoreDefaultDemoData}
                  className="w-full bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-xs"
                >
                  استعادة الداتا التجريبية
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (subPage === "expenses") {
    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <OperationHeader title={<>المصروفات</>} description={<>المصروفات اليومية والشهرية الثابتة.</>} icon={HeaderWallet} onBack={onBack}></OperationHeader>
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-3xl p-4 border border-[#E6DEC8] shadow-sm space-y-3">
            <div className="text-xs font-extrabold text-[#9E7918]">
              + تسجيل مصروف جديد
            </div>
            {onSelectFinancialPartnerId&&<label className="block text-xs font-bold">حساب الشريك المالي للحركة<select aria-label="حساب الشريك المالي للحركة" className="block w-full border rounded-xl p-3 mt-2" value={selectedFinancialPartnerId??''} onChange={e=>onSelectFinancialPartnerId(e.target.value)}><option value="">اختر الحساب المالي</option>{partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
            <input
              type="text"
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              placeholder="بيان المصروف باختصار..."
              className="w-full bg-[#FAF8F4] border border-[#DFD7C6] rounded-xl px-3.5 py-2 text-sm font-bold"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="المبلغ (ج.م)"
                className="bg-[#FAF8F4] border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
              />
              <select
                value={expCategory}
                onChange={(e) =>
                  setExpCategory(e.target.value as Expense["category"])
                }
                className="bg-[#FAF8F4] border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
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
            <label className="block text-xs font-bold">نوع المصروف
              <select aria-label="نوع المصروف" value={expFrequency} onChange={e=>setExpFrequency(e.target.value as NonNullable<Expense['frequency']>)} className="w-full border rounded-xl p-2 mt-1">
                <option value="daily">مصروف يومي</option><option value="monthly_fixed">مصروف شهري ثابت</option>
              </select>
            </label>
            <p className="text-xs text-stone-500">التصنيف الشهري يحفظ نوع المصروف؛ كل عملية صرف تُسجل عند حدوثها.</p>
            <div className="grid grid-cols-3 gap-2">
              {(["درج المحل", "خزنة الشركة", "من جيب الشريك"] as const).map(
                (src) => (
                  <button
                    key={src}
                    onClick={() => setExpPaidFrom(src)}
                    className={`py-2 rounded-xl text-xs font-extrabold border ${
                      expPaidFrom === src
                        ? "bg-[#1E1612] border-[#C59B27] text-[#FBF5B7]"
                        : "bg-[#FAF8F4] border-[#DFD7C6] text-[#5C4B3E]"
                    }`}
                  >
                    {src}
                  </button>
                ),
              )}
            </div>
            <button
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
              className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl text-xs"
            >
              حفظ المصروف
            </button>
            {expenseError && (
              <p role="alert" className="text-red-700 font-bold">
                {expenseError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs">عرض المصروفات
              <select aria-label="تصفية المصروفات" value={expenseFilter} onChange={e=>setExpenseFilter(e.target.value as typeof expenseFilter)} className="w-full border rounded-xl p-2">
                <option value="all">كل المصروفات</option><option value="daily">اليومية</option><option value="monthly_fixed">الشهرية الثابتة</option>
              </select>
            </label>
            {expenses.filter(e=>expenseFilter==='all'||e.frequency===expenseFilter).map((e) => (
              <div
                key={e.id}
                className="bg-white rounded-2xl p-3 border border-[#E6DEC8] shadow-sm flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-extrabold text-[#1E1612]">
                    {e.title}
                    {e.isCancelled ? " — ملغى" : ""}
                  </div>
                  <div className="text-xs text-[#7A6855]">{e.frequency==='monthly_fixed'?'شهري ثابت':e.frequency==='daily'?'يومي':'سجل سابق غير مصنّف'}</div>
                  <div className="text-xs text-[#7A6855]">
                    {e.category} • {e.paidFrom} • {e.partnerName}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-red-600">
                    {e.amount} ج.م
                  </span>
                  <button
                    disabled={e.isCancelled || Boolean(e.sourceInvoiceId) || Boolean(e.sourceEmployeeTransactionId)}
                    title="إلغاء المصروف مع حفظ السجل"
                    onClick={() => onDeleteExpense(e.id)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if(subPage==='partners')return <FinancialPartnersScreen partners={partners} canEdit={canEditPartners&&!!onSavePartners} onSave={onSavePartners??(()=>false)} onBack={onBack} onReports={()=>onNavigate('reports')}/>;

  if (subPage === "cloud") {
    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <OperationHeader title={<>ربط Supabase</>} description={<>إعداد اتصال بيانات المحل.</>} icon={HeaderCloud} onBack={onBack}></OperationHeader>
        <div className="p-4 space-y-3">
          <div className="bg-white rounded-3xl p-4 border border-[#E6DEC8] shadow-sm space-y-3">
            <div>
              <label className="text-xs font-bold text-[#7A6855] block mb-1">
                VITE_SUPABASE_URL
              </label>
              <input
                type="text"
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full bg-[#FAF8F4] border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#7A6855] block mb-1">
                VITE_SUPABASE_ANON_KEY
              </label>
              <input
                type="password"
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="Anon Key..."
                className="w-full bg-[#FAF8F4] border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
              />
            </div>
            <button
              onClick={() => {
                saveSupabaseCredentials(sbUrl, sbKey);
                setSavedCloudMsg(true);
              }}
              className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl text-xs"
            >
              حفظ وتفعيل المزامنة
            </button>
            {savedCloudMsg && (
              <div className="text-xs text-emerald-700 font-bold text-center">
                ✓ تم الحفظ بنجاح
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FAF8F4] text-[#1E1612] pb-6">
      <OperationHeader title={<>حسابي</>} description={<>بيانات حساب الدخول والصلاحيات.</>} icon={HeaderCircleUser} onBack={onBack}></OperationHeader>

      <div className="account-content p-3.5">
        <div className="bg-gradient-to-l from-[#1E1612] via-[#2A1F19] to-[#1E1612] text-white border border-[#C59B27] rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="بُن العجوز"
              className="w-10 h-10 rounded-xl object-cover border border-[#D4AF37]"
            />
            <div>
              <div className="text-sm font-black text-[#FBF5B7]">
                {currentPartner.name}
              </div>
              <div className="text-[11px] text-[#D4AF37]">
                @{currentPartner.username} • {currentPartner.role}
              </div>
            </div>
          </div>
          <span className="bg-[#C59B27]/20 text-[#FBF5B7] border border-[#C59B27] text-xs font-black px-2.5 py-1 rounded-xl">
            حساب دخول
          </span>
        </div>

        <section className="account-access bg-white border border-[#E6DEC8] rounded-2xl p-4 space-y-3" aria-label="صلاحيات حسابك">
          <h2 className="font-black">صلاحيات حسابك</h2>
          <p className="text-xs text-[#7A6855]">الاطلاع على بيانات المحل والحسابات والتقارير.</p>
          <p className="text-xs font-bold">{accountPermissions.length?'الأقسام المسموح لك بالتعديل فيها':'حساب للعرض فقط'}</p>
          <div className="flex flex-wrap gap-2">{accountPermissions.map(label=><span key={label} className="text-xs bg-[#FAF5E9] border border-[#E6DEC8] rounded-xl px-3 py-2">{label}</span>)}</div>
          <p className="text-xs text-[#8C7A6B]">حساب الدخول مستقل عن الشراكة والحصص المالية. يدير المالك الرئيسي المستخدمين والصلاحيات من قسم المستخدمين.</p>
        </section>
        <button type="button" onClick={onLogout} className="account-signout w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-red-50 text-red-700 border border-red-200 font-bold"><LogOut size={18}/>تسجيل الخروج</button>

      </div>
    </div>
  );
};
