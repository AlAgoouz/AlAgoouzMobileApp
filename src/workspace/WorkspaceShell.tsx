import { ScreenLoading } from "../components/ScreenLoading";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { RecoveryDraftNotice } from "../components/RecoveryDraftNotice";
import { Modal } from "../components/Modal";
import { DashboardScreen } from "../components/DashboardScreen";
import { SaveStatus } from "../components/SaveStatus";
import { WorkspaceQuickAccess } from "../components/WorkspaceQuickAccess";
import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { SectionsHub } from "../components/SectionsHub";
import React, { useEffect, useRef } from "react";
import { LayoutGrid, AlertTriangle, BarChart3, CheckCircle2, AlertCircle, Info, X, Home, UserCheck } from "lucide-react";
import { getSupabaseCredentials } from "../lib/supabaseSync";
import { createBackup } from "../lib/storeState";
import { downloadFullBackupJson } from "../lib/backupExport";
import type { ActiveWorkspace } from './useWorkspaceController';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import { WorkspaceRoutes } from './WorkspaceRoutes';

export function WorkspaceShell({ workspace }: { workspace: ActiveWorkspace }) {
  const {
    mayWrite,
    activeScreen, setActiveScreen, moreInitialTab, reportPeriod, setReportPeriod, toastNotification,
    setToastNotification, scheduleToastDismiss, pauseToastDismiss, showToast, needsFullStore, cloud,
    engine, member, dashboard, needsTodayRead, dailyDashboard, loggedPartnerId, partners,
    currentPartner, queueError, setQueuedReports, handleLogout, navigateScreen,
  } = workspace;
  const screenKey = activeScreen === 'more' ? activeScreen + ':' + moreInitialTab : activeScreen;
  const workspaceMain = useRef<HTMLElement>(null);
  const lastScreen = useRef(screenKey);
  useEffect(() => {
    if (lastScreen.current !== screenKey) {
      workspaceMain.current?.focus();
      lastScreen.current = screenKey;
    }
  }, [screenKey]);
  const recoveryAccess={userId:member.userId,activeKey:cloud.recoveryDraftKey,includeLegacy:member.isOwner};
  const blocked = (needsFullStore||engine.hasPending)&&!["ready", "dirty", "saving", "offline"].includes(cloud.status);
  const statusText =
    cloud.status === "offline"
      ? engine.hasPending ? "مسودات محفوظة على الجهاز وبانتظار المزامنة" : "الاتصال مقطوع. العمليات الجديدة ستُحفظ كمسودات على هذا الجهاز."
      : cloud.status === "saving"
      ? "جارٍ الحفظ على السحابة…"
      : cloud.status === "dirty"
        ? "تعديلات بانتظار الحفظ"
        : cloud.status === "ready"
          ? ""
          : cloud.status === "loading"
            ? "جارٍ تحميل بيانات المحل…"
            : cloud.status === "conflict"
              ? "تعارض مع تعديلات جهاز آخر"
              : "تعذر تأكيد الحفظ";

  return (
    <div className="agouz-app min-h-screen bg-surface-page flex flex-col items-center justify-start"
      data-awaiting-summary={activeScreen === 'home' && !dashboard.data && !dashboard.error ? '' : undefined}>
      <a className="workspace-skip" href="#workspace-main" onClick={(event) => {
        event.preventDefault();
        workspaceMain.current?.focus();
      }}>انتقل إلى المحتوى</a>
      {getSupabaseCredentials().url.startsWith("http://127.0.0.1:") && (
        <div className="w-full bg-status-warn-bg text-status-warn border-b border-status-warn-line p-2 text-center text-xs font-bold">
          بيئة اختبار محلية — بيانات تجريبية منفصلة
        </div>
      )}
      <SaveStatus savedAt={cloud.savedAt} ready={cloud.status === 'ready'} message={needsFullStore || engine.hasPending || cloud.status==='offline' ? statusText : ''}/>
      {cloud.recoveryWarning&&<p role="status" className="w-full p-3 bg-status-warn-bg text-status-warn border-b border-status-warn-line text-sm">{cloud.recoveryWarning}</p>}
      <RecoveryDraftNotice key={member.userId} {...recoveryAccess}/>
      {queueError && (
        <div
          role="alert"
          className="w-full p-3 bg-status-danger-bg text-status-danger border-b border-status-danger-line text-sm font-bold"
        >
          {queueError}
        </div>
      )}
      {blocked && (
        <Modal title={statusText} dismissible={false}><div role="alert"><p>
              {cloud.error ||
                (!partners.some((p) => p.id === loggedPartnerId) &&
                cloud.status === "ready"
                  ? "هذا الحساب غير مرتبط بملف شريك داخل بيانات المحل"
                  : "")}
            </p>{["error", "conflict"].includes(cloud.status) && (
              <>
                <button
                  className="border rounded p-2 m-1"
                  onClick={() =>
                    downloadFullBackupJson(createBackup(engine.snapshot.state))
                  }
                >
                  حفظ نسخة من العمل الحالي
                </button>
                {cloud.status === "error" && engine.hasPending && (
                  <button
                    className="border rounded p-2 m-1"
                    onClick={() => void engine.flush()}
                  >
                    إعادة محاولة الحفظ
                  </button>
                )}
                {engine.hasPendingCashierAttachment ? (
                  <button className="border rounded p-2 m-1" onClick={() => {
                    if (!window.confirm('يلغي الخادم محاولة الإرفاق إذا لم تكن محفوظة. هل تريد المتابعة؟')) return;
                    void engine.discardCashierAttachment().then(result => {
                      if (result) {
                        if (result === 'saved') {
                          const attached = new Set(engine.state.cashierDays.flatMap(day => [day.financialReport?.sourceQueueId, day.itemsReport?.sourceQueueId]));
                          setQueuedReports(rows => rows.filter(row => !attached.has(row.id)));
                        }
                        showToast(result === 'saved' ? 'التقرير محفوظ بالفعل على الخادم.' : 'أُلغيت محاولة الإرفاق. اختر التقرير من جديد.');
                      }
                    }).catch(() => {});
                  }}>
                    التحقق من الإرفاق وإلغاء المحاولة
                  </button>
                ) : <button
                  className="border rounded p-2 m-1"
                  onClick={() => {
                    if (
                      !engine.hasPending ||
                      window.confirm(
                        "هل حفظت نسخة من العمل؟ إعادة التحميل تستبدل التعديلات غير المحفوظة ببيانات السحابة.",
                      )
                    )
                      void engine.load();
                  }}
                >
                  تحميل بيانات السحابة
                </button>}
                {!engine.hasPending && (
                  <button
                    className="border rounded p-2 m-1"
                    onClick={handleLogout}
                  >
                    تسجيل الخروج
                  </button>
                )}
              </>
            )}</div></Modal>
      )}

      {/* إشعار عائم دلالي */}
      {toastNotification && (
        <div role="region" aria-label="الإشعارات" className="app-toast-region">
          <div
            role={toastNotification.tone === 'danger' ? 'alert' : 'status'}
            aria-live={toastNotification.tone === 'danger' ? 'assertive' : 'polite'}
            data-tone={toastNotification.tone}
            className="app-toast"
            onMouseEnter={pauseToastDismiss}
            onMouseLeave={() => scheduleToastDismiss(toastNotification.id)}
            onFocus={pauseToastDismiss}
            onBlur={() => scheduleToastDismiss(toastNotification.id)}
          >
            <div className="app-toast-body">
              {toastNotification.tone === 'danger' ? (
                <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : toastNotification.tone === 'warn' ? (
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : toastNotification.tone === 'info' ? (
                <Info className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              <span>{toastNotification.message}</span>
            </div>
            <button
              type="button"
              className="app-toast-close"
              aria-label="إغلاق الإشعار"
              onClick={() => {
                pauseToastDismiss();
                setToastNotification(null);
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <WorkspaceSidebar name={currentPartner.name} screen={activeScreen==='more'&&moreInitialTab!=='menu'?moreInitialTab:activeScreen==='insights'?'reports':activeScreen} onNavigate={navigateScreen} isOwner={member.isOwner} canCreateSale={mayWrite('sales')} counts={dashboard.data?.counts ?? {}}/>
      <div className="app-workspace min-h-screen relative">
        <WorkspaceQuickAccess member={member} onNavigate={navigateScreen} showButton={activeScreen==='home'||activeScreen==='sections'}/>
        <main id="workspace-main" ref={workspaceMain} tabIndex={-1} aria-label="محتوى مساحة العمل" className="screen-stage" key={screenKey}>
        <AppErrorBoundary key={member.userId+':'+screenKey} recoveryAccess={recoveryAccess} onReset={()=>setActiveScreen('home')} insideWorkspace>
        {/* ================= 1. الشاشة الرئيسية: لوحة الإحصائيات والرسوم البيانية الاحترافية ================= */}
        {activeScreen === 'home'&&<DashboardScreen model={dashboard.data} dailyModel={needsTodayRead ? dailyDashboard.data : dashboard.data} dailyError={needsTodayRead ? dailyDashboard.error : dashboard.error} onRetryDaily={needsTodayRead ? dailyDashboard.retry : dashboard.retry} error={dashboard.error} onRetry={dashboard.retry} period={reportPeriod} onPeriod={setReportPeriod} name={currentPartner.name} isOwner={member?.isOwner} onNavigate={navigateScreen}/>}

        {activeScreen === "sections" && <SectionsHub
          counts={dashboard.data?.counts??{}}
          canManageCashier={mayWrite('cashier')}
          canCreateSale={mayWrite('sales')}
          onNavigate={navigateScreen}
          isOwner={member.isOwner}
        />}

        {needsFullStore&&!cloud.fullReady?<ScreenLoading/>:<React.Fragment>
          <WorkspaceRoutes workspace={workspace} />
          <WorkspaceDialogs workspace={workspace} />
        </React.Fragment>}
        </AppErrorBoundary>
        </main>
        {/* شريط القوائم السفلي المثبت دائماً في أسفل الشاشة مع قسم "الأقسام" بجانب "الرئيسية" */}
        <nav aria-label="التنقل الرئيسي" className="workspace-nav fixed bottom-0 left-0 right-0 workspace-nav-surface border-t py-1.5 px-2 grid grid-cols-4 mx-auto">
          {[
            { id: "home", label: "الرئيسية", icon: Home },
            { id: "sections", label: "الأقسام", icon: LayoutGrid },
            { id: "reports", label: "التقارير", icon: BarChart3 },
            { id: "more", label: "حسابي", icon: UserCheck },
          ].map((tab) => {
            const IconComp = tab.icon;
            const navScreen=activeScreen==='more'?(moreInitialTab==='menu'?'more':'sections'):activeScreen==='insights'?'reports':['home','reports','sections'].includes(activeScreen)?activeScreen:'sections';
            const isActive = navScreen === tab.id;
            return (
              <button
                key={tab.id}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigateScreen(tab.id)}
                className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 py-0.5"
              >
                <div
                  className="px-3.5 py-1 rounded-full border border-transparent"
                >
                  <IconComp className="w-4 h-4" aria-hidden="true" />
                </div>
                <span>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
