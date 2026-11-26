import React, {useMemo, useState} from 'react';
import {
  CircleUser as HeaderCircleUser,
  DatabaseBackup as HeaderDatabaseBackup,
  Download,
  FileSpreadsheet,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  Wallet as HeaderWallet,
} from 'lucide-react';
import {businessDate} from '../lib/dates';
import {matchesRecordSearch} from '../lib/recordSearch';
import {useThemePreference, type ThemePreference} from '../lib/theme';
import type {AuditLogEntry, Expense, Partner} from '../types/erp';
import {FinancialPartnersScreen} from './FinancialPartnersScreen';
import {OperationHeader} from './OperationHeader';
import {OperationalHealth} from './OperationalHealth';
import {RecordPagination, useRecordPage} from './RecordPagination';
import {SupabaseSettings} from './SupabaseSettings';

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

  const { preference, setPreference, systemScheme } = useThemePreference();
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

  if (subPage === 'cloud') return <SupabaseSettings onBack={onBack}/>;

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
