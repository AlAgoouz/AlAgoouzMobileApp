import {Flame as HeaderFlame} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {productionNeeds} from '../lib/inventory';
import {ItemDefinitionModal} from './ItemDefinitionModal';
import {unitLabel as displayUnit} from '../lib/units';
import React, { useEffect, useState, useMemo } from "react";
import {Flame, Plus, Trash2, CheckCircle2, AlertTriangle, Layers, History, Scale} from 'lucide-react';
import {
  InventoryItem,
  ProductionBatch,
  RecipeProductDefinition,
  UnitType,
} from "../types/erp";

interface ProductionAndRecipesScreenProps {
  onOpenRecipes?:()=>void;
  reservedCodes?:string[];
  onDefineRecipe?:(id:string,name:string,definition:RecipeProductDefinition)=>Promise<void>;
  items: InventoryItem[];
  productionBatches: ProductionBatch[];
  currentPartnerName: string;
  onExecuteProduction: (
    blendId: string,
    quantityKg: number,
    notes: string,
  ) => { ok: boolean; message: string };
  onDeleteBatch?: (id: string) => void;
  onBack: () => void;
}

export const ProductionAndRecipesScreen: React.FC<
  ProductionAndRecipesScreenProps
> = ({
  items,
  productionBatches,
  onExecuteProduction,
  onOpenRecipes,
  reservedCodes=[],
  onDefineRecipe,
  onDeleteBatch,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<"produce" | "history">(
    "produce",
  );

  // الأصناف التي هي توليفات بن مصنعة
  const blendItems = useMemo(
    () => items.filter((i) => i.category === "manufactured_blend"),
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

  const [showNewModal,setShowNewModal]=useState(false);
  useEffect(()=>{if(blendItems.length&&!blendItems.some(b=>b.id===selectedBlendId))setSelectedBlendId(blendItems[0].id);},[blendItems,selectedBlendId]);

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      {/* الهيدر الموحد بهوية بُن العجوز */}
      <OperationHeader title={<>إنتاج التوليفات</>} description={<>تنفيذ أوامر إنتاج التوليفات الجاهزة وسجل تشغيلاتها فقط.</>} icon={HeaderFlame} onBack={onBack}>{onDefineRecipe&&<button
          onClick={() => {
            setShowNewModal(true);
          }}
          className="bg-[#C59B27] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
        >
          <Plus className="w-4 h-4" />
          جديد
        </button>}</OperationHeader>

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
        <button onClick={onOpenRecipes} className="record-action"><Layers size={16}/>فتح قسم الوصفات</button>
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
                        {displayUnit(sim.perKgUnit)}{" "}
                        • المتاح بالمخزن:{" "}
                        <b>
                          {sim.availableInBase.toFixed(2)}{" "}
                          {displayUnit(sim.baseUnit)}
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
      {showNewModal && <ItemDefinitionModal items={items} reservedCodes={reservedCodes} allowedCategories={['manufactured_blend']} onSaveRecipeDefinition={onDefineRecipe} onSave={()=>false} onClose={()=>setShowNewModal(false)}/>}
    </div>
  );
};
