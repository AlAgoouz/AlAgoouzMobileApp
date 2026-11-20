import {matchesRecordSearch} from '../lib/recordSearch';
import {RecordTabs} from './RecordTabs';
import {unitLabel as displayUnit} from '../lib/units';
import {Scale as HeaderScale,Users as HeaderUsers} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {Modal} from './Modal';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {isStockItem} from '../lib/itemPolicy';
import {parseLocalizedNumber} from '../lib/cashierRows';
import React, { useState, useMemo, useRef } from "react";
import { payrollBalance, currentPayrollPeriod } from '../lib/payroll';
import {Scale, CheckCircle2, History, Search, Users, Wallet, CalendarCheck, Award, AlertOctagon, Banknote, Check, UserPlus, Trash2} from 'lucide-react';
import {
  InventoryItem,
  StocktakingAuditRecord,
  StocktakingItemVariance,
  Employee,
  EmployeeTransaction,
  Partner,
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
  const [auditQuery,setAuditQuery]=useState('');
  const matchingAudits=useMemo(()=>auditRecords.filter(record=>
    matchesRecordSearch(auditQuery,record.auditNumber,record.date,record.partnerName)),[auditRecords,auditQuery]);
  const auditPage=useRecordPage(matchingAudits,auditQuery,20);
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
  const countInputs = useRef(new Map<string,HTMLInputElement>());

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
      matchingCount: allVariances.filter(v=>typedActuals[v.itemId]!==undefined&&Math.abs(v.difference)<=0.0001).length,
    };
  }, [allVariances, typedActuals]);

  const handleUpdateActual = (item: InventoryItem, rawVal: string) => {
    // نحفظ النص الخام للعرض، ونُحدّث الرصيد الفعلي فقط بقيمة صالحة
    // (إدخال فارغ أو غير صحيح لا يصفّر الرصيد؛ يبقى آخر قيمة سليمة)
    setRawInputs((prev) => ({ ...prev, [item.id]: rawVal }));
    const num = parseLocalizedNumber(rawVal) ?? NaN;
    if (!Number.isFinite(num) || num < 0) {
      setTypedActuals(current=>{
        const next={...current};
        delete next[item.id];
        return next;
      });
      return;
    }
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
          !value.trim() || (parseLocalizedNumber(value) ?? -1) < 0,
      )
    ) {
      setAuditError(
        "أكمل كميات الجرد بأرقام صحيحة غير سالبة؛ الإدخال الفارغ لا يعني صفرًا.",
      );
      return;
    }
    const counted = allVariances.filter(line=>typedActuals[line.itemId]!==undefined);
    if (!counted.length) {
      setAuditError('اكتب الرصيد الفعلي لصنف واحد على الأقل قبل اعتماد الجرد.');
      return;
    }
    if (!reviewOpen) {
      setReviewOpen(true);
      return;
    }
    const accepted = onCommitStocktaking(
      counted,
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
    <div className="operation-screen min-h-screen pb-36">
      {/* الهيدر */}
      <OperationHeader title={<>الجرد الفعلي على الميزان وكشف العجز</>} description={<>مقارنة أرصدة السيستم بالوزن الفعلي بالجرام والكيلو والعدد</>} icon={HeaderScale} onBack={onBack}></OperationHeader>
      {reviewOpen&&<Modal wide title="مراجعة واعتماد الجرد" onClose={()=>{setReviewOpen(false);setAuditError('');}}
        footer={<button type="button" className="operation-primary" onClick={handleSaveAudit}>تأكيد الجرد وتحديث المخزون</button>}>
        {auditError&&<p role="alert" className="field-error">{auditError}</p>}
        <p>تم عد {Object.keys(typedActuals).length} من {auditableItems.length} صنف. الأصناف اللي لسه ما اتعدّتش بتحتفظ برصيدها المسجل.</p>
        <p>العجز {summary.totalShortage.toLocaleString('ar-EG')} ج.م · الزيادة {summary.totalSurplus.toLocaleString('ar-EG')} ج.م</p>
        <RecordPagination {...reviewPage}/>
        {reviewPage.visible.length ? <ul className="record-grid">
          {reviewPage.visible.map(line=><li key={line.itemId} className="record-card">
            <h3>{line.itemName}</h3>
            <p>المسجل {line.systemStock} · الفعلي {line.actualStock} {displayUnit(line.baseUnit)}</p>
            <p className={line.difference<0?'text-status-danger':undefined}>الفرق {line.difference>0?'+':''}{line.difference} {displayUnit(line.baseUnit)}</p>
          </li>)}
        </ul> : <p>الأرصدة الفعلية مطابقة للمسجل.</p>}
      </Modal>}


      <div className="operation-tab-strip">
        <RecordTabs label="أقسام الجرد" value={activeTab}
          tabs={[{id:'new_audit',label:'إجراء جرد فعلي الآن'},{id:'history',label:'سجل محاضر الجرد ('+auditRecords.length+')'}]} onChange={setActiveTab}/>
      </div>
      <div className="record-workspace">
        {!reviewOpen && auditError && (
          <p role="alert" className="bg-status-danger-bg text-status-danger border border-status-danger-line rounded-md p-3 font-bold">
            {auditError}
          </p>
        )}
        {savedBanner && (
          <div className="bg-status-ok-bg border border-status-ok-line text-status-ok rounded-lg p-3.5 flex items-center gap-2.5 text-xs font-extrabold">
            <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>{savedBanner}</span>
          </div>
        )}

        {activeTab === "new_audit" && (
          <>
            {/* كارت ملخص فروقات الجرد اللحظي */}
            <div className="summary-banner-dark space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-gold-soft">
                  نتيجة مطابقة الميزان مع رصيد السيستم
                </span>
                <div className="flex items-center gap-1 bg-white/10 rounded-md p-1">
                  <button
                    type="button"
                    onClick={() => changeInputMode("kg")}
                    aria-pressed={inputMode === "kg"}
                    className={`min-h-[36px] px-2.5 py-1 rounded-sm text-xs font-black transition ${
                      inputMode === "kg"
                        ? "bg-gold-soft text-ink-on-gold"
                        : "text-ink-on-dark"
                    }`}
                  >
                    إدخال بالكيلو (كجم)
                  </button>
                  <button
                    type="button"
                    onClick={() => changeInputMode("gram")}
                    aria-pressed={inputMode === "gram"}
                    className={`min-h-[36px] px-2.5 py-1 rounded-sm text-xs font-black transition ${
                      inputMode === "gram"
                        ? "bg-gold-soft text-ink-on-gold"
                        : "text-ink-on-dark"
                    }`}
                  >
                    إدخال بالجرام (جم)
                  </button>
                </div>
              </div>

              <div className="summary-banner-stats">
                <div className="summary-stat-box">
                  <div className="text-xs text-emerald-300">
                    أصناف مطابقة
                  </div>
                  <div className="text-base font-black text-white mt-0.5">
                    {summary.matchingCount} صنف
                  </div>
                </div>

                <div className="summary-stat-box bg-red-500/15 border-red-400/30">
                  <div className="text-xs text-red-300">
                    إجمالي العجز ({summary.shortageCount} صنف)
                  </div>
                  <div className="text-base font-black text-red-300 mt-0.5">
                    -{summary.totalShortage} ج.م
                  </div>
                </div>

                <div className="summary-stat-box bg-emerald-500/15 border-emerald-400/30">
                  <div className="text-xs text-emerald-300">
                    إجمالي الزيادة ({summary.surplusCount} صنف)
                  </div>
                  <div className="text-base font-black text-emerald-300 mt-0.5">
                    +{summary.totalSurplus} ج.م
                  </div>
                </div>
              </div>
            </div>

            {/* فلاتر الأقسام والبحث */}
            <div className="filter-pills" aria-label="تصفية أصناف الجرد">
              {[
                { id: "all", label: "كل المخزن" },
                { id: "manufactured_blend", label: "☕ التوليفات الجاهزة" },
                { id: "raw_bean", label: "🫘 حبوب البن الخام" },
                { id: "raw_spice", label: "🌿 التحويجة واللبن والأكواب" },
                { id: "direct_product", label: "💧 المياه والمعلبات" },
              ].map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  aria-pressed={categoryFilter === cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className="filter-pill"
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="sections-search">
              <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                aria-label="بحث عن صنف للجرد"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن صنف لجرده على الميزان..."
              />
            </div>

            {/* قائمة الأصناف وإدخال الوزن الفعلي */}
            <div className="record-grid">
              {filteredItems.map((item,index) => {
                const typed = typedActuals[item.id];
                const needsActual = typed === undefined;
                const nextItem = filteredItems[index+1];
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
                  <article
                    key={item.id}
                    className={`record-card space-y-3 ${
                      diffInBase < -0.0001
                        ? "border-status-danger-line bg-status-danger-bg/30"
                        : diffInBase > 0.0001
                          ? "border-status-ok-line bg-status-ok-bg/30"
                          : ""
                    }`}
                  >
                    <div className="record-heading mb-0">
                      <div>
                        <span className="record-badge" dir="ltr">
                          {item.code}
                        </span>
                        <h3 className="text-sm font-extrabold text-ink-strong mt-1.5">
                          {item.name}
                        </h3>
                      </div>

                      {/* بادج حالة المطابقة أو العجز */}
                      {needsActual ? <span className="record-badge bg-status-warn-bg text-status-warn border-status-warn-line">بانتظار العد الفعلي</span> : Math.abs(diffInBase) < 0.0001 ? (
                        <span className="record-badge bg-gold-tint text-gold border-gold-edge shrink-0">
                          ✓ مطابق للميزان
                        </span>
                      ) : diffInBase < 0 ? (
                        <span className="record-badge bg-status-danger-bg text-status-danger border-status-danger-line shrink-0">
                          ⚠️ عجز{" "}
                          {isKg
                            ? `${Math.abs(diffInGrams)} جم (${Math.abs(
                                diffInBase,
                              )} كجم)`
                            : `${Math.abs(diffInBase)} وحدة`}{" "}
                          ({finDiff} ج.م)
                        </span>
                      ) : (
                        <span className="record-badge bg-status-ok-bg text-status-ok border-status-ok-line shrink-0">
                          + زيادة{" "}
                          {isKg ? `${diffInGrams} جم` : `${diffInBase} وحدة`} (+
                          {finDiff} ج.م)
                        </span>
                      )}
                    </div>

                    <div className="operation-fields bg-surface-sunken p-3 rounded-md border border-line-subtle">
                      <div>
                        <div className="text-xs text-ink">
                          الرصيد المفترض بالسيستم:
                        </div>
                        <div className="text-sm font-black text-ink-strong mt-1">
                          {item.stock}{" "}
                          {isKg
                            ? `كجم (${Math.round(item.stock * 1000)} جم)`
                            : displayUnit(item.baseUnit)}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-extrabold text-gold block">
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
                          type="text"
                          inputMode={item.baseUnit==="piece"||item.baseUnit==="count"?"numeric":"decimal"}
                          ref={node=>{if(node)countInputs.current.set(item.id,node);else countInputs.current.delete(item.id);}}
                          onKeyDown={event=>{
                            if(event.key==="Enter"&&nextItem){event.preventDefault();countInputs.current.get(nextItem.id)?.focus();}
                          }}
                          aria-label={`الرصيد الفعلي: ${item.name}`}
                          value={displayInputValue}
                          onChange={(e) =>
                            handleUpdateActual(item, e.target.value)
                          }
                          className="operation-input font-black text-center border-gold-edge"
                        />
                        {nextItem&&<button type="button" className="record-action mt-2" onClick={()=>countInputs.current.get(nextItem.id)?.focus()}>
                          الصنف التالي
                        </button>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* خيار تحميل العجز على عامل / ملاحظات الجرد */}
            <section className="operation-surface space-y-3">
              <h2 className="text-xs font-extrabold text-ink-strong mb-0">
                إعدادات تسوية محضر الجرد:
              </h2>

              {summary.totalShortage > 0 && (
                <div className="bg-status-danger-bg border border-status-danger-line rounded-md p-3 space-y-2">
                  <label className="text-xs font-extrabold text-status-danger block">
                    هل تريد تحميل قيمة العجز ({summary.totalShortage} ج.م) كخصم
                    على أحد العمال؟ (اختياري)
                    <select
                      value={chargeEmployeeId}
                      onChange={(e) => setChargeEmployeeId(e.target.value)}
                      className="operation-input font-bold"
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
                  </label>
                </div>
              )}

              <input
                type="text"
                aria-label="ملاحظات محضر الجرد"
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                placeholder="ملاحظات محضر الجرد (مثلاً: جرد نهاية الأسبوع للفرع والمخزن)..."
                className="operation-input font-bold"
              />
            </section>
          </>
        )}

        {/* سجل محاضر الجرد السابقة */}
        {activeTab === "history" && (
          <div className="space-y-3">
            <label className="record-search">البحث في محاضر الجرد
              <input type="search" value={auditQuery} onChange={event=>setAuditQuery(event.target.value)}
                placeholder="رقم المحضر أو التاريخ أو اسم المسؤول" />
            </label>
            <RecordPagination {...auditPage}/>
            {!auditPage.total&&<p className="record-state">{auditRecords.length?'لا توجد محاضر مطابقة.':'لا توجد محاضر جرد مسجلة.'}</p>}
            <div className="record-grid">
              {auditPage.visible.map((rec) => (
                <article
                  key={rec.id}
                  className="record-card space-y-2.5"
                >
                  <div className="record-heading mb-0">
                    <span className="record-badge" dir="ltr">
                      #{rec.auditNumber} • {rec.date}
                    </span>
                    <span
                      className={`text-xs font-black ${
                        rec.netVarianceValue < 0
                          ? "text-status-danger"
                          : "text-status-ok"
                      }`}
                    >
                      صافي الفروقات: {rec.netVarianceValue} ج.م
                    </span>
                  </div>
                  <div className="text-xs font-bold text-ink-strong">
                    {rec.notes} — (قام بالجرد: {rec.partnerName})
                  </div>
                  <div className="bg-surface-sunken rounded-md p-2.5 space-y-1 border border-line-subtle text-xs">
                    {rec.itemsAudited.map((v, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span>• {v.itemName}</span>
                        <span
                          className={
                            v.difference < 0
                              ? "text-status-danger font-bold"
                              : "text-status-ok font-bold"
                          }
                        >
                          السيستم: {v.systemStock} | الفعلي: {v.actualStock} (
                          {v.difference} {displayUnit(v.baseUnit)})
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* شريط الاعتماد السفلي فوق شريط القوائم المثبت */}
      {activeTab === "new_audit" && (
        <div className="workspace-actions fixed left-0 right-0 bg-surface-card border-t border-line p-3 flex items-center gap-2.5 z-30 mx-auto shadow-sh-3">
          <button
            type="button"
            onClick={handleSaveAudit}
            className="operation-primary flex-1"
          >
            <Check className="w-5 h-5" aria-hidden="true" />
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
  partners?: Partner[];
  selectedFinancialPartnerId?: string;
  onSelectFinancialPartnerId?: (id: string) => void;
  employees: Employee[];
  transactions: EmployeeTransaction[];
  currentPartnerName?: string;
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
  partners = [],
  selectedFinancialPartnerId,
  onSelectFinancialPartnerId,
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
  const [ledgerQuery,setLedgerQuery]=useState('');
  const matchingTransactions=useMemo(()=>transactions.filter(transaction=>
    matchesRecordSearch(ledgerQuery,transaction.employeeName,transaction.date,transaction.type)),
    [transactions,ledgerQuery]);
  const ledgerPage=useRecordPage(matchingTransactions,ledgerQuery,20);
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
    <div className="operation-screen min-h-screen pb-24">
      {/* الهيدر */}
      <OperationHeader title={<>شؤون العمال والباريستا والرواتب</>} description={<>متابعة المستحقات وربط صرف السلف والرواتب بالحسابات</>} icon={HeaderUsers} onBack={onBack}><button
          type="button"
          onClick={() => setShowAddEmpModal(true)}
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          عامل جديد
        </button></OperationHeader>

      <div className="operation-tab-strip">
        <RecordTabs label="أقسام العمال والرواتب" value={activeTab}
          tabs={[{id:'staff',label:'بطاقات العمال ('+employees.length+')'},{id:'ledger',label:'سجل السلف واليوميات ('+transactions.length+')'}]} onChange={setActiveTab}/>
      </div>
      <div className="record-workspace">
        {partners.length > 0 && onSelectFinancialPartnerId && (
          <section className="operation-surface">
            <label className="block">حساب الشريك المالي للحركة
              <select aria-label="حساب الشريك المالي للحركة" className="operation-input" value={selectedFinancialPartnerId ?? ''} onChange={e => onSelectFinancialPartnerId(e.target.value)}>
                <option value="">اختر الحساب المالي</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </section>
        )}

        {/* ملخص مالي للعمال */}
        <div className="summary-banner-dark">
          <div className="summary-banner-stats">
            <div className="summary-stat-box">
              <div className="text-xs text-gold-soft">إجمالي السلف</div>
              <div className="text-sm font-black text-amber-300 mt-0.5">
                {totals.totalAdvances.toLocaleString("ar-EG")} ج.م
              </div>
            </div>
            <div className="summary-stat-box">
              <div className="text-xs text-gold-soft">الخصومات والعجز</div>
              <div className="text-sm font-black text-red-300 mt-0.5">
                {totals.totalDeductions.toLocaleString("ar-EG")} ج.م
              </div>
            </div>
            <div className="summary-stat-box">
              <div className="text-xs text-gold-soft">المتبقي للصرف</div>
              <div className="text-sm font-black text-emerald-300 mt-0.5">
                {totals.totalNetRemaining.toLocaleString("ar-EG")} ج.م
              </div>
            </div>
          </div>
        </div>

        {activeTab === "staff" && (
          <div className="record-grid">
            {employees.map((emp) => {
              const netPayable = calculateNetPayable(emp);
              const earned =
                emp.salaryType === "يومية"
                  ? emp.workedDaysThisMonth * emp.dailyRate
                  : emp.baseMonthlySalary;

              return (
                <article
                  key={emp.id}
                  className="record-card flex flex-col justify-between gap-3"
                >
                  <div className="record-heading mb-0">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-black text-ink-strong">
                          {emp.name}
                        </h2>
                        <span className="text-xs text-ink">شهر {emp.payrollPeriod ?? currentPayrollPeriod()}</span>
                        <span className="record-badge">
                          {emp.role}
                        </span>
                      </div>
                      <p className="mt-1">
                        نظام الحساب: <b>{emp.salaryType}</b> (اليومية:{" "}
                        {emp.dailyRate} ج.م • حضور: {emp.workedDaysThisMonth}{" "}
                        يوم)
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-end bg-status-ok-bg border border-status-ok-line px-3 py-1.5 rounded-md">
                        <div className="text-xs text-status-ok font-bold">
                          الصافي المتبقي
                        </div>
                        <div className="text-sm font-black text-status-ok">
                          {netPayable.toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteEmployee(emp.id)}
                        className="action-button text-status-danger border-status-danger-line"
                        aria-label={`حذف ${emp.name}`}
                        title="حذف العامل"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* تفصيل الحساب */}
                  {!!emp.openingPayable && <p className="text-xs text-ink">مرحل من الشهر السابق: {emp.openingPayable} ج.م</p>}
                  {payrollBalance(emp).balance < 0 && <p className="text-xs text-status-danger font-bold">على العامل {Math.abs(payrollBalance(emp).balance)} ج.م تُرحّل عند الإقفال.</p>}
                  {onClosePayrollPeriod && <button type="button" disabled={(emp.payrollPeriod ?? currentPayrollPeriod()) >= currentPayrollPeriod()} className="action-button w-full" onClick={()=>{
                    if(window.confirm(`إقفال شهر ${emp.payrollPeriod ?? currentPayrollPeriod()} للعامل ${emp.name} وترحيل المستحقات؟`)) {
                      if(!onClosePayrollPeriod(emp.id)) setLedgerError('لم يُقفل الشهر؛ راجع التنبيه');
                      else setLedgerError('');
                    }
                  }}>إقفال الشهر وترحيل المستحقات</button>}
                  <dl className="record-facts mb-0">
                    <div>
                      <dt>المستحق</dt>
                      <dd>{earned} ج.م</dd>
                    </div>
                    <div>
                      <dt>السلف</dt>
                      <dd className="text-status-warn">-{emp.totalAdvances}</dd>
                    </div>
                    <div>
                      <dt>خصم/عجز</dt>
                      <dd className="text-status-danger">-{emp.totalDeductions}</dd>
                    </div>
                    <div>
                      <dt>ما تم صرفه</dt>
                      <dd className="text-status-info">{emp.totalPaidOut}</dd>
                    </div>
                  </dl>

                  {/* أزرار العمليات السريعة للعامل */}
                  <div className="staff-quick-actions pt-1">
                    <button
                      type="button"
                      onClick={() => openActionModal(emp, "سلفة")}
                      className="bg-gold-tint hover:bg-gold-highlight text-gold border border-gold-edge"
                    >
                      <Wallet className="w-4 h-4" aria-hidden="true" />
                      <span>سلفة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openActionModal(emp, "حضور يومية")}
                      className="bg-surface-sunken hover:bg-surface-raised text-ink-strong border border-line"
                    >
                      <CalendarCheck className="w-4 h-4 text-status-ok" aria-hidden="true" />
                      <span>+ يومية</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openActionModal(emp, "خصم/عجز")}
                      className="bg-status-danger-bg text-status-danger border border-status-danger-line"
                    >
                      <AlertOctagon className="w-4 h-4" aria-hidden="true" />
                      <span>خصم/عجز</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openActionModal(emp, "مكافأة")}
                      className="bg-status-ok-bg text-status-ok border border-status-ok-line"
                    >
                      <Award className="w-4 h-4" aria-hidden="true" />
                      <span>مكافأة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openActionModal(emp, "صرف راتب")}
                      className="bg-espresso text-gold-highlight border border-gold-edge"
                    >
                      <Banknote className="w-4 h-4 text-gold-soft" aria-hidden="true" />
                      <span>صرف راتب</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* سجل حركات العمال (السلف واليوميات والخصومات) */}
        {activeTab === "ledger" && (
          <div className="space-y-3">
            <label className="record-search">البحث في حركات العمال
              <input type="search" value={ledgerQuery} onChange={event=>setLedgerQuery(event.target.value)}
                placeholder="اسم العامل أو نوع الحركة أو التاريخ" />
            </label>
            <RecordPagination {...ledgerPage}/>
            {!ledgerPage.total&&<p className="record-state">{transactions.length?'لا توجد حركات مطابقة.':'لا توجد حركات مسجلة.'}</p>}
            <div className="record-grid">
              {ledgerPage.visible.map((tr) => (
                <article
                  key={tr.id}
                  className="record-card flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-ink-strong">
                        {tr.employeeName}
                      </span>
                      <span
                        className={`record-badge font-extrabold ${
                          tr.type === "سلفة"
                            ? "bg-status-warn-bg text-status-warn border-status-warn-line"
                            : tr.type === "خصم/عجز"
                              ? "bg-status-danger-bg text-status-danger border-status-danger-line"
                              : tr.type === "صرف راتب"
                                ? "bg-status-info-bg text-status-info border-status-info-line"
                                : "bg-status-ok-bg text-status-ok border-status-ok-line"
                        }`}
                      >
                        {tr.type}
                      </span>
                    </div>
                    <div className="text-xs text-ink">{tr.notes}</div>
                    <div className="text-xs text-ink-faint">
                      بواسطة: {tr.partnerName} • {tr.date}
                    </div>
                    <p className="text-xs text-ink">{tr.payrollPeriod ?? 'سجل سابق'} {tr.paidFrom ? `• ${tr.paidFrom}` : ''} {tr.expenseId ? '• مرتبط بمصروف' : ''} {tr.reversedAt ? '• معكوسة' : ''}</p>
                    <div className="register-actions pt-1">
                      {tr.expenseId&&onOpenExpense&&<button type="button" className="record-action" onClick={()=>onOpenExpense(tr.expenseId!)}>فتح قيد المصروف</button>}
                      {tr.closingSummary && <p className="text-xs text-ink">مرحل للشهر التالي: {tr.closingSummary.carryForward} ج.م</p>}
                      {onReverseEmployeeAction && tr.accountingVersion===1 && tr.type!=='إقفال شهر' && !tr.reversedAt && employees.find((e)=>e.id===tr.employeeId)?.payrollPeriod===tr.payrollPeriod && <button type="button" className="action-button text-status-danger border-status-danger-line" onClick={()=>{
                        if(window.confirm('عكس حركة العامل ومصروفها مع الاحتفاظ بالأصل؟')) {
                          if(!onReverseEmployeeAction(tr.id)) setLedgerError('لم تُعكس الحركة؛ راجع التنبيه');
                          else setLedgerError('');
                        }
                      }}>عكس الحركة ومصروفها</button>}
                    </div>
                  </div>
                  <div className="text-sm font-black text-ink-strong shrink-0">
                    {tr.amount.toLocaleString("ar-EG")} ج.م
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* نافذة تسجيل حركة للعامل */}
      {ledgerError && <p role="alert" className="field-error p-3">{ledgerError}</p>}
      {actionModal && (
        <Modal title={<>تسجيل ( {actionModal.type} ) —  {actionModal.employee.name}</>}  onClose={()=>setActionModal(null)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={handleConfirmAction}
                className="operation-primary flex-1"
              >
                حفظ وتأكيد
              </button>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}>{(actionModal.type==='سلفة'||actionModal.type==='صرف راتب') && <label className="block">مصدر الصرف<select aria-label="مصدر صرف العامل" className="operation-input" value={paidFrom} onChange={(event)=>setPaidFrom(event.target.value as EmployeeTransaction['paidFrom'])}>
              <option>درج المحل</option><option>خزنة الشركة</option><option>من جيب الشريك</option>
            </select></label>}
{actionError && (
              <p role="alert" className="field-error">
                {actionError}
              </p>
            )}
<label className="block">
              المبلغ (ج.م)
              <input
                type="number"
                aria-label="مبلغ حركة العامل"
                value={actionAmount}
                onChange={(e) => {
                  setActionAmount(e.target.value);
                  if (actionError) setActionError("");
                }}
                className="operation-input font-black text-center"
              />
            </label>
<label className="block">
              بيان / ملاحظات
              <input
                type="text"
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="operation-input font-bold"
              />
            </label></Modal>
      )}

      {/* نافذة إضافة عامل جديد */}
      {showAddEmpModal && (
        <Modal title={<>إضافة عامل أو باريستا جديد</>}  onClose={()=>setShowAddEmpModal(false)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={handleCreateEmployee}
                className="operation-primary flex-1"
              >
                إضافة العامل
              </button>
              <button
                type="button"
                onClick={() => setShowAddEmpModal(false)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}>{newEmployeeError && (
              <p role="alert" className="field-error">
                {newEmployeeError}
              </p>
            )}
<input
              type="text"
              aria-label="اسم العامل"
              value={newEmpName}
              onChange={(e) => setNewEmpName(e.target.value)}
              placeholder="اسم العامل ثلاثي..."
              className="operation-input font-bold"
            />
<div className="operation-fields">
              <label>
                الوظيفة
                <select
                  value={newEmpRole}
                  onChange={(e) =>
                    setNewEmpRole(e.target.value as Employee["role"])
                  }
                  className="operation-input font-bold"
                >
                  <option value="باريستا">باريستا</option>
                  <option value="كاشير">كاشير</option>
                  <option value="مسؤول مطحنة وإنتاج">مسؤول مطحنة وإنتاج</option>
                  <option value="عامل مخزن وفرع">عامل مخزن وفرع</option>
                </select>
              </label>
              <label>
                نظام الراتب
                <select
                  value={newEmpSalaryType}
                  onChange={(e) =>
                    setNewEmpSalaryType(
                      e.target.value as Employee["salaryType"],
                    )
                  }
                  className="operation-input font-bold"
                >
                  <option value="شهري">راتب شهري ثابت</option>
                  <option value="يومية">حساب باليومية</option>
                </select>
              </label>
              <label>
                الراتب الشهري (ج.م)
                <input
                  type="number"
                  value={newEmpMonthly}
                  onChange={(e) => setNewEmpMonthly(e.target.value)}
                  className="operation-input font-bold"
                />
              </label>
              <label>
                قيمة اليومية (ج.م)
                <input
                  type="number"
                  value={newEmpDaily}
                  onChange={(e) => setNewEmpDaily(e.target.value)}
                  className="operation-input font-bold"
                />
              </label>
            </div></Modal>
      )}
    </div>
  );
};
