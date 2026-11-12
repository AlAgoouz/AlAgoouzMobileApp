import {unitLabel as displayUnit} from '../lib/units';
import {Scale as HeaderScale,Users as HeaderUsers} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {Modal} from './Modal';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {isStockItem} from '../lib/itemPolicy';
import React, { useState, useMemo } from "react";
import { payrollBalance, currentPayrollPeriod } from '../lib/payroll';
import {Scale, CheckCircle2, History, Search, Users, Wallet, CalendarCheck, Award, AlertOctagon, Banknote, Check, UserPlus, Trash2} from 'lucide-react';
import {
  InventoryItem,
  StocktakingAuditRecord,
  StocktakingItemVariance,
  Employee,
  EmployeeTransaction,
} from "../types/erp";

// ============================================================================
// 1. شاشة الجرد الفعلي على الميزان وكشف العجز والزيادة (StocktakingScreen)
// ============================================================================
interface StocktakingScreenProps {
  items: InventoryItem[];
  auditRecords: StocktakingAuditRecord[];
  employees: Employee[];
  currentPartnerName: string;
  onCommitStocktaking: (
    variances: StocktakingItemVariance[],
    notes: string,
    chargeShortageToEmployeeId?: string,
  ) => void | boolean;
  onBack: () => void;
}

export const StocktakingScreen: React.FC<StocktakingScreenProps> = ({
  items,
  auditRecords,
  employees,
  currentPartnerName,
  onCommitStocktaking,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<"new_audit" | "history">(
    "new_audit",
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [inputMode, setInputMode] = useState<"kg" | "gram">("kg");
  const [auditNotes, setAuditNotes] = useState<string>("");
  const [chargeEmployeeId, setChargeEmployeeId] = useState<string>("");
  const [savedBanner, setSavedBanner] = useState<string>("");
  const [auditError, setAuditError] = useState("");
  const [reviewOpen,setReviewOpen]=useState(false);

  // الأصناف القابلة للجرد الفعلي (كل الأصناف ما عدا وصفات المشروبات اللحظية)
  const auditableItems = useMemo(
    () => items.filter((i) => isStockItem(i)),
    [items],
  );

  // القيم الفعلية المُدخلة على الميزان: نعتمد فقط ما أدخله المستخدم بنفسه (أرقام صالحة)
  // والأصناف التي لم تُدخل لها قيمة تتبع رصيد الكتالوج الحيّ (مع تغير المخزن لحظيًا)
  const [typedActuals, setTypedActuals] = useState<Record<string, number>>({});
  // النص الخام داخل خانة الإدخال لكل صنف (حتى لا تُؤثر أثناء الكتابة على الملخص)
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});

  const filteredItems = useMemo(() => {
    return auditableItems.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter)
        return false;
      if (
        search.trim() &&
        !i.name.toLowerCase().includes(search.toLowerCase()) &&
        !i.code.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [auditableItems, categoryFilter, search]);

  const allVariances: StocktakingItemVariance[] = useMemo(() => {
    return auditableItems.map((item) => {
      const typed = typedActuals[item.id];
      const actual =
        typed !== undefined && Number.isFinite(typed) ? typed : item.stock;
      const diff = Number((actual - item.stock).toFixed(3));
      const finDiff = Number((diff * item.costPrice).toFixed(2));
      return {
        itemId: item.id,
        itemName: item.name,
        baseUnit: item.baseUnit,
        systemStock: item.stock,
        actualStock: actual,
        difference: diff,
        unitCost: item.costPrice,
        financialDifference: finDiff,
      };
    });
  }, [auditableItems, typedActuals]);

  const changedVariances = useMemo(
    () => allVariances.filter((v) => Math.abs(v.difference) > 0.0001),
    [allVariances],
  );

  const reviewPage=useRecordPage(changedVariances,reviewOpen,20);
  const summary = useMemo(() => {
    let totalShortage = 0;
    let totalSurplus = 0;
    let shortageCount = 0;
    let surplusCount = 0;

    for (const v of allVariances) {
      if (v.difference < -0.0001) {
        totalShortage += Math.abs(v.financialDifference);
        shortageCount++;
      } else if (v.difference > 0.0001) {
        totalSurplus += v.financialDifference;
        surplusCount++;
      }
    }

    return {
      totalShortage: Number(totalShortage.toFixed(2)),
      totalSurplus: Number(totalSurplus.toFixed(2)),
      netVariance: Number((totalSurplus - totalShortage).toFixed(2)),
      shortageCount,
      surplusCount,
      matchingCount: auditableItems.length - shortageCount - surplusCount - allVariances.filter(v=>v.actualStock<0).length,
    };
  }, [allVariances, auditableItems.length]);

  const handleUpdateActual = (item: InventoryItem, rawVal: string) => {
    // نحفظ النص الخام للعرض، ونُحدّث الرصيد الفعلي فقط بقيمة صالحة
    // (إدخال فارغ أو غير صحيح لا يصفّر الرصيد؛ يبقى آخر قيمة سليمة)
    setRawInputs((prev) => ({ ...prev, [item.id]: rawVal }));
    const num = parseFloat(rawVal);
    if (!Number.isFinite(num) || num < 0) return;
    const inBase =
      item.baseUnit === "kg" && inputMode === "gram"
        ? Number((num / 1000).toFixed(3))
        : Number(num.toFixed(3));
    setTypedActuals((prev) => ({ ...prev, [item.id]: inBase }));
  };

  const changeInputMode = (mode: "kg" | "gram") => {
    setInputMode(mode);
    // إعادة عرض القيم بوحدة الإدخال الجديدة (الأرصدة محفوظة بالوحدة الأساسية)
    setRawInputs({});
  };

  const handleSaveAudit = () => {
    setAuditError("");
    if (auditableItems.some(item=>item.stock<0 && typedActuals[item.id]===undefined)) {
      setAuditError('أدخل الرصيد الفعلي لكل صنف رصيده بالسالب قبل اعتماد الجرد؛ لا يمكن افتراض أن العجز يساوي صفرًا.');
      return;
    }
    if (
      Object.values(rawInputs).some(
        (value) =>
          !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0,
      )
    ) {
      setAuditError(
        "أكمل كميات الجرد بأرقام صحيحة غير سالبة؛ الإدخال الفارغ لا يعني صفرًا.",
      );
      return;
    }
    if (!reviewOpen) {
      setReviewOpen(true);
      return;
    }
    const accepted = onCommitStocktaking(
      allVariances,
      auditNotes || "جرد فعلي للمخزن والفرع على الميزان",
      chargeEmployeeId || undefined,
    );
    if (accepted === false) {
      setAuditError("لم يُعتمد الجرد؛ راجع التنبيه وأعد المحاولة.");
      return;
    }
    setReviewOpen(false);
    setSavedBanner(
      `✓ تم اعتماد محضر الجرد وتحديث الأرصدة الفعلية في المخزن بنجاح (بواسطة: ${currentPartnerName})`,
    );
    setAuditNotes("");
    setChargeEmployeeId("");
    setTypedActuals({});
    setRawInputs({});
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-36">
      {/* الهيدر */}
      <OperationHeader title={<>الجرد الفعلي على الميزان وكشف العجز</>} description={<>مقارنة أرصدة السيستم بالوزن الفعلي بالجرام والكيلو والعدد</>} icon={HeaderScale} onBack={onBack}></OperationHeader>
      {reviewOpen&&<Modal wide title="مراجعة واعتماد الجرد" onClose={()=>{setReviewOpen(false);setAuditError('');}}
        footer={<button type="button" className="operation-primary" onClick={handleSaveAudit}>تأكيد الجرد وتحديث المخزون</button>}>
        {auditError&&<p role="alert" className="text-red-700">{auditError}</p>}
        <p>العجز {summary.totalShortage.toLocaleString('ar-EG')} ج.م · الزيادة {summary.totalSurplus.toLocaleString('ar-EG')} ج.م</p>
        <RecordPagination {...reviewPage}/>
        {reviewPage.visible.length ? <ul className="record-grid">
          {reviewPage.visible.map(line=><li key={line.itemId} className="record-card">
            <h3>{line.itemName}</h3>
            <p>المسجل {line.systemStock} · الفعلي {line.actualStock} {displayUnit(line.baseUnit)}</p>
            <p className={line.difference<0?'text-red-700':undefined}>الفرق {line.difference>0?'+':''}{line.difference} {displayUnit(line.baseUnit)}</p>
          </li>)}
        </ul> : <p>الأرصدة الفعلية مطابقة للمسجل.</p>}
      </Modal>}


      {/* تبويبات الجرد */}
      <div className="p-3 bg-white border-b border-[#E6DEC8] grid grid-cols-2 gap-2 section-tabs sticky top-0 z-20">
        <button
          onClick={() => setActiveTab("new_audit")}
          className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
            activeTab === "new_audit"
              ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
              : "bg-[#FAF8F4] text-[#5C4B3E] border-[#E6DEC8]"
          }`}
        >
          <Scale className="w-4 h-4 text-[#D4AF37]" />
          إجراء جرد فعلي الآن
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
            activeTab === "history"
              ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
              : "bg-[#FAF8F4] text-[#5C4B3E] border-[#E6DEC8]"
          }`}
        >
          <History className="w-4 h-4 text-[#D4AF37]" />
          سجل محاضر الجرد ({auditRecords.length})
        </button>
      </div>

      <div className="p-3.5 space-y-4">
        {!reviewOpen && auditError && (
          <p role="alert" className="text-red-700 font-bold">
            {auditError}
          </p>
        )}
        {savedBanner && (
          <div className="bg-emerald-50 border-2 border-emerald-400 text-emerald-900 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-extrabold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{savedBanner}</span>
          </div>
        )}

        {activeTab === "new_audit" && (
          <>
            {/* كارت ملخص فروقات الجرد اللحظي */}
            <div className="rounded-3xl bg-gradient-to-br from-[#1E1612] via-[#2B201A] to-[#1A130F] text-white p-4 shadow-lg border-2 border-[#C59B27] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#D4AF37]">
                  نتيجة مطابقة الميزان مع رصيد السيستم
                </span>
                <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
                  <button
                    onClick={() => changeInputMode("kg")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${
                      inputMode === "kg"
                        ? "bg-[#C59B27] text-[#1E1612]"
                        : "text-stone-300"
                    }`}
                  >
                    إدخال بالكيلو (كجم)
                  </button>
                  <button
                    onClick={() => changeInputMode("gram")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${
                      inputMode === "gram"
                        ? "bg-[#C59B27] text-[#1E1612]"
                        : "text-stone-300"
                    }`}
                  >
                    إدخال بالجرام (جم)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
                  <div className="text-[10px] text-emerald-300">
                    أصناف مطابقة
                  </div>
                  <div className="text-base font-black text-white mt-0.5">
                    {summary.matchingCount} صنف
                  </div>
                </div>

                <div className="bg-red-500/15 border border-red-400/30 rounded-2xl p-2.5">
                  <div className="text-[10px] text-red-300">
                    إجمالي العجز ({summary.shortageCount} صنف)
                  </div>
                  <div className="text-base font-black text-red-400 mt-0.5">
                    -{summary.totalShortage} ج.م
                  </div>
                </div>

                <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-2xl p-2.5">
                  <div className="text-[10px] text-emerald-300">
                    إجمالي الزيادة ({summary.surplusCount} صنف)
                  </div>
                  <div className="text-base font-black text-emerald-400 mt-0.5">
                    +{summary.totalSurplus} ج.م
                  </div>
                </div>
              </div>
            </div>

            {/* فلاتر الأقسام والبحث */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { id: "all", label: "كل المخزن" },
                { id: "manufactured_blend", label: "☕ التوليفات الجاهزة" },
                { id: "raw_bean", label: "🫘 حبوب البن الخام" },
                { id: "raw_spice", label: "🌿 التحويجة واللبن والأكواب" },
                { id: "direct_product", label: "💧 المياه والمعلبات" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 border transition ${
                    categoryFilter === cat.id
                      ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
                      : "bg-white text-[#5C4B3E] border-[#E6DEC8]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-[#E6DEC8] px-3.5 py-2 flex items-center gap-2 shadow-sm">
              <Search className="w-4 h-4 text-[#A68429]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن صنف لجرده على الميزان..."
                className="w-full text-xs font-bold bg-transparent focus:outline-none"
              />
            </div>

            {/* قائمة الأصناف وإدخال الوزن الفعلي */}
            <div className="space-y-2.5">
              {filteredItems.map((item) => {
                const typed = typedActuals[item.id];
                const needsActual = item.stock < 0 && typed === undefined;
                const actualInBase =
                  typed !== undefined && Number.isFinite(typed)
                    ? typed
                    : item.stock;
                const diffInBase = Number(
                  (actualInBase - item.stock).toFixed(3),
                );
                const diffInGrams = Math.round(diffInBase * 1000);
                const finDiff = Number(
                  (diffInBase * item.costPrice).toFixed(2),
                );
                const isKg = item.baseUnit === "kg";

                const rawInput = rawInputs[item.id];
                const displayInputValue =
                  rawInput !== undefined
                    ? rawInput
                    : needsActual ? ''
                    : isKg && inputMode === "gram"
                      ? Math.round(actualInBase * 1000)
                      : actualInBase;

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl p-3.5 border shadow-sm space-y-2.5 ${
                      diffInBase < -0.0001
                        ? "border-red-400 bg-red-50/20"
                        : diffInBase > 0.0001
                          ? "border-emerald-400 bg-emerald-50/20"
                          : "border-[#E6DEC8]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold bg-[#FAF8F4] text-[#7A6855] px-2 py-0.5 rounded border border-[#E6DEC8]">
                          {item.code}
                        </span>
                        <h3 className="text-sm font-extrabold text-[#1E1612] mt-1">
                          {item.name}
                        </h3>
                      </div>

                      {/* بادج حالة المطابقة أو العجز */}
                      {needsActual ? <span className="text-[11px] font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-xl">بانتظار العد الفعلي</span> : Math.abs(diffInBase) < 0.0001 ? (
                        <span className="text-[11px] font-extrabold bg-[#FDF8EB] text-[#9E7918] border border-[#E8D8A8] px-2.5 py-1 rounded-xl shrink-0">
                          ✓ مطابق للميزان
                        </span>
                      ) : diffInBase < 0 ? (
                        <span className="text-[11px] font-black bg-red-100 text-red-700 px-2.5 py-1 rounded-xl shrink-0">
                          ⚠️ عجز{" "}
                          {isKg
                            ? `${Math.abs(diffInGrams)} جم (${Math.abs(
                                diffInBase,
                              )} كجم)`
                            : `${Math.abs(diffInBase)} وحدة`}{" "}
                          ({finDiff} ج.م)
                        </span>
                      ) : (
                        <span className="text-[11px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-xl shrink-0">
                          + زيادة{" "}
                          {isKg ? `${diffInGrams} جم` : `${diffInBase} وحدة`} (+
                          {finDiff} ج.م)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-center bg-[#FAF8F4] p-2.5 rounded-xl border border-[#EDE6D8]">
                      <div>
                        <div className="text-[10px] text-[#7A6855]">
                          الرصيد المفترض بالسيستم:
                        </div>
                        <div className="text-xs font-black text-[#1E1612]">
                          {item.stock}{" "}
                          {isKg
                            ? `كجم (${Math.round(item.stock * 1000)} جم)`
                            : displayUnit(item.baseUnit)}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-extrabold text-[#9E7918] block mb-1">
                          الوزن/العدد الفعلي على الميزان (
                          {isKg
                            ? inputMode === "gram"
                              ? "بالجرام"
                              : "بالكيلو"
                            : item.baseUnit === "liter"
                              ? "باللتر"
                              : "بالعدد"}
                          ):
                        </label>
                        <input
                          type="number"
                          step={isKg && inputMode === "kg" ? "0.05" : "1"}
                          aria-label={`الرصيد الفعلي: ${item.name}`}
                          value={displayInputValue}
                          onChange={(e) =>
                            handleUpdateActual(item, e.target.value)
                          }
                          className="w-full bg-white border-2 border-[#C59B27] rounded-xl px-3 py-1.5 text-sm font-black text-center text-[#1E1612] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* خيار تحميل العجز على عامل / ملاحظات الجرد */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-3">
              <div className="text-xs font-extrabold text-[#1E1612]">
                إعدادات تسوية محضر الجرد:
              </div>

              {summary.totalShortage > 0 && (
                <div className="bg-red-50/70 border border-red-200 rounded-xl p-3 space-y-2">
                  <label className="text-xs font-extrabold text-red-800 block">
                    هل تريد تحميل قيمة العجز ({summary.totalShortage} ج.م) كخصم
                    على أحد العمال؟ (اختياري)
                  </label>
                  <select
                    value={chargeEmployeeId}
                    onChange={(e) => setChargeEmployeeId(e.target.value)}
                    className="w-full bg-white border border-red-300 rounded-xl px-3 py-2 text-xs font-bold text-[#1E1612]"
                  >
                    <option value="">
                      لا — تسجيل العجز كفقد/هدر طحن طبيعي بالمخزن
                    </option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        تحميل العجز على: {emp.name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <input
                type="text"
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                placeholder="ملاحظات محضر الجرد (مثلاً: جرد نهاية الأسبوع للفرع والمخزن)..."
                className="w-full bg-[#FAF8F4] border border-[#DFD7C6] rounded-xl px-3.5 py-2 text-xs font-bold"
              />
            </div>
          </>
        )}

        {/* سجل محاضر الجرد السابقة */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {auditRecords.map((rec) => (
              <div
                key={rec.id}
                className="bg-white rounded-2xl p-4 border border-[#E6DEC8] shadow-sm space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#9E7918] bg-[#FDF8EB] px-2.5 py-1 rounded-lg border border-[#E8D8A8]">
                    #{rec.auditNumber} • {rec.date}
                  </span>
                  <span
                    className={`text-xs font-black ${
                      rec.netVarianceValue < 0
                        ? "text-red-600"
                        : "text-emerald-700"
                    }`}
                  >
                    صافي الفروقات: {rec.netVarianceValue} ج.م
                  </span>
                </div>
                <div className="text-xs font-bold text-[#1E1612]">
                  {rec.notes} — (قام بالجرد: {rec.partnerName})
                </div>
                <div className="bg-[#FAF8F4] rounded-xl p-2.5 space-y-1 border border-[#EDE6D8] text-[11px]">
                  {rec.itemsAudited.map((v, i) => (
                    <div key={i} className="flex justify-between">
                      <span>• {v.itemName}</span>
                      <span
                        className={
                          v.difference < 0
                            ? "text-red-600 font-bold"
                            : "text-emerald-700 font-bold"
                        }
                      >
                        السيستم: {v.systemStock} | الفعلي: {v.actualStock} (
                        {v.difference} {displayUnit(v.baseUnit)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* شريط الاعتماد السفلي فوق شريط القوائم المثبت */}
      {activeTab === "new_audit" && (
        <div className="workspace-actions fixed left-0 right-0 bg-white border-t border-[#E6DEC8] p-3 flex items-center gap-2.5 z-30 mx-auto shadow-md">
          <button
            onClick={handleSaveAudit}
            className="flex-1 bg-[#1E1612] hover:bg-[#2E221A] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5 text-[#D4AF37]" />
            <span>
              اعتماد الجرد وتحديث المخزن ({changedVariances.length} فروقات)
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. شاشة شؤون العمال والباريستا: اليوميات، السلف، والمرتبات (StaffAndPayrollScreen)
// ============================================================================
interface StaffAndPayrollScreenProps {
  employees: Employee[];
  transactions: EmployeeTransaction[];
  currentPartnerName: string;
  onRecordEmployeeAction: (
    employeeId: string,
    type: EmployeeTransaction["type"],
    amount: number,
    notes: string,
    paidFrom?: EmployeeTransaction['paidFrom'],
  ) => void | boolean;
  onReverseEmployeeAction?: (id:string)=>boolean;
  onClosePayrollPeriod?: (employeeId:string)=>boolean;
  onAddNewEmployee: (emp: Omit<Employee, "id">) => void | boolean;
  onDeleteEmployee: (empId: string) => void;
  onOpenExpense?: (id:string)=>void;
  onBack: () => void;
}

export const StaffAndPayrollScreen: React.FC<StaffAndPayrollScreenProps> = ({
  employees,
  transactions,
  onRecordEmployeeAction,
  onReverseEmployeeAction,
  onClosePayrollPeriod,
  onAddNewEmployee,
  onDeleteEmployee,
  onBack,
  onOpenExpense,
}) => {
  const [activeTab, setActiveTab] = useState<"staff" | "ledger">("staff");
  const [actionModal, setActionModal] = useState<{
    employee: Employee;
    type: EmployeeTransaction["type"];
  } | null>(null);
  const [actionAmount, setActionAmount] = useState<string>("");
  const [actionNotes, setActionNotes] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [paidFrom, setPaidFrom] = useState<EmployeeTransaction['paidFrom']>('درج المحل');
  const [ledgerError, setLedgerError] = useState('');

  // نافذة إضافة عامل جديد
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [newEmployeeError, setNewEmployeeError] = useState("");
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpRole, setNewEmpRole] = useState<Employee["role"]>("باريستا");
  const [newEmpPhone, setNewEmpPhone] = useState("");
  const [newEmpSalaryType, setNewEmpSalaryType] =
    useState<Employee["salaryType"]>("شهري");
  const [newEmpMonthly, setNewEmpMonthly] = useState("5500");
  const [newEmpDaily, setNewEmpDaily] = useState("185");

  // حساب مستحقات العامل الصافية
  const calculateNetPayable = (emp: Employee) => {
    return payrollBalance(emp).payable;
  };

  const totals = useMemo(() => {
    const totalAdvances = employees.reduce((s, e) => s + e.totalAdvances, 0);
    const totalDeductions = employees.reduce(
      (s, e) => s + e.totalDeductions,
      0,
    );
    const totalNetRemaining = employees.reduce(
      (s, e) => s + calculateNetPayable(e),
      0,
    );
    return { totalAdvances, totalDeductions, totalNetRemaining };
  }, [employees]);

  const openActionModal = (
    emp: Employee,
    type: EmployeeTransaction["type"],
  ) => {
    setActionModal({ employee: emp, type });
    setActionError("");
    setPaidFrom('درج المحل');
    if (type === "حضور يومية") {
      setActionAmount(String(emp.dailyRate));
      setActionNotes("تسجيل حضور يومية عمل");
    } else if (type === "صرف راتب") {
      setActionAmount(String(calculateNetPayable(emp)));
      setActionNotes("تصفية وصرف مستحقات الراتب");
    } else if (type === "سلفة") {
      setActionAmount("300");
      setActionNotes("سلفة نقدية للعامل");
    } else if (type === "خصم/عجز") {
      setActionAmount("100");
      setActionNotes("خصم إداري / عجز");
    } else {
      setActionAmount("200");
      setActionNotes("مكافأة التزام وتميز");
    }
  };

  const handleConfirmAction = () => {
    if (!actionModal) return;
    // الحساب من بيانات العامل الحيّة حتى لا نصرف على أساس عدد أبطأ
    const liveEmp = employees.find((e) => e.id === actionModal.employee.id);
    if (!liveEmp) {
      setActionError("لم يُعثر على بيانات العامل؛ أعد فتح النافذة");
      return;
    }
    if (actionModal.type === "حضور يومية") {
      setActionError("");
      const accepted = onRecordEmployeeAction(
        liveEmp.id,
        "حضور يومية",
        liveEmp.dailyRate,
        actionNotes,
      );
      if (accepted === false) {
        setActionError("لم تُسجل الحركة؛ راجع التنبيه وحاول مرة أخرى");
        return;
      }
      setActionModal(null);
      return;
    }
    const amt = parseFloat(actionAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setActionError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    if (actionModal.type === "صرف راتب") {
      const net = calculateNetPayable(liveEmp);
      if (amt > net + 0.011) {
        setActionError(
          `المبلغ أكبر من صافي مستحقات العامل (${net.toFixed(2)} ج.م)؛ عدّل القيمة`,
        );
        return;
      }
    }
    setActionError("");
    if (
      onRecordEmployeeAction(liveEmp.id, actionModal.type, amt, actionNotes, paidFrom) ===
      false
    ) {
      setActionError("لم تُسجل الحركة؛ راجع التنبيه وحاول مرة أخرى");
      return;
    }
    setActionModal(null);
  };

  const handleCreateEmployee = () => {
    const monthly = Number(newEmpMonthly);
    const daily = Number(newEmpDaily);
    if (
      !newEmpName.trim() ||
      !newEmpMonthly.trim() ||
      !newEmpDaily.trim() ||
      !Number.isFinite(monthly) ||
      monthly < 0 ||
      !Number.isFinite(daily) ||
      daily < 0
    ) {
      setNewEmployeeError("أدخل اسم العامل وقيم رواتب صحيحة غير سالبة");
      return;
    }
    const accepted = onAddNewEmployee({
      name: newEmpName.trim(),
      role: newEmpRole,
      phone: newEmpPhone || "-",
      salaryType: newEmpSalaryType,
      baseMonthlySalary: monthly,
      dailyRate: daily,
      workedDaysThisMonth: 0,
      totalAdvances: 0,
      totalDeductions: 0,
      totalBonuses: 0,
      totalPaidOut: 0,
    });
    if (accepted === false) {
      setNewEmployeeError("لم يُحفظ العامل؛ راجع التنبيه والبيانات");
      return;
    }
    setNewEmployeeError("");
    setNewEmpName("");
    setShowAddEmpModal(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1612] pb-24">
      {/* الهيدر */}
      <OperationHeader title={<>شؤون العمال والباريستا والرواتب</>} description={<>متابعة المستحقات وربط صرف السلف والرواتب بالحسابات</>} icon={HeaderUsers} onBack={onBack}><button
          onClick={() => setShowAddEmpModal(true)}
          className="bg-gradient-to-l from-[#D4AF37] to-[#B38728] text-[#1E1612] px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow"
        >
          <UserPlus className="w-4 h-4" />
          عامل جديد
        </button></OperationHeader>

      {/* التبويبات */}
      <div className="p-3 bg-white border-b border-[#E6DEC8] grid grid-cols-2 gap-2 section-tabs sticky top-0 z-20">
        <button
          onClick={() => setActiveTab("staff")}
          className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
            activeTab === "staff"
              ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
              : "bg-[#FAF8F4] text-[#5C4B3E] border-[#E6DEC8]"
          }`}
        >
          <Users className="w-4 h-4 text-[#D4AF37]" />
          بطاقات العمال ({employees.length})
        </button>
        <button
          onClick={() => setActiveTab("ledger")}
          className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
            activeTab === "ledger"
              ? "bg-[#1E1612] text-[#FBF5B7] border-[#C59B27]"
              : "bg-[#FAF8F4] text-[#5C4B3E] border-[#E6DEC8]"
          }`}
        >
          <History className="w-4 h-4 text-[#D4AF37]" />
          سجل السلف واليوميات ({transactions.length})
        </button>
      </div>

      <div className="p-3.5 space-y-4">
        {/* ملخص مالي للعمال */}
        <div className="rounded-3xl bg-gradient-to-br from-[#1E1612] via-[#2B201A] to-[#1A130F] text-white p-4 shadow-lg border-2 border-[#C59B27] grid grid-cols-3 gap-2 text-center">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
            <div className="text-[10px] text-[#D4AF37]">إجمالي السلف</div>
            <div className="text-sm font-black text-amber-300 mt-0.5">
              {totals.totalAdvances.toLocaleString("ar-EG")} ج.م
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
            <div className="text-[10px] text-[#D4AF37]">الخصومات والعجز</div>
            <div className="text-sm font-black text-red-400 mt-0.5">
              {totals.totalDeductions.toLocaleString("ar-EG")} ج.م
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
            <div className="text-[10px] text-[#D4AF37]">المتبقي للصرف</div>
            <div className="text-sm font-black text-emerald-400 mt-0.5">
              {totals.totalNetRemaining.toLocaleString("ar-EG")} ج.م
            </div>
          </div>
        </div>

        {activeTab === "staff" && (
          <div className="space-y-3.5">
            {employees.map((emp) => {
              const netPayable = calculateNetPayable(emp);
              const earned =
                emp.salaryType === "يومية"
                  ? emp.workedDaysThisMonth * emp.dailyRate
                  : emp.baseMonthlySalary;

              return (
                <div
                  key={emp.id}
                  className="bg-white rounded-3xl p-4 border border-[#E6DEC8] shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-[#1E1612]">
                          {emp.name}
                        </span>
                      <span className="text-xs">شهر {emp.payrollPeriod ?? currentPayrollPeriod()}</span>
                        <span className="text-[10px] font-extrabold bg-[#FDF8EB] text-[#9E7918] px-2 py-0.5 rounded-lg border border-[#E8D8A8]">
                          {emp.role}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#7A6855] mt-0.5">
                        نظام الحساب: <b>{emp.salaryType}</b> (اليومية:{" "}
                        {emp.dailyRate} ج.م • حضور: {emp.workedDaysThisMonth}{" "}
                        يوم)
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="text-left bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-2xl">
                        <div className="text-[10px] text-emerald-800 font-bold">
                          الصافي المتبقي
                        </div>
                        <div className="text-sm font-black text-emerald-700">
                          {netPayable.toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteEmployee(emp.id)}
                        className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                        title="حذف العامل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* تفصيل الحساب */}
                  {!!emp.openingPayable && <p className="text-xs">مرحل من الشهر السابق: {emp.openingPayable} ج.م</p>}
                  {payrollBalance(emp).balance < 0 && <p className="text-xs text-red-700">على العامل {Math.abs(payrollBalance(emp).balance)} ج.م تُرحّل عند الإقفال.</p>}
                  {onClosePayrollPeriod && <button disabled={(emp.payrollPeriod ?? currentPayrollPeriod()) >= currentPayrollPeriod()} className="text-xs border rounded-xl p-2 disabled:opacity-50" onClick={()=>{
                    if(window.confirm(`إقفال شهر ${emp.payrollPeriod ?? currentPayrollPeriod()} للعامل ${emp.name} وترحيل المستحقات؟`)) {
                      if(!onClosePayrollPeriod(emp.id)) setLedgerError('لم يُقفل الشهر؛ راجع التنبيه');
                      else setLedgerError('');
                    }
                  }}>إقفال الشهر وترحيل المستحقات</button>}
                  <div className="grid grid-cols-4 gap-1.5 text-center bg-[#FAF8F4] p-2.5 rounded-2xl border border-[#EDE6D8] text-xs">
                    <div>
                      <div className="text-[10px] text-[#7A6855]">المستحق</div>
                      <div className="font-black text-[#1E1612]">
                        {earned} ج.م
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">السلف</div>
                      <div className="font-black text-amber-700">
                        -{emp.totalAdvances}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">خصم/عجز</div>
                      <div className="font-black text-red-600">
                        -{emp.totalDeductions}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A6855]">
                        ما تم صرفه
                      </div>
                      <div className="font-black text-blue-700">
                        {emp.totalPaidOut}
                      </div>
                    </div>
                  </div>

                  {/* أزرار العمليات السريعة للعامل */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    <button
                      onClick={() => openActionModal(emp, "سلفة")}
                      className="bg-[#FDF8EB] hover:bg-[#F5E8C7] text-[#9E7918] border border-[#E8D8A8] rounded-xl py-2 px-1 flex flex-col items-center gap-1 text-[10px] font-extrabold"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>سلفة</span>
                    </button>

                    <button
                      onClick={() => openActionModal(emp, "حضور يومية")}
                      className="bg-[#FAF8F4] hover:bg-stone-200/70 text-[#1E1612] border border-[#DFD7C6] rounded-xl py-2 px-1 flex flex-col items-center gap-1 text-[10px] font-extrabold"
                    >
                      <CalendarCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>+ يومية</span>
                    </button>

                    <button
                      onClick={() => openActionModal(emp, "خصم/عجز")}
                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl py-2 px-1 flex flex-col items-center gap-1 text-[10px] font-extrabold"
                    >
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>خصم/عجز</span>
                    </button>

                    <button
                      onClick={() => openActionModal(emp, "مكافأة")}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl py-2 px-1 flex flex-col items-center gap-1 text-[10px] font-extrabold"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>مكافأة</span>
                    </button>

                    <button
                      onClick={() => openActionModal(emp, "صرف راتب")}
                      className="bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] rounded-xl py-2 px-1 flex flex-col items-center gap-1 text-[10px] font-extrabold"
                    >
                      <Banknote className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>صرف راتب</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* سجل حركات العمال (السلف واليوميات والخصومات) */}
        {activeTab === "ledger" && (
          <div className="space-y-2.5">
            {transactions.map((tr) => (
              <div
                key={tr.id}
                className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] shadow-sm flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#1E1612]">
                      {tr.employeeName}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        tr.type === "سلفة"
                          ? "bg-amber-100 text-amber-800"
                          : tr.type === "خصم/عجز"
                            ? "bg-red-100 text-red-700"
                            : tr.type === "صرف راتب"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {tr.type}
                    </span>
                  </div>
                  <div className="text-xs text-[#5C4B3E]">{tr.notes}</div>
                  <div className="text-[10px] text-[#7A6855]">
                    بواسطة: {tr.partnerName} • {tr.date}
                  </div>
                  <p className="text-xs">{tr.payrollPeriod ?? 'سجل سابق'} {tr.paidFrom ? `• ${tr.paidFrom}` : ''} {tr.expenseId ? '• مرتبط بمصروف' : ''} {tr.reversedAt ? '• معكوسة' : ''}</p>
                  {tr.expenseId&&onOpenExpense&&<button type="button" className="record-action" onClick={()=>onOpenExpense(tr.expenseId!)}>فتح قيد المصروف</button>}
                  {tr.closingSummary && <p className="text-xs">مرحل للشهر التالي: {tr.closingSummary.carryForward} ج.م</p>}
                  {onReverseEmployeeAction && tr.accountingVersion===1 && tr.type!=='إقفال شهر' && !tr.reversedAt && employees.find((e)=>e.id===tr.employeeId)?.payrollPeriod===tr.payrollPeriod && <button className="text-xs text-red-700 border rounded-xl p-2" onClick={()=>{
                    if(window.confirm('عكس حركة العامل ومصروفها مع الاحتفاظ بالأصل؟')) {
                      if(!onReverseEmployeeAction(tr.id)) setLedgerError('لم تُعكس الحركة؛ راجع التنبيه');
                      else setLedgerError('');
                    }
                  }}>عكس الحركة ومصروفها</button>}
                </div>
                <div className="text-sm font-black text-[#1E1612]">
                  {tr.amount.toLocaleString("ar-EG")} ج.م
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* نافذة تسجيل حركة للعامل */}
      {ledgerError && <p role="alert" className="text-red-700 p-3">{ledgerError}</p>}
      {actionModal && (
        <Modal title={<>تسجيل ( {actionModal.type} ) —  {actionModal.employee.name}</>}  onClose={()=>setActionModal(null)} footer={<div className="flex gap-2">
              <button
                onClick={handleConfirmAction}
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl"
              >
                حفظ وتأكيد
              </button>
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2.5 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold"
              >
                إلغاء
              </button>
            </div>}>{(actionModal.type==='سلفة'||actionModal.type==='صرف راتب') && <label className="block text-sm">مصدر الصرف<select aria-label="مصدر صرف العامل" className="block w-full border rounded-xl p-2" value={paidFrom} onChange={(event)=>setPaidFrom(event.target.value as EmployeeTransaction['paidFrom'])}>
              <option>درج المحل</option><option>خزنة الشركة</option><option>من جيب الشريك</option>
            </select></label>}
{actionError && (
              <p className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {actionError}
              </p>
            )}
<div>
              <label className="text-xs font-bold text-[#7A6855] block mb-1">
                المبلغ (ج.م)
              </label>
              <input
                type="number"
                aria-label="مبلغ حركة العامل"
                value={actionAmount}
                onChange={(e) => {
                  setActionAmount(e.target.value);
                  if (actionError) setActionError("");
                }}
                className="w-full border border-[#DFD7C6] rounded-xl px-3.5 py-2.5 text-base font-black text-center"
              />
            </div>
<div>
              <label className="text-xs font-bold text-[#7A6855] block mb-1">
                بيان / ملاحظات
              </label>
              <input
                type="text"
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="w-full border border-[#DFD7C6] rounded-xl px-3.5 py-2 text-xs font-bold"
              />
            </div></Modal>
      )}

      {/* نافذة إضافة عامل جديد */}
      {showAddEmpModal && (
        <Modal title={<>إضافة عامل أو باريستا جديد</>}  onClose={()=>setShowAddEmpModal(false)} footer={<div className="flex gap-2 pt-2">
              <button
                onClick={handleCreateEmployee}
                className="flex-1 bg-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-2.5 rounded-xl"
              >
                إضافة العامل
              </button>
              <button
                onClick={() => setShowAddEmpModal(false)}
                className="px-5 py-2.5 rounded-xl border border-[#DFD7C6] text-[#5C4B3E] font-bold"
              >
                إلغاء
              </button>
            </div>}>{newEmployeeError && (
              <p role="alert" className="text-red-700">
                {newEmployeeError}
              </p>
            )}
<input
              type="text"
              value={newEmpName}
              onChange={(e) => setNewEmpName(e.target.value)}
              placeholder="اسم العامل ثلاثي..."
              className="w-full border border-[#DFD7C6] rounded-xl px-3.5 py-2.5 text-sm font-bold"
            />
<div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  الوظيفة
                </label>
                <select
                  value={newEmpRole}
                  onChange={(e) =>
                    setNewEmpRole(e.target.value as Employee["role"])
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-white"
                >
                  <option value="باريستا">باريستا</option>
                  <option value="كاشير">كاشير</option>
                  <option value="مسؤول مطحنة وإنتاج">مسؤول مطحنة وإنتاج</option>
                  <option value="عامل مخزن وفرع">عامل مخزن وفرع</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  نظام الراتب
                </label>
                <select
                  value={newEmpSalaryType}
                  onChange={(e) =>
                    setNewEmpSalaryType(
                      e.target.value as Employee["salaryType"],
                    )
                  }
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-white"
                >
                  <option value="شهري">راتب شهري ثابت</option>
                  <option value="يومية">حساب باليومية</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  الراتب الشهري (ج.م)
                </label>
                <input
                  type="number"
                  value={newEmpMonthly}
                  onChange={(e) => setNewEmpMonthly(e.target.value)}
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#7A6855] block mb-1">
                  قيمة اليومية (ج.م)
                </label>
                <input
                  type="number"
                  value={newEmpDaily}
                  onChange={(e) => setNewEmpDaily(e.target.value)}
                  className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-sm font-bold"
                />
              </div>
            </div></Modal>
      )}
    </div>
  );
};
