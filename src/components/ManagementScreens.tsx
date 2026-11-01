import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  RotateCcw,
  Clock,
  Wallet,
  Receipt,
  ScanLine,
  Sparkles,
  Shield,
  Flame,
  FolderSync,
  Cloud,
  Printer,
  UserCheck,
  LogOut,
  Trash2,
  Database,
  AlertTriangle,
  Download,
  RefreshCw,
  MessageCircle,
  FileText,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
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
  ShiftRecord,
  ItemCategory,
} from '../types/erp';
import {
  getSupabaseCredentials,
  saveSupabaseCredentials,
} from '../lib/supabaseSync';
import {
  InvoiceReceiptModal,
  AccountStatementModal,
} from './ReceiptAndStatementModals';

// ============================================================================
// 0. شاشة المنتجات والتسعير (ProductsCatalogScreen) - الأساس الذي تعتمد عليه الدورة التشغيلية كلها
// ============================================================================
interface ProductsCatalogScreenProps {
  items: InventoryItem[];
  onAddNewItem: (item: Omit<InventoryItem, 'id'>) => void;
  onUpdateItem: (id: string, patch: Partial<InventoryItem>) => void;
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
  const [filterCat, setFilterCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // حقول تعريف منتج جديد
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCat, setNewCat] = useState<ItemCategory>('raw_bean');
  const [newRoast, setNewRoast] = useState<
    'فاتح' | 'وسط' | 'غامق' | 'إسبريسو' | 'بدون'
  >('وسط');
  const [newUnit, setNewUnit] = useState<'kg' | 'piece' | 'liter'>('kg');
  const [newStock, setNewStock] = useState('0');
  const [newMinStock, setNewMinStock] = useState('5');
  const [newCost, setNewCost] = useState('360');
  const [newRetail, setNewRetail] = useState('480');
  const [newWholesale, setNewWholesale] = useState('425');

  const catalogStats = useMemo(() => {
    const rawAndSpices = items.filter(
      (i) => i.category === 'raw_bean' || i.category === 'raw_spice',
    ).length;
    const blendsAndDrinks = items.filter(
      (i) =>
        i.category === 'manufactured_blend' || i.category === 'drink_recipe',
    ).length;
    const sellable = items.filter((i) => i.retailPrice > 0);
    const avgMargin =
      sellable.length > 0
        ? sellable.reduce(
            (s, i) =>
              s +
              ((i.retailPrice - i.costPrice) / Math.max(1, i.retailPrice)) *
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
      if (filterCat !== 'all' && i.category !== filterCat) return false;
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

  const getCategoryBadge = (cat: ItemCategory) => {
    switch (cat) {
      case 'raw_bean':
        return {
          label: 'حبوب بن خام',
          cls: 'bg-[#FDF8EB] text-[#9E7918] border-[#E8D8A8]',
        };
      case 'manufactured_blend':
        return {
          label: 'توليفة مصنعة',
          cls: 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]',
        };
      case 'raw_spice':
        return {
          label: 'تحويجة وخامات',
          cls: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'drink_recipe':
        return {
          label: 'مشروب كاشير',
          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      default:
        return {
          label: 'بيع مباشر',
          cls: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  const handleOpenAddModal = () => {
    setNewName('');
    setNewCode(`BN-${Math.floor(110 + Math.random() * 880)}`);
    setNewCat('raw_bean');
    setNewRoast('وسط');
    setNewUnit('kg');
    setNewStock('0');
    setNewMinStock('5');
    setNewCost('360');
    setNewRetail('480');
    setNewWholesale('425');
    setShowAddModal(true);
  };

  const handleCreateProduct = () => {
    if (!newName.trim()) return;
    const cost = parseFloat(newCost) || 0;
    const isDrink = newCat === 'drink_recipe';
    const isDirect = newCat === 'direct_product';
    const effectiveUnit = isDrink || isDirect ? 'piece' : newUnit;

    onAddNewItem({
      code: newCode.trim() || `BN-${Math.floor(110 + Math.random() * 880)}`,
      name: newName.trim(),
      category: newCat,
      roastLevel:
        newCat === 'raw_bean' || newCat === 'manufactured_blend'
          ? newRoast
          : 'بدون',
      baseUnit: effectiveUnit,
      stock: isDrink ? 999 : parseFloat(newStock) || 0,
      minStock: isDrink ? 0 : parseFloat(newMinStock) || 0,
      costPrice: cost,
      lastPurchasePrice: cost,
      retailPrice: parseFloat(newRetail) || 0,
      wholesalePrice: parseFloat(newWholesale) || 0,
      canSellDirectly: true,
      hasRecipe: newCat === 'manufactured_blend' || newCat === 'drink_recipe',
      recipe: [],
      supplierPrices: [],
    });
    setShowAddModal(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      {/* هيدر قسم المنتجات والتسعير */}
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <div className="text-center">
          <h1 className="text-base font-black text-[#FBF5B7]">
            المنتجات والتسعير
          </h1>
          <p className="text-[10px] text-[#D4AF37]">
            الكتالوج الأساسي للدورة التشغيلية (شراء • إنتاج • بيع)
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-gradient-to-l from-[#D4AF37] to-[#B38728] text-[#1E1612] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
        >
          <Plus className="w-4 h-4" />
          <span>منتج جديد</span>
        </button>
      </div>

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
              <div className="text-[10px] text-[#D8CBB8]">بن خام وتحويجة</div>
              <div className="text-sm font-black text-white mt-0.5">
                {catalogStats.rawAndSpices}{' '}
                <span className="text-[10px] text-[#D4AF37]">صنف</span>
              </div>
            </div>
            <div className="bg-white/5 border border-[#C59B27]/30 rounded-2xl p-2.5">
              <div className="text-[10px] text-[#D8CBB8]">توليفات ومشروبات</div>
              <div className="text-sm font-black text-[#FBF5B7] mt-0.5">
                {catalogStats.blendsAndDrinks}{' '}
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
            { id: 'all', label: `كل المنتجات (${items.length})` },
            { id: 'raw_bean', label: 'حبوب بن خام' },
            { id: 'manufactured_blend', label: 'توليفات البن' },
            { id: 'raw_spice', label: 'تحويجة وخامات' },
            { id: 'drink_recipe', label: 'مشروبات الكاشير' },
            { id: 'direct_product', label: 'بيع مباشر' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterCat(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 border transition ${
                filterCat === t.id
                  ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]'
                  : 'bg-white text-[#5C4B3E] border-[#E6DEC8]'
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
                item.baseUnit === 'kg'
                  ? 'كجم'
                  : item.baseUnit === 'liter'
                    ? 'لتر'
                    : 'كوب/قطعة';
              const profitPerUnit = Number(
                (item.retailPrice - item.costPrice).toFixed(1),
              );
              const marginPct =
                item.retailPrice > 0
                  ? Math.round((profitPerUnit / item.retailPrice) * 100)
                  : 0;
              const price100g =
                item.baseUnit === 'kg'
                  ? Math.round(item.retailPrice / 10)
                  : null;
              const price250g =
                item.baseUnit === 'kg'
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
                        {item.roastLevel && item.roastLevel !== 'بدون' && (
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
                        onClick={() => setEditingItem(item)}
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

                    {(item.category === 'manufactured_blend' ||
                      item.category === 'drink_recipe') && (
                      <button
                        onClick={onNavigateToProduction}
                        className="text-[10px] font-black text-[#1E1612] bg-[#FAF8F4] border border-[#C59B27] px-2.5 py-1 rounded-lg flex items-center gap-1"
                      >
                        <Flame className="w-3 h-3 text-[#9E7918]" />
                        <span>
                          {item.recipe && item.recipe.length > 0
                            ? `مكونات الوصفة (${item.recipe.length})`
                            : 'ضبط مقادير الوصفة'}
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
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-3.5 shadow-2xl border border-[#C59B27] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-2.5">
              <div>
                <h3 className="text-sm font-black text-[#1E1612]">
                  تعريف وإضافة منتج جديد
                </h3>
                <p className="text-[10px] text-[#8C7A6B]">
                  يظهر فوراً في المشتريات والإنتاج والمخزن ونقطة البيع
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs font-bold text-[#8C7A6B] px-2 py-1 rounded-lg bg-[#FAF8F4]"
              >
                إغلاق
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-black text-[#1E1612] block mb-1">
                  اسم المنتج
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثلاً: بن يمني محمص، توليفة العجوز إكسترا، قهوة بندق..."
                  className="w-full border border-[#DFD7C6] rounded-xl px-3.5 py-2.5 text-xs font-extrabold focus:border-[#C59B27] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-[#7A6855] block mb-1">
                    تصنيف المنتج في الدورة
                  </label>
                  <select
                    value={newCat}
                    onChange={(e) => {
                      const c = e.target.value as ItemCategory;
                      setNewCat(c);
                      if (c === 'drink_recipe' || c === 'direct_product') {
                        setNewUnit('piece');
                      } else {
                        setNewUnit('kg');
                      }
                    }}
                    className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-[#FAF8F4]"
                  >
                    <option value="raw_bean">
                      1. حبوب بن خام (شراء + بيع + إنتاج)
                    </option>
                    <option value="manufactured_blend">
                      2. توليفة بن مصنعة (إنتاج + بيع)
                    </option>
                    <option value="raw_spice">
                      3. تحويجة وخامات (حبهان/لبن/أكواب)
                    </option>
                    <option value="drink_recipe">
                      4. مشروب كاشير بوصفة (بيع بالكوب)
                    </option>
                    <option value="direct_product">
                      5. منتج بيع مباشر بالقطعة
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#7A6855] block mb-1">
                    وحدة القياس الأساسية
                  </label>
                  <select
                    value={newUnit}
                    onChange={(e) =>
                      setNewUnit(e.target.value as 'kg' | 'piece' | 'liter')
                    }
                    className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-[#FAF8F4]"
                  >
                    <option value="kg">
                      كيلو جرام (يُباع بالجرام والكيلو)
                    </option>
                    <option value="piece">قطعة / كوب</option>
                    <option value="liter">لتر / مل</option>
                  </select>
                </div>
              </div>

              {(newCat === 'raw_bean' || newCat === 'manufactured_blend') && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-bold text-[#7A6855] block mb-1">
                      درجة التحميص
                    </label>
                    <select
                      value={newRoast}
                      onChange={(e) =>
                        setNewRoast(
                          e.target.value as
                            | 'فاتح'
                            | 'وسط'
                            | 'غامق'
                            | 'إسبريسو'
                            | 'بدون',
                        )
                      }
                      className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-[#FAF8F4]"
                    >
                      <option value="فاتح">فاتح</option>
                      <option value="وسط">وسط</option>
                      <option value="غامق">غامق</option>
                      <option value="إسبريسو">إسبريسو</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#7A6855] block mb-1">
                      كود الصنف
                    </label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-[#7A6855] block mb-1">
                    سعر التكلفة (ج.م)
                  </label>
                  <input
                    type="number"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="w-full border border-[#DFD7C6] rounded-xl px-2.5 py-2 text-xs font-black text-center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7A6855] block mb-1">
                    بيع قطاعي (ج.م)
                  </label>
                  <input
                    type="number"
                    value={newRetail}
                    onChange={(e) => setNewRetail(e.target.value)}
                    className="w-full border border-[#DFD7C6] rounded-xl px-2.5 py-2 text-xs font-black text-center text-emerald-700"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7A6855] block mb-1">
                    بيع جملة (ج.م)
                  </label>
                  <input
                    type="number"
                    value={newWholesale}
                    onChange={(e) => setNewWholesale(e.target.value)}
                    className="w-full border border-[#DFD7C6] rounded-xl px-2.5 py-2 text-xs font-black text-center"
                  />
                </div>
              </div>

              {newCat !== 'drink_recipe' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-[#7A6855] block mb-1">
                      الرصيد الافتتاحي بالمخزن
                    </label>
                    <input
                      type="number"
                      value={newStock}
                      onChange={(e) => setNewStock(e.target.value)}
                      className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#7A6855] block mb-1">
                      حد تنبيه النواقص
                    </label>
                    <input
                      type="number"
                      value={newMinStock}
                      onChange={(e) => setNewMinStock(e.target.value)}
                      className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreateProduct}
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-black py-3 rounded-xl text-xs shadow"
              >
                حفظ المنتج في الكتالوج
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-5 py-3 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تعديل بيانات وتسعير المنتج */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-3.5 shadow-2xl border border-[#C59B27]">
            <h3 className="text-sm font-black text-[#1E1612]">
              تعديل بيانات وتسعير المنتج ({editingItem.name})
            </h3>
            <div>
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
                  value={editingItem.category}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: e.target.value as ItemCategory,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-[#FAF8F4]"
                >
                  <option value="raw_bean">حبوب بن خام</option>
                  <option value="manufactured_blend">توليفة بن مصنعة</option>
                  <option value="raw_spice">تحويجة وخامات</option>
                  <option value="drink_recipe">مشروب كاشير بوصفة</option>
                  <option value="direct_product">بيع مباشر</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  سعر التكلفة (ج.م)
                </label>
                <input
                  type="number"
                  value={editingItem.costPrice}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      costPrice: parseFloat(e.target.value) || 0,
                    })
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
                  value={editingItem.retailPrice}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      retailPrice: parseFloat(e.target.value) || 0,
                    })
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
                  value={editingItem.wholesalePrice}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      wholesalePrice: parseFloat(e.target.value) || 0,
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
                  value={editingItem.stock}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      stock: parseFloat(e.target.value) || 0,
                    })
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
                  value={editingItem.minStock}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      minStock: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onUpdateItem(editingItem.id, {
                    name: editingItem.name,
                    category: editingItem.category,
                    costPrice: editingItem.costPrice,
                    retailPrice: editingItem.retailPrice,
                    wholesalePrice: editingItem.wholesalePrice,
                    stock: editingItem.stock,
                    minStock: editingItem.minStock,
                  });
                  setEditingItem(null);
                }}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 1. شاشة المخزن (InventoryScreen) - مع التحكم الكامل (إضافة / تعديل / حذف)
// ============================================================================
interface InventoryScreenProps {
  items: InventoryItem[];
  onAddNewItem: (item: Omit<InventoryItem, 'id'>) => void;
  onUpdateItemPricesAndStock: (
    id: string,
    patch: Partial<
      Pick<
        InventoryItem,
        | 'name'
        | 'category'
        | 'stock'
        | 'minStock'
        | 'costPrice'
        | 'retailPrice'
        | 'wholesalePrice'
      >
    >,
  ) => void;
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
  const [filterCat, setFilterCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<ItemCategory>('raw_bean');
  const [newUnit, setNewUnit] = useState<'kg' | 'piece' | 'liter'>('kg');
  const [newStock, setNewStock] = useState('10');
  const [newMinStock, setNewMinStock] = useState('5');
  const [newCost, setNewCost] = useState('350');
  const [newRetail, setNewRetail] = useState('480');
  const [newWholesale, setNewWholesale] = useState('420');

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filterCat !== 'all' && i.category !== filterCat) return false;
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
        .filter((i) => i.category !== 'drink_recipe')
        .reduce((s, i) => s + i.stock * i.costPrice, 0),
    [items],
  );

  const handleCreateItem = () => {
    if (!newName.trim()) return;
    const cost = parseFloat(newCost) || 0;
    onAddNewItem({
      code: `BN-${Math.floor(110 + Math.random() * 880)}`,
      name: newName.trim(),
      category: newCat,
      roastLevel: 'وسط',
      baseUnit: newUnit,
      stock: parseFloat(newStock) || 0,
      minStock: parseFloat(newMinStock) || 0,
      costPrice: cost,
      lastPurchasePrice: cost,
      retailPrice: parseFloat(newRetail) || 0,
      wholesalePrice: parseFloat(newWholesale) || 0,
      canSellDirectly: true,
      hasRecipe: false,
      supplierPrices: [],
    });
    setNewName('');
    setShowAddModal(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <div className="text-center">
          <h1 className="text-base font-extrabold">المخزن والأصناف</h1>
          <p className="text-[11px] text-[#D4AF37]">
            القيمة: {Math.round(totalInventoryCapital).toLocaleString('ar-EG')}{' '}
            ج.م
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-gradient-to-l from-[#D4AF37] to-[#B38728] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
        >
          <Plus className="w-4 h-4" />
          إضافة
        </button>
      </div>

      <div className="p-3.5 space-y-3">
        {/* فلاتر الأقسام المختصرة */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: `الكل (${items.length})` },
            { id: 'raw_bean', label: 'بن خام' },
            { id: 'manufactured_blend', label: 'توليفات' },
            { id: 'raw_spice', label: 'خامات وتحويجة' },
            { id: 'drink_recipe', label: 'مشروبات' },
            { id: 'direct_product', label: 'مباشر' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterCat(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 border transition ${
                filterCat === t.id
                  ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]'
                  : 'bg-white text-[#5C4B3E] border-[#E6DEC8]'
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
                item.category !== 'drink_recipe' && item.stock <= item.minStock;
              const unitLabel =
                item.baseUnit === 'kg'
                  ? 'كجم'
                  : item.baseUnit === 'liter'
                    ? 'لتر'
                    : 'قطعة';

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl p-3 border shadow-sm space-y-2 ${
                    isLow
                      ? 'border-amber-500 bg-amber-50/20'
                      : 'border-[#E6DEC8]'
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
                        onClick={() => setEditingItem(item)}
                        className="text-xs font-extrabold text-[#9E7918] bg-[#FDF8EB] border border-[#E8D8A8] px-2.5 py-1 rounded-lg"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => onDeleteItem(item.id)}
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
                          isLow ? 'text-red-600' : 'text-[#1E1612]'
                        }`}
                      >
                        {item.category === 'drink_recipe'
                          ? 'وصفة'
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-3.5 shadow-2xl border border-[#C59B27]">
            <h3 className="text-sm font-extrabold text-[#1E1612]">
              تعديل الصنف
            </h3>
            <div>
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
                  value={editingItem.category}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: e.target.value as ItemCategory,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-white"
                >
                  <option value="raw_bean">بن خام</option>
                  <option value="manufactured_blend">توليفة مصنعة</option>
                  <option value="raw_spice">خامات وتحويجة</option>
                  <option value="drink_recipe">مشروب بوصفة</option>
                  <option value="direct_product">بيع مباشر</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  الرصيد ({editingItem.baseUnit === 'kg' ? 'كجم' : 'عدد'})
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={editingItem.stock}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      stock: parseFloat(e.target.value) || 0,
                    })
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
                  value={editingItem.costPrice}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      costPrice: parseFloat(e.target.value) || 0,
                    })
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
                  value={editingItem.minStock}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      minStock: parseFloat(e.target.value) || 0,
                    })
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
                  value={editingItem.retailPrice}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      retailPrice: parseFloat(e.target.value) || 0,
                    })
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
                  value={editingItem.wholesalePrice}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      wholesalePrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onUpdateItemPricesAndStock(editingItem.id, {
                    name: editingItem.name,
                    category: editingItem.category,
                    stock: editingItem.stock,
                    minStock: editingItem.minStock,
                    costPrice: editingItem.costPrice,
                    retailPrice: editingItem.retailPrice,
                    wholesalePrice: editingItem.wholesalePrice,
                  });
                  setEditingItem(null);
                }}
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
            </div>
          </div>
        </div>
      )}

      {/* نافذة إضافة صنف جديد */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-3.5 shadow-2xl border border-[#C59B27]">
            <h3 className="text-base font-extrabold text-[#1E1612]">
              إضافة صنف جديد
            </h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم الصنف باختصار (مثلاً: بن يمني، حبهان...)"
              className="w-full border border-[#DFD7C6] rounded-xl px-3.5 py-2.5 text-sm font-bold"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  القسم
                </label>
                <select
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value as ItemCategory)}
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-white"
                >
                  <option value="raw_bean">بن خام</option>
                  <option value="manufactured_blend">توليفة مصنعة</option>
                  <option value="raw_spice">خامات وتحويجة</option>
                  <option value="drink_recipe">مشروب بوصفة</option>
                  <option value="direct_product">بيع مباشر</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  الوحدة
                </label>
                <select
                  value={newUnit}
                  onChange={(e) =>
                    setNewUnit(e.target.value as 'kg' | 'piece' | 'liter')
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-white"
                >
                  <option value="kg">كيلو (كجم)</option>
                  <option value="piece">قطعة / كوب</option>
                  <option value="liter">لتر</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  الرصيد الحالي
                </label>
                <input
                  type="number"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  حد النواقص
                </label>
                <input
                  type="number"
                  value={newMinStock}
                  onChange={(e) => setNewMinStock(e.target.value)}
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  التكلفة
                </label>
                <input
                  type="number"
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  سعر القطاعي
                </label>
                <input
                  type="number"
                  value={newRetail}
                  onChange={(e) => setNewRetail(e.target.value)}
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreateItem}
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl"
              >
                حفظ الصنف
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
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
    (i) => i.category !== 'drink_recipe' && i.stock <= i.minStock,
  );

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <h1 className="text-base font-extrabold">
          النواقص ({lowItems.length})
        </h1>
        <div className="w-8" />
      </div>

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
                    المتبقي: {item.stock}{' '}
                    {item.baseUnit === 'kg' ? 'كجم' : 'وحدة'}
                  </span>
                </div>
                <div className="text-xs text-[#7A6855]">
                  حد الطلب: <b>{item.minStock}</b>
                  {cheapest &&
                    ` • أرخص مورد: ${cheapest.supplierName} (${cheapest.price} ج.م)`}
                </div>
                <button
                  onClick={
                    item.category === 'manufactured_blend'
                      ? onNavigateToProduction
                      : onNavigateToPurchase
                  }
                  className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] text-xs font-extrabold py-2 rounded-xl"
                >
                  {item.category === 'manufactured_blend'
                    ? 'تصنيع في الإنتاج'
                    : 'شراء من المورد'}
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
  mode: 'suppliers' | 'customers';
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
  onAddSupplier: (sup: Omit<Supplier, 'id'>) => void;
  onDeleteSupplier: (id: string) => void;
  onAddCustomer: (cust: Omit<Customer, 'id'>) => void;
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
  onCollectCustomer,
  onDeletePayment,
  onAddSupplier,
  onDeleteSupplier,
  onAddCustomer,
  onDeleteCustomer,
  onBack,
}) => {
  const [payModalTarget, setPayModalTarget] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [statementTargetId, setStatementTargetId] = useState<string | null>(
    null,
  );
  const [amountInput, setAmountInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCatOrType, setNewCatOrType] = useState('');
  const [newBalance, setNewBalance] = useState('0');

  const activeStatementEntity = useMemo(() => {
    if (!statementTargetId) return null;
    if (mode === 'suppliers') {
      return suppliers.find((s) => s.id === statementTargetId) || null;
    }
    return customers.find((c) => c.id === statementTargetId) || null;
  }, [statementTargetId, mode, suppliers, customers]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    if (mode === 'suppliers') {
      onAddSupplier({
        name: newName.trim(),
        phone: newPhone || '-',
        category: newCatOrType || 'مورد بن وخامات',
        balance: parseFloat(newBalance) || 0,
        totalPurchases: 0,
        invoicesCount: 0,
      });
    } else {
      onAddCustomer({
        name: newName.trim(),
        phone: newPhone || '-',
        type: 'جملة - كافيه',
        balance: parseFloat(newBalance) || 0,
        totalSales: 0,
        invoicesCount: 0,
      });
    }
    setNewName('');
    setNewPhone('');
    setNewBalance('0');
    setShowAddModal(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <h1 className="text-base font-extrabold">
          {mode === 'suppliers'
            ? `الموردين (${suppliers.length})`
            : `العملاء (${customers.length})`}
        </h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#C59B27] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          إضافة
        </button>
      </div>

      <div className="p-3.5 space-y-2.5">
        {mode === 'suppliers'
          ? suppliers.map((sup) => (
              <div
                key={sup.id}
                className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#1E1612]">
                      {sup.name}
                    </div>
                    <div className="text-xs text-[#7A6855]">
                      {sup.category} • {sup.phone}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-[10px] text-[#7A6855]">له</div>
                      <div
                        className={`text-sm font-black ${
                          sup.balance > 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {sup.balance.toLocaleString('ar-EG')} ج.م
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteSupplier(sup.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      title="حذف المورد"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#F0EAE0] gap-2">
                  <button
                    onClick={() => setStatementTargetId(sup.id)}
                    className="flex-1 bg-[#FAF8F4] hover:bg-[#FDF8EB] text-[#1E1612] border border-[#DFD7C6] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#9E7918]" />
                    <span>كشف حساب تفصيلي / واتساب</span>
                  </button>
                  {sup.balance > 0 && (
                    <button
                      onClick={() => {
                        setPayModalTarget({
                          id: sup.id,
                          name: sup.name,
                          balance: sup.balance,
                        });
                        setAmountInput(String(sup.balance));
                      }}
                      className="bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0"
                    >
                      سداد دفعة
                    </button>
                  )}
                </div>
              </div>
            ))
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
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-[10px] text-[#7A6855]">عليه</div>
                      <div
                        className={`text-sm font-black ${
                          cust.balance > 0
                            ? 'text-[#B38728]'
                            : 'text-emerald-700'
                        }`}
                      >
                        {cust.balance.toLocaleString('ar-EG')} ج.م
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

      {/* نافذة كشف الحساب التفصيلي للمورد أو العميل */}
      {activeStatementEntity && (
        <AccountStatementModal
          mode={mode === 'suppliers' ? 'supplier' : 'customer'}
          target={activeStatementEntity}
          purchaseInvoices={purchaseInvoices}
          salesInvoices={salesInvoices}
          accountPayments={accountPayments}
          onRecordPayment={(amt, notes) => {
            if (mode === 'suppliers') {
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-[#C59B27]">
            <h3 className="text-sm font-extrabold text-[#1E1612]">
              {mode === 'suppliers' ? 'سداد للمورد:' : 'تحصيل من العميل:'}{' '}
              {payModalTarget.name}
            </h3>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full border border-[#DFD7C6] rounded-xl px-3.5 py-2.5 text-base font-black text-center"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const val = parseFloat(amountInput) || 0;
                  if (val > 0) {
                    if (mode === 'suppliers') {
                      if (!onPaySupplier(payModalTarget.id, val)) return;
                    } else {
                      if (!onCollectCustomer(payModalTarget.id, val)) return;
                    }
                  }
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
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-3 shadow-2xl border border-[#C59B27]">
            <h3 className="text-sm font-extrabold text-[#1E1612]">
              {mode === 'suppliers' ? 'إضافة مورد جديد' : 'إضافة عميل جديد'}
            </h3>
            <input
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
            <input
              type="number"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              placeholder="الرصيد الافتتاحي (ج.م)"
              className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
            />
            <div className="flex gap-2 pt-1">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. شاشة الفواتير والمرتجعات (مع طباعة إيصال وإرسال واتساب وحذف الفاتورة)
// ============================================================================
export const SalesInvoicesAndReturnsScreen: React.FC<{
  salesInvoices: SalesInvoice[];
  customers: Customer[];
  onReturnInvoice: (invoiceId: string) => void;
  onDeleteInvoice: (invoiceId: string) => void;
  onBack: () => void;
}> = ({
  salesInvoices,
  customers,
  onReturnInvoice,
  onDeleteInvoice,
  onBack,
}) => {
  const [selectedReceiptInv, setSelectedReceiptInv] =
    useState<SalesInvoice | null>(null);

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between shadow-md border-b border-[#C59B27]/40 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <h1 className="text-base font-extrabold">
          الفواتير والمرتجعات ({salesInvoices.length})
        </h1>
        <button
          onClick={() => window.print()}
          className="p-1.5 rounded-xl hover:bg-white/10 text-[#D4AF37]"
        >
          <Printer className="w-5 h-5" />
        </button>
      </div>

      <div className="p-3.5 space-y-3">
        {salesInvoices.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#7A6855] border border-[#E6DEC8]">
            لا توجد فواتير مسجلة حالياً.
          </div>
        ) : (
          salesInvoices.map((inv) => (
            <div
              key={inv.id}
              className={`bg-white rounded-2xl p-3.5 border shadow-sm space-y-2.5 ${
                inv.isReturned
                  ? 'border-red-300 bg-red-50/30 opacity-75'
                  : 'border-[#E6DEC8]'
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
                      ? 'مرتجع'
                      : inv.saleType === 'wholesale'
                        ? 'جملة'
                        : inv.saleType === 'cashier_sync'
                          ? 'كاشير'
                          : 'محل'}
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
                  الإجمالي: <b>{inv.totalAmount} ج.م</b> • الربح:{' '}
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
                      مبلغ الاسترداد المسجل:{' '}
                      {inv.returnRefundAmount.toLocaleString('ar-EG')} ج.م
                    </p>
                  )}
                  {!inv.isReturned && (
                    <button
                      onClick={() => onReturnInvoice(inv.id)}
                      className="text-amber-800 hover:bg-amber-50 px-2 py-1 rounded-lg font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      مرتجع
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedReceiptInv && (
        <InvoiceReceiptModal
          invoice={selectedReceiptInv}
          customerPhone={
            customers.find(
              (c) =>
                c.id === selectedReceiptInv.customerId ||
                c.name === selectedReceiptInv.customerName,
            )?.phone || ''
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
  expenses: Expense[];
  partners: Partner[];
  auditLogs: AuditLogEntry[];
  shifts: ShiftRecord[];
  currentPartner: Partner;
  initialSubPage?:
    | 'menu'
    | 'data_control'
    | 'expenses'
    | 'partners'
    | 'shifts'
    | 'cloud';
  onAddExpense: (exp: Omit<Expense, 'id'>) => void;
  onDeleteExpense: (id: string) => void;
  onUpdatePartnerAccount: (
    id: string,
    patch: Partial<Pick<Partner, 'name' | 'username' | 'phone'>>,
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
  shifts,
  currentPartner,
  initialSubPage = 'menu',
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
    'menu' | 'data_control' | 'expenses' | 'partners' | 'shifts' | 'cloud'
  >(initialSubPage);

  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] =
    useState<Expense['category']>('أكياس وتغليف');
  const [expPaidFrom, setExpPaidFrom] =
    useState<Expense['paidFrom']>('درج المحل');

  const creds = getSupabaseCredentials();
  const [sbUrl, setSbUrl] = useState(creds.url);
  const [sbKey, setSbKey] = useState(creds.anonKey);
  const [savedCloudMsg, setSavedCloudMsg] = useState(false);

  // صفحة التحكم في البيانات وحذف الداتا التجريبية
  if (subPage === 'data_control') {
    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between border-b border-[#C59B27]/40">
          <button
            onClick={() => setSubPage('menu')}
            className="p-1.5 text-[#D4AF37]"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <h1 className="text-base font-extrabold">
            التحكم في البيانات وحذف التجريبي
          </h1>
          <div className="w-8" />
        </div>

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
                      'حجم النسخة أكبر من 10 ميجابايت؛ يلزم استرجاعها من أداة الإدارة.',
                    );
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      const parsed = JSON.parse(
                        String(ev.target?.result || '{}'),
                      );
                      if (parsed && typeof parsed === 'object') {
                        onRestoreBackupJson(parsed);
                      }
                    } catch {
                      alert(
                        'الملف غير صالح، يرجى اختيار ملف النسخة الاحتياطية الصحيح.',
                      );
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>

          {/* الخيار 1: تصفير الفواتير والحركات فقط مع بقاء الأصناف والوصفات */}
          <div className="bg-white rounded-3xl p-4 border-2 border-[#C59B27] shadow-sm space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-black text-[#1E1612]">
              <RotateCcw className="w-5 h-5 text-[#B38728]" />
              <span>حذف الفواتير والحركات التجريبية فقط</span>
            </div>
            <p className="text-xs text-[#5C4B3E] leading-relaxed">
              يحذف فواتير البيع والشراء والمصروفات والسجل التجريبي ويصفّر
              الأرصدة، مع{' '}
              <b>الإبقاء على أسماء أصناف البن والتوليفات والوصفات</b> لتعديلها
              كما تريد.
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
              <span>حذف كل البيانات التجريبية بالكامل (البدء من الصفر)</span>
            </div>
            <p className="text-xs text-[#5C4B3E] leading-relaxed">
              يمسح كل الأصناف، التوليفات، الفواتير، الموردين، العملاء، والعمال
              التجريبيين بالكامل لتبدأ بإدخال بيانات محلك الحقيقية من الصفر.
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
              إرجاع أصناف البن والتوليفات والفواتير التجريبية لمعاينة النظام.
            </p>
            <button
              onClick={onRestoreDefaultDemoData}
              className="w-full bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-xs"
            >
              استعادة الداتا التجريبية
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (subPage === 'expenses') {
    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between border-b border-[#C59B27]/40">
          <button
            onClick={() => setSubPage('menu')}
            className="p-1.5 text-[#D4AF37]"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <h1 className="text-base font-extrabold">المصروفات</h1>
          <div className="w-8" />
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-3xl p-4 border border-[#E6DEC8] shadow-sm space-y-3">
            <div className="text-xs font-extrabold text-[#9E7918]">
              + تسجيل مصروف جديد
            </div>
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
                  setExpCategory(e.target.value as Expense['category'])
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
            <div className="grid grid-cols-3 gap-2">
              {(['درج المحل', 'خزنة الشركة', 'من جيب الشريك'] as const).map(
                (src) => (
                  <button
                    key={src}
                    onClick={() => setExpPaidFrom(src)}
                    className={`py-2 rounded-xl text-xs font-extrabold border ${
                      expPaidFrom === src
                        ? 'bg-[#1E1612] border-[#C59B27] text-[#FBF5B7]'
                        : 'bg-[#FAF8F4] border-[#DFD7C6] text-[#5C4B3E]'
                    }`}
                  >
                    {src}
                  </button>
                ),
              )}
            </div>
            <button
              onClick={() => {
                const amt = parseFloat(expAmount);
                if (!expTitle.trim() || !amt) return;
                onAddExpense({
                  date: new Date().toISOString().slice(0, 10),
                  category: expCategory,
                  title: expTitle.trim(),
                  amount: amt,
                  partnerName: currentPartner.name,
                  paidFrom: expPaidFrom,
                });
                setExpTitle('');
                setExpAmount('');
              }}
              className="w-full bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl text-xs"
            >
              حفظ المصروف
            </button>
          </div>

          <div className="space-y-2">
            {expenses.map((e) => (
              <div
                key={e.id}
                className="bg-white rounded-2xl p-3 border border-[#E6DEC8] shadow-sm flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-extrabold text-[#1E1612]">
                    {e.title}
                    {e.isCancelled ? ' — ملغى' : ''}
                  </div>
                  <div className="text-xs text-[#7A6855]">
                    {e.category} • {e.paidFrom} • {e.partnerName}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-red-600">
                    {e.amount} ج.م
                  </span>
                  <button
                    disabled={e.isCancelled || Boolean(e.sourceInvoiceId)}
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

  if (subPage === 'partners') {
    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between border-b border-[#C59B27]/40">
          <button
            onClick={() => setSubPage('menu')}
            className="p-1.5 text-[#D4AF37]"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <h1 className="text-base font-extrabold">حسابات الملاك والشركاء</h1>
          <div className="w-8" />
        </div>
        <div className="p-4 space-y-3.5">
          {partners.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] shadow-sm space-y-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1E1612] border border-[#C59B27] text-[#FBF5B7] font-black flex items-center justify-center">
                  {p.avatarLetter}
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) =>
                      onUpdatePartnerAccount(p.id, { name: e.target.value })
                    }
                    className="bg-transparent text-sm font-extrabold text-[#1E1612] border-b border-dashed border-[#C59B27] focus:outline-none w-full"
                  />
                  <div className="text-[11px] text-[#7A6855]">
                    {p.role} • {p.sharePercent}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#FAF8F4] p-2 rounded-xl border border-[#EDE6D8] text-xs">
                <div>
                  <label className="text-[10px] text-[#7A6855] block">
                    اسم المستخدم:
                  </label>
                  <input
                    type="text"
                    value={p.username}
                    onChange={(e) =>
                      onUpdatePartnerAccount(p.id, { username: e.target.value })
                    }
                    className="w-full bg-white border border-[#DFD7C6] rounded-lg px-2 py-1 font-extrabold"
                  />
                </div>
                <p className="text-xs text-stone-600">
                  كلمات المرور تُدار من الحساب الموثق ولا تُحفظ ضمن بيانات
                  المحل.
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (subPage === 'shifts') {
    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between border-b border-[#C59B27]/40">
          <button
            onClick={() => setSubPage('menu')}
            className="p-1.5 text-[#D4AF37]"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <h1 className="text-base font-extrabold">سجل الورديات</h1>
          <div className="w-8" />
        </div>
        <div className="p-4 space-y-2.5">
          {shifts.map((sh) => (
            <div
              key={sh.id}
              className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] shadow-sm space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-extrabold">{sh.shiftName}</span>
                <span className="text-xs font-bold text-emerald-700">
                  {sh.status}
                </span>
              </div>
              <div className="text-xs text-[#7A6855]">
                الكاشير: {sh.cashierName} • المبيعات: {sh.cashSales} ج.م
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (subPage === 'cloud') {
    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
        <div className="bg-[#1E1612] text-[#FBF5B7] px-4 py-3.5 flex items-center justify-between border-b border-[#C59B27]/40">
          <button
            onClick={() => setSubPage('menu')}
            className="p-1.5 text-[#D4AF37]"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <h1 className="text-base font-extrabold">ربط Supabase</h1>
          <div className="w-8" />
        </div>
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

  const menuItems = [
    {
      id: 'data_control',
      title: 'النسخ الاحتياطي وحذف التجريبي',
      subtitle: 'حفظ/استرجاع نسخة احتياطية • تصفير أو حذف التجريبي',
      icon: Database,
      iconBg: 'bg-red-50 text-red-600 border border-red-200',
      action: () => setSubPage('data_control'),
    },
    {
      id: 'partners',
      title: 'حسابات الملاك والشركاء',
      subtitle: 'تعديل الأسماء وكلمات السر',
      icon: Shield,
      iconBg: 'bg-[#1E1612] text-[#FBF5B7]',
      action: () => setSubPage('partners'),
    },
    {
      id: 'stocktaking',
      title: 'الجرد الفعلي بالميزان',
      subtitle: 'مطابقة الرصيد بالجرام والكيلو',
      icon: ScanLine,
      iconBg: 'bg-[#FDF8EB] text-[#B38728] border border-[#E8D8A8]',
      action: () => onNavigate('stocktaking'),
    },
    {
      id: 'staff_payroll',
      title: 'شؤون العمال والباريستا',
      subtitle: 'اليوميات والسلف والرواتب',
      icon: UserCheck,
      iconBg: 'bg-[#1E1612] text-[#FBF5B7]',
      action: () => onNavigate('staff_payroll'),
    },
    {
      id: 'production',
      title: 'قسم الإنتاج والوصفات',
      subtitle: 'تصنيع التوليفات ووصفات المشروبات',
      icon: Flame,
      iconBg: 'bg-[#FDF8EB] text-[#B38728] border border-[#E8D8A8]',
      action: () => onNavigate('production'),
    },
    {
      id: 'cashier_sync',
      title: 'مزامنة شيت الكاشير',
      subtitle: 'سحب مبيعات الكاشير أوتوماتيك',
      icon: FolderSync,
      iconBg: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      action: () => onNavigate('cashier_sync'),
    },
    {
      id: 'expenses',
      title: 'المصروفات',
      subtitle: 'تسجيل وحذف مصروفات المحل',
      icon: Wallet,
      iconBg: 'bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8]',
      action: () => setSubPage('expenses'),
    },
    {
      id: 'reports',
      title: 'الأرباح وحصص الشركاء',
      subtitle: 'صافي الربح وتوزيع النسب',
      icon: Receipt,
      iconBg: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      action: () => onNavigate('reports'),
    },
    {
      id: 'cloud',
      title: 'ربط Supabase السحابي',
      subtitle: 'مزامنة موبايلات الشركاء',
      icon: Cloud,
      iconBg: 'bg-[#FAF8F4] text-[#5C4B3E] border border-[#DFD7C6]',
      action: () => setSubPage('cloud'),
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      <div className="px-4 py-3.5 flex items-center justify-between sticky top-0 bg-[#1E1612] text-[#FBF5B7] z-30 border-b border-[#C59B27]/40 shadow-md">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl hover:bg-white/10 transition text-[#D4AF37]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <h1 className="text-base font-extrabold">الإدارة والتحكم</h1>
        <div className="w-8" />
      </div>

      <div className="p-3.5 space-y-2.5">
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
            {currentPartner.sharePercent}%
          </span>
        </div>

        {menuItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.action}
              className="w-full bg-white hover:border-[#C59B27] border border-[#E6DEC8] rounded-2xl p-3.5 flex items-center justify-between transition text-right shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg}`}
                >
                  <IconComponent className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-extrabold text-[#1E1612]">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-[#7A6855]">
                    {item.subtitle}
                  </div>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-[#A68429] shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
