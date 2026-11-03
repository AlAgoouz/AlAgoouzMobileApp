import {Flame as HeaderFlame} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {productionNeeds} from '../lib/inventory';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {requiresRecipe} from '../lib/itemPolicy';
import React, { useEffect, useState, useMemo } from "react";
import {
  ChevronRight,
  Flame,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Coffee,
  Layers,
  History,
  Sparkles,
  Scale,
  Save,
} from "lucide-react";
import {
  InventoryItem,
  ProductionBatch,
  RecipeIngredient,
  UnitType,
} from "../types/erp";
import {
  calculateRecipeTotalCost,
  convertToBaseUnit,
  getIngredientCostContribution,
} from "../lib/itemCosts";

interface ProductionAndRecipesScreenProps {
  items: InventoryItem[];
  productionBatches: ProductionBatch[];
  currentPartnerName: string;
  onExecuteProduction: (
    blendId: string,
    quantityKg: number,
    notes: string,
  ) => { ok: boolean; message: string };
  onSaveItemRecipe: (
    targetItemId: string,
    recipe: RecipeIngredient[],
    retailPrice?: number,
    wholesalePrice?: number,
  ) => void | boolean;
  onCreateNewBlendOrDrink: (
    newItem: Omit<InventoryItem, "id">,
  ) => void | boolean;
  onDeleteItem?: (id: string) => void;
  onDeleteBatch?: (id: string) => void;
  onBack: () => void;
}

export const ProductionAndRecipesScreen: React.FC<
  ProductionAndRecipesScreenProps
> = ({
  items,
  productionBatches,
  onExecuteProduction,
  onSaveItemRecipe,
  onCreateNewBlendOrDrink,
  onDeleteItem,
  onDeleteBatch,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<"produce" | "recipes" | "history">(
    "produce",
  );

  // الأصناف التي هي توليفات بن مصنعة
  const blendItems = useMemo(
    () => items.filter((i) => i.category === "manufactured_blend"),
    [items],
  );

  // الخامات التي يمكن سحبها في الوصفات (حبوب بن خام، تحويجة، مستلزمات، أو توليفات تدخل في المشروبات)
  const rawAndBlendIngredients = useMemo(
    () =>
      items.filter(
        (i) =>
          i.category !== "drink_recipe",
      ),
    [items],
  );

  // حالة تبويب (أمر إنتاج جديد)
  const [selectedBlendId, setSelectedBlendId] = useState<string>(
    blendItems[0]?.id || "",
  );
  const [produceQtyKg, setProduceQtyKg] = useState<number>(10);
  const [produceNotes, setProduceNotes] = useState<string>("");
  const [bannerMessage, setBannerMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectedBlend = useMemo(
    () => items.find((i) => i.id === selectedBlendId) || blendItems[0],
    [items, selectedBlendId, blendItems],
  );

  // حساب الخامات المطلوبة لأمر الإنتاج الحالي (آمن ضد وحدات غير متوافقة حتى لا تتعطل الشاشة)
  const productionSimulation = useMemo(()=>{
    if(!selectedBlend)return [];
    try{
      const needs=productionNeeds(selectedBlend,produceQtyKg,items,{checkStock:false});
      return [...needs].map(([id,totalRequiredInBase])=>{
        const rawItem=items.find(i=>i.id===id)!;
        return {ingredientId:id,ingredientName:rawItem.name,perKgQty:totalRequiredInBase/produceQtyKg,perKgUnit:rawItem.baseUnit as UnitType,rawItem,baseUnit:rawItem.baseUnit,totalRequiredInBase,totalRequiredGrams:Math.round(totalRequiredInBase*1000),availableInBase:rawItem.stock,isEnough:rawItem.stock+0.0000001>=totalRequiredInBase,invalidUnit:false,cost:Number((totalRequiredInBase*rawItem.costPrice).toFixed(2))};
      });
    }catch{return [];}
  },[selectedBlend,produceQtyKg,items]);

  const canProduceAll = useMemo(
    () =>
      productionSimulation.length > 0 &&
      productionSimulation.every((s) => s.isEnough),
    [productionSimulation],
  );

  const totalBatchEstimatedCost = useMemo(
    () => productionSimulation.reduce((sum, s) => sum + s.cost, 0),
    [productionSimulation],
  );

  const handleRunProduction = () => {
    if (!selectedBlend) return;
    const res = onExecuteProduction(
      selectedBlend.id,
      produceQtyKg,
      produceNotes,
    );
    setBannerMessage({
      type: res.ok ? "success" : "error",
      text: res.message,
    });
    if (res.ok) {
      setProduceNotes("");
    }
  };

  // ================= حالة تبويب (إدارة وبناء الوصفات) =================
  const [recipeTargetId, setRecipeTargetId] = useState<string>(
    blendItems[0]?.id || "",
  );
  const recipeTargetItem = useMemo(
    () => items.find((i) => i.id === recipeTargetId),
    [items, recipeTargetId],
  );

  const [editingIngredients, setEditingIngredients] = useState<
    RecipeIngredient[]
  >(() => blendItems[0]?.recipe || []);
  const [newIngId, setNewIngId] = useState<string>(
    rawAndBlendIngredients[0]?.id || "",
  );
  const [newIngQty, setNewIngQty] = useState<string>("250");
  const [newIngUnit, setNewIngUnit] = useState<UnitType>("gram");
  const [editRetailPrice, setEditRetailPrice] = useState<string>(() =>
    blendItems[0] ? String(blendItems[0].retailPrice) : "",
  );
  const [editWholesalePrice, setEditWholesalePrice] = useState<string>(() =>
    blendItems[0] ? String(blendItems[0].wholesalePrice) : "",
  );
  const [recipeEditError, setRecipeEditError] = useState("");

  // نافذة إنشاء توليفة أو مشروب جديد
  const [showNewModal, setShowNewModal] = useState(false);
  const handleSelectRecipeTarget = (id: string) => {
    setRecipeTargetId(id);
    const found = items.find((i) => i.id === id);
    if (found) {
      setEditingIngredients(found.recipe ? [...found.recipe] : []);
      setEditRetailPrice(String(found.retailPrice));
      setEditWholesalePrice(String(found.wholesalePrice));
    }
    setRecipeEditError("");
  };

  // مزامنة التحديد مع الكتالوج عند تغيّره (حتى لا يبقى التحديد على صنف محذوف أو لم يُحمّل بعد)
  useEffect(() => {
    if (
      blendItems.length &&
      !blendItems.some((b) => b.id === selectedBlendId)
    ) {
      setSelectedBlendId(blendItems[0].id);
    }
    if (items.length && !items.some((i) => i.id === recipeTargetId)) {
      const first = blendItems[0];
      if (first) {
        setRecipeTargetId(first.id);
        setEditingIngredients(first.recipe ? [...first.recipe] : []);
        setEditRetailPrice(String(first.retailPrice));
        setEditWholesalePrice(String(first.wholesalePrice));
      } else {
        setRecipeTargetId("");
        setEditingIngredients([]);
      }
    }
  }, [items, blendItems, selectedBlendId, recipeTargetId]);

  // وحدات الكمية المسموح بها حسب وحدة الصنف المختار (تمنع جملًا يحوّلها الشريط الصامت لصفر)
  const newIngBaseUnit =
    rawAndBlendIngredients.find((i) => i.id === newIngId)?.baseUnit || "kg";
  const allowedIngUnits: UnitType[] =
    newIngBaseUnit === "piece"
      ? ["piece"]
      : newIngBaseUnit === "liter"
        ? ["ml", "liter"]
        : ["gram", "kg"];

  const ingredientUnitValid = (
    ing: Pick<RecipeIngredient, "quantity" | "unit">,
    baseUnit: "kg" | "piece" | "liter",
  ): boolean => {
    if (!Number.isFinite(ing.quantity) || ing.quantity <= 0) return false;
    try {
      convertToBaseUnit(ing.quantity, ing.unit, baseUnit);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddIngredientToRecipe = () => {
    const raw = items.find((i) => i.id === newIngId);
    const qty = parseFloat(newIngQty);
    if (!raw) {
      setRecipeEditError("اختر مكوّنًا من القائمة أولاً");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setRecipeEditError("أدخل كمية صحيحة أكبر من صفر");
      return;
    }
    if (!allowedIngUnits.includes(newIngUnit)) {
      setRecipeEditError(
        "وحدة الكمية لا تطابق وحدة الصنف؛ اختر وحدة منخفضة تطابق وحدة الصنف",
      );
      return;
    }
    setRecipeEditError("");

    setEditingIngredients((prev) => {
      const existing = prev.find((p) => p.ingredientId === raw.id);
      if (existing) {
        return prev.map((p) =>
          p.ingredientId === raw.id
            ? { ...p, quantity: qty, unit: newIngUnit }
            : p,
        );
      }
      return [
        ...prev,
        {
          ingredientId: raw.id,
          ingredientName: raw.name,
          quantity: qty,
          unit: newIngUnit,
        },
      ];
    });
  };

  const handleRemoveIngredientFromRecipe = (ingId: string) => {
    setEditingIngredients((prev) =>
      prev.filter((p) => p.ingredientId !== ingId),
    );
  };

  // تكلفة حية للوصفة — آمنة ضد وحدات غير متوافقة أو مكوّنات محذوفة (كانت تُعطّل الشاشة كلها)
  const liveRecipeCost = useMemo(() => {
    try {
      return calculateRecipeTotalCost(editingIngredients, items);
    } catch {
      return NaN;
    }
  }, [editingIngredients, items]);

  const fmtCost = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");

  const totalGramsInBlendRecipe = useMemo(
    () =>
      editingIngredients.reduce(
        (sum, ing) =>
          sum +
          (ing.unit === "gram"
            ? ing.quantity
            : ing.unit === "kg"
              ? ing.quantity * 1000
              : 0),
        0,
      ),
    [editingIngredients],
  );

  const handleSaveRecipeChanges = () => {
    if (!recipeTargetItem) return;
    for (const ing of editingIngredients) {
      const raw = items.find((i) => i.id === ing.ingredientId);
      if (!raw) {
        setBannerMessage({
          type: "error",
          text: `مكوّن الوصفة (${ing.ingredientName}) لم يُعثر عليه في الكتالوج؛ احذفه من الوصفة قبل الحفظ`,
        });
        return;
      }
      if (!ingredientUnitValid(ing, raw.baseUnit)) {
        setBannerMessage({
          type: "error",
          text: `مقدار (${ing.ingredientName}) صفر أو وحدته غير متوافقة مع وحدة الصنف (${raw.baseUnit === "kg" ? "كجم" : raw.baseUnit === "liter" ? "لتر" : "قطعة"})؛ صحّحه قبل الحفظ`,
        });
        return;
      }
    }
    const retail = Number(editRetailPrice);
    const wholesale = Number(editWholesalePrice);
    if (
      !editRetailPrice.trim() ||
      !editWholesalePrice.trim() ||
      !Number.isFinite(retail) ||
      retail < 0 ||
      !Number.isFinite(wholesale) ||
      wholesale < 0
    ) {
      setRecipeEditError("أدخل أسعارًا صحيحة غير سالبة قبل حفظ الوصفة");
      return;
    }
    setRecipeEditError("");
    if (
      onSaveItemRecipe(
        recipeTargetItem.id,
        editingIngredients,
        retail,
        wholesale,
      ) === false
    ) {
      setRecipeEditError("لم تُحفظ الوصفة؛ راجع التنبيه وصحّح البيانات");
      return;
    }
    setBannerMessage({
      type: "success",
      text: `تم حفظ وصفة (${recipeTargetItem.name}) وتحديث تكلفتها الآلية إلى ${fmtCost(liveRecipeCost)} ج.م بنجاح!`,
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      {/* الهيدر الموحد بهوية بُن العجوز */}
      <OperationHeader title={<>الإنتاج والوصفات</>} description={<>تجهيز التوليفات ومراجعة وصفات الأصناف.</>} icon={HeaderFlame} onBack={onBack}><button
          onClick={() => {
            setShowNewModal(true);
          }}
          className="bg-[#C59B27] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
        >
          <Plus className="w-4 h-4" />
          جديد
        </button></OperationHeader>

      {/* شريط التبويبات */}
      <div className="p-3 bg-white border-b border-[#E6DEC8] grid grid-cols-3 gap-2 section-tabs sticky top-0 z-20">
        <button
          onClick={() => {
            setActiveTab("produce");
            setBannerMessage(null);
          }}
          className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
            activeTab === "produce"
              ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] shadow"
              : "bg-[#FAF8F4] text-[#5C4B3E] border-[#E6DEC8]"
          }`}
        >
          <Scale className="w-4 h-4 text-[#D4AF37]" />
          إنتاج توليفة
        </button>
        <button
          onClick={() => {
            setActiveTab("recipes");
            setBannerMessage(null);
          }}
          className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
            activeTab === "recipes"
              ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] shadow"
              : "bg-[#FAF8F4] text-[#5C4B3E] border-[#E6DEC8]"
          }`}
        >
          <Layers className="w-4 h-4 text-[#D4AF37]" />
          الوصفات
        </button>
        <button
          onClick={() => {
            setActiveTab("history");
            setBannerMessage(null);
          }}
          className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
            activeTab === "history"
              ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] shadow"
              : "bg-[#FAF8F4] text-[#5C4B3E] border-[#E6DEC8]"
          }`}
        >
          <History className="w-4 h-4 text-[#D4AF37]" />
          السجل ({productionBatches.length})
        </button>
      </div>

      <div className="p-3.5 space-y-4">
        {bannerMessage && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-extrabold ${
              bannerMessage.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-red-50 border-red-300 text-red-800"
            }`}
          >
            {bannerMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
        )}

        {/* ================= التبويب الأول: أمر إنتاج وتخليط توليفة ================= */}
        {activeTab === "produce" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-slate-800">
                  1. اختر التوليفة المراد تصنيعها
                </span>
                <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg">
                  يخصم الخامات ويضيف لرصيد التوليفة
                </span>
              </div>

              <select
                value={selectedBlend?.id || ""}
                onChange={(e) => setSelectedBlendId(e.target.value)}
                className="w-full border-2 border-amber-800/20 rounded-xl px-3.5 py-3 text-sm font-extrabold text-slate-900 bg-amber-50/30 focus:outline-none"
              >
                {blendItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — (الرصيد الجاهز حالياً: {b.stock} كجم)
                  </option>
                ))}
              </select>

              {selectedBlend && (
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="bg-slate-50 rounded-xl p-2 border border-slate-200/70">
                    <div className="text-[11px] text-slate-500">
                      الرصيد الجاهز
                    </div>
                    <div className="text-sm font-black text-slate-800">
                      {selectedBlend.stock} كجم
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2 border border-slate-200/70">
                    <div className="text-[11px] text-slate-500">
                      تكلفة الكيلو
                    </div>
                    <div className="text-sm font-black text-amber-800">
                      {selectedBlend.costPrice} ج.م
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2 border border-slate-200/70">
                    <div className="text-[11px] text-slate-500">
                      بيع قطاعي / جملة
                    </div>
                    <div className="text-sm font-black text-emerald-700">
                      {selectedBlend.retailPrice} /{" "}
                      {selectedBlend.wholesalePrice}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* تحديد الكمية بالكيلو */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
              <div className="text-sm font-extrabold text-slate-800">
                2. كم كيلو تريد تصنيعه وتخليطه الآن؟
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={produceQtyKg}
                  onChange={(e) =>
                    setProduceQtyKg(
                      Math.max(0.5, parseFloat(e.target.value) || 1),
                    )
                  }
                  className="w-28 text-center text-xl font-black text-amber-900 bg-amber-50 border-2 border-amber-400 rounded-2xl py-2.5 focus:outline-none"
                />
                <span className="text-sm font-extrabold text-slate-700">
                  كيلو جرام (
                  {Math.round(produceQtyKg * 1000).toLocaleString("ar-EG")}{" "}
                  جرام)
                </span>
              </div>

              {/* أزرار سريعة للكميات */}
              <div className="flex flex-wrap gap-2 pt-1">
                {[5, 10, 15, 20, 25, 50].map((q) => (
                  <button
                    key={q}
                    onClick={() => setProduceQtyKg(q)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition ${
                      produceQtyKg === q
                        ? "bg-amber-800 text-white border-amber-800"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-amber-50"
                    }`}
                  >
                    {q} كيلو
                  </button>
                ))}
              </div>
            </div>

            {/* جدول الخامات التي سيتم سحبها من المخزن */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between border-b pb-2.5">
                <span className="text-sm font-extrabold text-slate-800">
                  3. الخامات المطلوب سحبها لـ ({produceQtyKg} كجم)
                </span>
                <span className="text-xs font-extrabold text-amber-800">
                  إجمالي التكلفة: {totalBatchEstimatedCost.toFixed(2)} ج.م
                </span>
              </div>

              <div className="space-y-2.5">
                {productionSimulation.map((sim) => (
                  <div
                    key={sim.ingredientId}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      sim.isEnough
                        ? "bg-slate-50/70 border-slate-200"
                        : "bg-red-50 border-red-300"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold text-slate-900">
                        {sim.ingredientName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        في الكيلو الواحد: {sim.perKgQty}{" "}
                        {sim.perKgUnit === "gram"
                          ? "جرام"
                          : sim.perKgUnit === "kg"
                            ? "كجم"
                            : sim.perKgUnit === "ml"
                              ? "مللي"
                              : "قطعة"}{" "}
                        • المتاح بالمخزن:{" "}
                        <b>
                          {sim.availableInBase.toFixed(2)}{" "}
                          {sim.baseUnit === "kg" ? "كجم" : "وحدة"}
                        </b>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-xs font-black text-amber-900">
                        {sim.invalidUnit
                          ? "⚠️ وحدة الكمية غير متوافقة مع وحدة الصنف"
                          : `مطلوب: ${sim.totalRequiredInBase} كجم (${sim.totalRequiredGrams} جم)`}
                      </div>
                      <div
                        className={`text-[11px] font-bold ${
                          sim.isEnough ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {sim.isEnough
                          ? `✓ متاح (${sim.cost} ج.م)`
                          : `⚠️ عجز ${(
                              sim.totalRequiredInBase - sim.availableInBase
                            ).toFixed(2)} كجم`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <input
                type="text"
                value={produceNotes}
                onChange={(e) => setProduceNotes(e.target.value)}
                placeholder="ملاحظات التشغيلة (اختياري - مثلاً: تحميص وطحن لفرع المحل)"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 focus:outline-none"
              />

              <button
                onClick={handleRunProduction}
                disabled={!canProduceAll}
                className="w-full bg-amber-800 hover:bg-amber-900 disabled:bg-slate-300 text-white font-extrabold py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2 transition"
              >
                <Flame className="w-5 h-5" />
                <span>
                  {canProduceAll
                    ? `تنفيذ الإنتاج: سحب الخامات وإضافة ${produceQtyKg} كجم للرصيد`
                    : "الرصيد غير كافٍ لبعض الخامات (راجع النواقص)"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ================= التبويب الثاني: إدارة الوصفات والتكلفة ================= */}
        {activeTab === "recipes" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
              <div className="text-sm font-extrabold text-slate-800">
                اختر توليفة أو مشروبًا بوصفة أو تحويجة لتعديل مكوناته:
              </div>
              <select
                value={recipeTargetId}
                onChange={(e) => handleSelectRecipeTarget(e.target.value)}
                className="w-full border-2 border-blue-600/20 rounded-xl px-3.5 py-3 text-sm font-extrabold text-slate-900 bg-blue-50/30 focus:outline-none"
              >
                <optgroup label="توليفات البن المصنعة (وصفة لكل 1 كيلو)">
                  {items
                    .filter((i) => i.category === "manufactured_blend")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        ☕ {i.name} (تكلفة الكيلو: {i.costPrice} ج.م)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="المشروبات المحضرة (وصفة لكل 1 كوب)">
                  {items
                    .filter((i) => i.category === "drink_recipe")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        🥤 {i.name} (تكلفة الكوب: {i.costPrice} ج.م)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="التحويجات (خصم المكونات عند الاستخدام)">
                  {items
                    .filter(
                      (i) =>
                        i.category === "seasoning_recipe",
                    )
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        📦 {i.name}
                      </option>
                    ))}
                </optgroup>
              </select>

              {recipeTargetItem && (
                <div className="bg-gradient-to-l from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-3.5 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[11px] text-slate-500">
                      تكلفة الوصفة المحسوبة
                    </div>
                    <div className="text-base font-black text-amber-900">
                      {fmtCost(liveRecipeCost)} ج.م
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">
                      ربح القطاعي المتوقع
                    </div>
                    <div className="text-base font-black text-emerald-700">
                      {Number.isFinite(liveRecipeCost)
                        ? (
                            (parseFloat(editRetailPrice) || 0) - liveRecipeCost
                          ).toFixed(2)
                        : "—"}{" "}
                      ج.م
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">
                      {recipeTargetItem.category === "manufactured_blend"
                        ? "مجموع أوزان الوصفة"
                        : "عدد المكونات"}
                    </div>
                    <div className="text-base font-black text-blue-800">
                      {recipeTargetItem.category === "manufactured_blend"
                        ? `${totalGramsInBlendRecipe} جم`
                        : `${editingIngredients.length} مكون`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* المكونات الحالية للوصفة */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-slate-800">
                  مكونات الوصفة ({editingIngredients.length})
                </span>
                <span className="text-xs text-slate-500">
                  {recipeTargetItem?.category === "manufactured_blend"
                    ? "المقادير لإنتاج 1 كيلو (1000 جرام)"
                    : "المقادير لتحضير 1 كوب مشروب"}
                </span>
              </div>

              {editingIngredients.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  لا توجد مكونات مضافة بعد. أضف مكونات الوصفة بالأسفل.
                </div>
              ) : (
                <div className="space-y-2">
                  {editingIngredients.map((ing) => {
                    let costContribution = NaN;
                    try {
                      costContribution = getIngredientCostContribution(
                        ing,
                        items,
                      );
                    } catch {
                      costContribution = NaN;
                    }
                    return (
                      <div
                        key={ing.ingredientId}
                        className={`p-3 rounded-xl border space-y-1 ${
                          Number.isFinite(costContribution)
                            ? "bg-slate-50 border-slate-200 flex items-center justify-between"
                            : "bg-red-50 border-red-300"
                        }`}
                      >
                        {!Number.isFinite(costContribution) && (
                          <div className="text-[11px] font-bold text-red-700">
                            ⚠️ وحدة غير متوافقة مع وحدة الصنف أو المكوّن غير
                            موجود في الكتالوج — صحّح أو احذف هذا السطر قبل الحفظ
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-extrabold text-slate-900">
                              {ing.ingredientName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              الكمية:{" "}
                              <b className="text-blue-700">
                                {ing.quantity}{" "}
                                {ing.unit === "gram"
                                  ? "جرام"
                                  : ing.unit === "kg"
                                    ? "كجم"
                                    : ing.unit === "ml"
                                      ? "مللي"
                                      : "قطعة"}
                              </b>{" "}
                              • التكلفة في الوصفة:{" "}
                              <b className="text-emerald-700">
                                {fmtCost(costContribution)} ج.م
                              </b>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              handleRemoveIngredientFromRecipe(ing.ingredientId)
                            }
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* إضافة مكون جديد للوصفة */}
              <div className="border-t border-slate-200 pt-3 space-y-2.5">
                <div className="text-xs font-extrabold text-slate-700">
                  + إضافة خامة أو بن إلى هذه الوصفة:
                </div>
                <select
                  value={newIngId}
                  onChange={(e) => {
                    setNewIngId(e.target.value);
                    const base =
                      rawAndBlendIngredients.find(
                        (i) => i.id === e.target.value,
                      )?.baseUnit || "kg";
                    setNewIngUnit(
                      base === "piece"
                        ? "piece"
                        : base === "liter"
                          ? "ml"
                          : "gram",
                    );
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                >
                  {rawAndBlendIngredients.map((raw) => (
                    <option key={raw.id} value={raw.id}>
                      {raw.name} (تكلفته: {raw.costPrice} ج.م /{" "}
                      {raw.baseUnit === "kg"
                        ? "كجم"
                        : raw.baseUnit === "liter"
                          ? "لتر"
                          : "قطعة"}
                      )
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newIngQty}
                    onChange={(e) => setNewIngQty(e.target.value)}
                    placeholder="المقدار"
                    className="w-24 border border-slate-300 rounded-xl px-3 py-2 text-xs font-extrabold text-center"
                  />
                  <select
                    value={newIngUnit}
                    onChange={(e) => setNewIngUnit(e.target.value as UnitType)}
                    className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                  >
                    {allowedIngUnits.includes("gram") && (
                      <option value="gram">جرام (جم)</option>
                    )}
                    {allowedIngUnits.includes("kg") && (
                      <option value="kg">كيلو (كجم)</option>
                    )}
                    {allowedIngUnits.includes("ml") && (
                      <option value="ml">مللي (مل)</option>
                    )}
                    {allowedIngUnits.includes("liter") && (
                      <option value="liter">لتر (ل)</option>
                    )}
                    {allowedIngUnits.includes("piece") && (
                      <option value="piece">قطعة / كوب</option>
                    )}
                  </select>
                  <button
                    onClick={handleAddIngredientToRecipe}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold py-2 rounded-xl flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة للمكونات
                  </button>
                </div>
                {recipeEditError && (
                  <p className="text-[11px] font-bold text-red-600">
                    {recipeEditError}
                  </p>
                )}
              </div>

              {/* أسعار البيع وحفظ الوصفة */}
              <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    سعر البيع قطاعي (للكيلو أو الكوب)
                  </label>
                  <input
                    type="number"
                    value={editRetailPrice}
                    onChange={(e) => setEditRetailPrice(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-extrabold text-emerald-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    سعر البيع جملة (للكيلو)
                  </label>
                  <input
                    type="number"
                    value={editWholesalePrice}
                    onChange={(e) => setEditWholesalePrice(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-extrabold text-blue-800"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveRecipeChanges}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl shadow flex items-center justify-center gap-2 text-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ الوصفة ({fmtCost(liveRecipeCost)} ج.م)</span>
                </button>
                {onDeleteItem && recipeTargetItem && (
                  <button
                    onClick={() => onDeleteItem(recipeTargetItem.id)}
                    className="px-3.5 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold text-xs flex items-center gap-1"
                    title="حذف هذا الصنف/الوصفة"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف الصنف
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= التبويب الثالث: سجل تشغيلات الإنتاج ================= */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {productionBatches.map((batch) => (
              <div
                key={batch.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg">
                    #{batch.batchNumber} • {batch.date}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-emerald-700">
                      +{batch.quantityProducedKg} كجم جاهز
                    </span>
                    {onDeleteBatch && (
                      <button
                        onClick={() => onDeleteBatch(batch.id)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                        title="حذف التشغيلة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-sm font-extrabold text-slate-900">
                  {batch.blendName}
                </div>
                <div className="text-xs text-slate-600">
                  تكلفة الكيلو: <b>{batch.unitCostPerKg} ج.م</b> • إجمالي تكلفة
                  التشغيلة: <b>{batch.totalBatchCost.toFixed(2)} ج.م</b>
                </div>
                <div className="bg-slate-50 rounded-xl p-2.5 space-y-1 border border-slate-100">
                  <div className="text-[11px] font-bold text-slate-500">
                    الخامات التي تم سحبها من المخزن:
                  </div>
                  {batch.ingredientsConsumed.map((ing, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[11px] text-slate-700"
                    >
                      <span>• {ing.ingredientName}</span>
                      <span className="font-bold">
                        {ing.displayQuantity} ({ing.cost} ج.م)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-slate-400">
                  تم الإنتاج بواسطة: {batch.partnerName}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* نافذة إضافة توليفة جديدة أو مشروب جديد */}
      {showNewModal && <ItemDefinitionModal items={items} allowedCategories={['manufactured_blend','drink_recipe','seasoning_recipe']} onSave={onCreateNewBlendOrDrink} onClose={()=>setShowNewModal(false)}/>}
    </div>
  );
};
