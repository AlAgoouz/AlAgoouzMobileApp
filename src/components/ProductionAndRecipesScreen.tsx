import {Modal} from './Modal';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {matchesRecordSearch} from '../lib/recordSearch';
import {RecordTabs} from './RecordTabs';
import {RecordPickerField} from './RecordPickerField';
import {parseLocalizedNumber} from '../lib/cashierRows';
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
  canRunProduction?: boolean;
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
  canRunProduction = true,
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

  const [historyQuery,setHistoryQuery]=useState('');
  const matchingBatches=useMemo(()=>productionBatches.filter(batch=>
    matchesRecordSearch(historyQuery,batch.batchNumber,batch.blendName,batch.date)),[productionBatches,historyQuery]);
  const historyPage=useRecordPage(matchingBatches,historyQuery,20);
  const [reviewOpen,setReviewOpen]=useState(false);

  // الأصناف التي هي توليفات بن مصنعة
  const blendItems = useMemo(
    () => items.filter((i) => i.category === "manufactured_blend"),
    [items],
  );

  // حالة تبويب (أمر إنتاج جديد)
  const [selectedBlendId, setSelectedBlendId] = useState<string>(
    blendItems[0]?.id || "",
  );
  const [produceQuantity, setProduceQuantity] = useState('10');
  const produceQtyKg = parseLocalizedNumber(produceQuantity) ?? 0;
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
    if (!selectedBlend || !canProduceAll) return;
    setReviewOpen(false);
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
    <div className="min-h-screen pb-24">
      {/* الهيدر الموحد بهوية بُن العجوز */}
      <OperationHeader title={<>إنتاج التوليفات</>} description={<>تنفيذ أوامر إنتاج التوليفات الجاهزة وسجل تشغيلاتها فقط.</>} icon={HeaderFlame} onBack={onBack}>{onDefineRecipe&&<button
          onClick={() => {
            setShowNewModal(true);
          }}
          type="button"
        >
          <Plus className="w-4 h-4" />
          جديد
        </button>}</OperationHeader>

      <div className="operation-tab-strip">
        <RecordTabs label="أقسام الإنتاج" value={activeTab}
          tabs={[{id:'produce',label:'إنتاج توليفة'},{id:'history',label:'سجل التشغيلات ('+productionBatches.length+')'}]}
          onChange={tab=>{setActiveTab(tab);setBannerMessage(null);}}/>
        {onOpenRecipes&&<button type="button" onClick={onOpenRecipes} className="record-action"><Layers size={16} aria-hidden="true"/>فتح قسم الوصفات</button>}
      </div>
      <div className="record-workspace">
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
          <div className="production-layout">
            <section className="operation-surface production-form">
              <h2>بيانات التشغيلة</h2>
              <RecordPickerField label="التوليفة المراد إنتاجها" searchLabel="ابحث باسم التوليفة أو الكود"
                options={blendItems.map(blend=>({id:blend.id,title:blend.name,detail:blend.code+' · الرصيد '+blend.stock+' كجم'}))}
                value={selectedBlend?.id??''} onChange={setSelectedBlendId}/>
              {selectedBlend && (
                <dl className="record-facts production-facts">
                  <div><dt>الرصيد الجاهز</dt><dd>{selectedBlend.stock} كجم</dd></div>
                  <div><dt>تكلفة الكيلو</dt><dd>{selectedBlend.costPrice} ج.م</dd></div>
                  <div><dt>بيع قطاعي / جملة</dt><dd>{selectedBlend.retailPrice} / {selectedBlend.wholesalePrice}</dd></div>
                </dl>
              )}
              <label className="invoice-choice">
                كمية الإنتاج بالكيلو
                <input
                  type="text"
                  inputMode="decimal"
                  value={produceQuantity}
                  onChange={event=>setProduceQuantity(event.target.value)}
                  className="operation-input"
                />
              </label>
              <p className="operation-caption">{Math.round(produceQtyKg * 1000).toLocaleString('ar-EG')} جرام</p>
              <div className="production-quantities">
                {[5, 10, 15, 20, 25, 50].map((q) => (
                  <button
                    key={q}
                    onClick={() => setProduceQuantity(String(q))}
                    type="button"
                    aria-pressed={produceQtyKg===q}
                    className="action-button"
                  >
                    {q} كيلو
                  </button>
                ))}
              </div>
            </section>
            <section className="operation-surface production-form">
              <h2>الخامات المطلوبة لـ {produceQtyKg} كجم</h2>
              <dl className="production-estimate"><div><dt>إجمالي التكلفة المقدرة</dt><dd>{totalBatchEstimatedCost.toFixed(2)} ج.م</dd></div></dl>

              <div className="space-y-2.5">
                {productionSimulation.map((sim) => (
                  <div
                    key={sim.ingredientId}
                    className="production-material"
                    data-shortage={!sim.isEnough}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold text-ink-strong">
                        {sim.ingredientName}
                      </div>
                      <div className="text-xs text-ink">
                        في الكيلو الواحد: {sim.perKgQty}{" "}
                        {displayUnit(sim.perKgUnit)}{" "}
                        • المتاح بالمخزن:{" "}
                        <b>
                          {sim.availableInBase.toFixed(2)}{" "}
                          {displayUnit(sim.baseUnit)}
                        </b>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-gold">
                        {sim.invalidUnit
                          ? "⚠️ وحدة الكمية غير متوافقة مع وحدة الصنف"
                          : `مطلوب: ${sim.totalRequiredInBase} كجم (${sim.totalRequiredGrams} جم)`}
                      </div>
                      <div
                        className={`text-xs font-bold ${
                          sim.isEnough ? "text-status-ok" : "text-status-danger"
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

              {canRunProduction && <><input
                type="text"
                value={produceNotes}
                onChange={(e) => setProduceNotes(e.target.value)}
                placeholder="ملاحظات التشغيلة (اختياري - مثلاً: تحميص وطحن لفرع المحل)"
                aria-label="ملاحظات التشغيلة"
                className="operation-input"
              />

              <button
                onClick={()=>setReviewOpen(true)}
                disabled={!canProduceAll}
                type="button"
                className="operation-primary w-full"
              >
                <Flame className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>
                  {canProduceAll
                    ? `مراجعة إنتاج وإضافة ${produceQtyKg} كجم للرصيد`
                    : "الرصيد غير كافٍ لبعض الخامات (راجع النواقص)"}
                </span>
              </button></>}
            </section>
          </div>
        )}

        {canRunProduction&&reviewOpen&&selectedBlend&&<Modal title="مراجعة تشغيلة الإنتاج" description={selectedBlend.name}
          onClose={()=>setReviewOpen(false)}
          footer={<button type="button" className="operation-primary" disabled={!canProduceAll}
            onClick={handleRunProduction}>تأكيد الإنتاج</button>}>
          <dl className="record-facts operation-surface">
            <div><dt>الكمية المضافة</dt><dd>{produceQtyKg} كجم</dd></div>
            <div><dt>التكلفة المقدرة</dt><dd>{totalBatchEstimatedCost.toFixed(2)} ج.م</dd></div>
          </dl>
          <ul className="invoice-review-lines">
            {productionSimulation.map(ingredient=><li key={ingredient.ingredientId}>
              <strong>{ingredient.ingredientName}</strong>
              <span>خصم {ingredient.totalRequiredInBase.toLocaleString('ar-EG',{maximumFractionDigits:6})} {displayUnit(ingredient.baseUnit)}</span>
            </li>)}
          </ul>
          {!canProduceAll&&<p role="alert">الرصيد الحالي لا يكفي لتنفيذ التشغيلة.</p>}
        </Modal>}

        {/* ================= التبويب الثالث: سجل تشغيلات الإنتاج ================= */}
        {activeTab === "history" && (
          <div className="space-y-3">
            <label className="record-search">البحث في سجل التشغيلات
              <input type="search" value={historyQuery} onChange={event=>setHistoryQuery(event.target.value)}
                placeholder="رقم التشغيلة أو التوليفة أو التاريخ" />
            </label>
            <RecordPagination {...historyPage}/>
            {!historyPage.total&&<p className="record-state">{productionBatches.length?'لا توجد تشغيلات مطابقة.':'لا توجد تشغيلات مسجلة.'}</p>}
            <div className="record-grid">
              {historyPage.visible.map((batch) => (
                <article
                  key={batch.id}
                  className="record-card space-y-2.5"
                >
                  <div className="record-heading mb-0">
                    <span className="record-badge" dir="ltr">
                      #{batch.batchNumber} • {batch.date}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-status-ok">
                        +{batch.quantityProducedKg} كجم جاهز
                      </span>
                      {canRunProduction && onDeleteBatch && (
                        <button
                          type="button"
                          onClick={() => onDeleteBatch(batch.id)}
                          className="action-button text-status-danger border-status-danger-line"
                          aria-label={`حذف التشغيلة ${batch.batchNumber}`}
                          title="حذف التشغيلة"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="text-sm font-extrabold text-ink-strong">
                    {batch.blendName}
                  </h3>
                  <div className="text-xs text-ink">
                    تكلفة الكيلو: <b>{batch.unitCostPerKg} ج.م</b> • إجمالي تكلفة
                    التشغيلة: <b>{batch.totalBatchCost.toFixed(2)} ج.م</b>
                  </div>
                  <div className="bg-surface-sunken rounded-md p-2.5 space-y-1 border border-line-subtle">
                    <div className="text-xs font-bold text-ink">
                      الخامات التي تم سحبها من المخزن:
                    </div>
                    {batch.ingredientsConsumed.map((ing, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs text-ink-strong"
                      >
                        <span>• {ing.ingredientName}</span>
                        <span className="font-bold">
                          {ing.displayQuantity} ({ing.cost} ج.م)
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-ink-faint">
                    تم الإنتاج بواسطة: {batch.partnerName}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* نافذة إضافة توليفة جديدة أو مشروب جديد */}
      {showNewModal && <ItemDefinitionModal items={items} reservedCodes={reservedCodes} allowedCategories={['manufactured_blend']} onSaveRecipeDefinition={onDefineRecipe} onSave={()=>false} onClose={()=>setShowNewModal(false)}/>}
    </div>
  );
};
