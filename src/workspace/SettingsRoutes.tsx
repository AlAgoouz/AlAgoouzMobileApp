import React from "react";
import { getSupabaseCredentials } from "../lib/supabaseSync";
import { parseBackup, createBackup } from "../lib/storeState";
import { recordExpense, cancelExpense } from "../lib/ledger";
import { downloadFullBackupJson, exportFullStoreExcel } from "../lib/backupExport";
import type { ActiveWorkspace } from './useWorkspaceController';

const UsersScreen=React.lazy(()=>import('../components/UsersScreen').then(m=>({default:m.UsersScreen})));

const MenuEditor=React.lazy(()=>import('../components/MenuEditor'));

const MoreMenuScreen = React.lazy(() =>
  import("../components/ManagementScreens").then((module) => ({
    default: module.MoreMenuScreen,
  })),
);

export function SettingsRoutes({ workspace }: { workspace: ActiveWorkspace }) {
  const {
    mayWrite, accountPermissionLabels,
    activeScreen, setActiveScreen, moreInitialTab, setMoreInitialTab, showToast,
    setSelectedFinancialPartnerId, engine, member, items, purchaseInvoices, salesInvoices,
    cashierDays, suppliers, customers, expenses, partners, auditLogs, financialPartner,
    currentPartner, requireFinancialPartner, safeAction, setPartners, addAuditLog, handleLogout,
    handleClearTransactionsKeepCatalog, handleClearAllDemoData, handleRestoreDefaultDemoData,
    navigateScreen,
  } = workspace;

  return <>
    {activeScreen==='users'&&<UsersScreen access={member} partners={partners} onBack={()=>setActiveScreen('sections')}/>}
    {activeScreen==='shop_menu'&&member.isOwner&&<MenuEditor onBack={()=>setActiveScreen('sections')}/>}
    {/* ================= الشاشات الفرعية ================= */}

    {activeScreen === "more" && (
      <MoreMenuScreen
        key={moreInitialTab}
        expenses={expenses}
        partners={partners}
        auditLogs={auditLogs}
        currentPartner={currentPartner}
        accountPermissions={accountPermissionLabels}
        canManageData={member.isOwner}
        canManageExpenses={mayWrite('expenses')}
        canEditPartners={mayWrite('partners')}
        onSavePartners={(next)=>safeAction(()=>{engine.field('partners',next);})}
        selectedFinancialPartnerId={financialPartner?.id??''}
        onSelectFinancialPartnerId={setSelectedFinancialPartnerId}
        initialSubPage={moreInitialTab} showBackupHealth={member?.isOwner} onOpenCashier={()=>navigateScreen("cashier_sync")}
        showDemoTools={getSupabaseCredentials().url.startsWith("http://127.0.0.1:")}
        onAddExpense={(exp) =>
          safeAction(() => {
            engine.replace(
              recordExpense(engine.state, {...exp,partnerName:requireFinancialPartner().name}, requireFinancialPartner().id),
            );
            addAuditLog("مصروف", exp.title, exp.amount);
            showToast(
              "تم تسجيل الحركة وتحديث حساب الشريك؛ تابع تأكيد الحفظ.",
            );
          })
        }
        onDeleteExpense={(expId) =>
          safeAction(() => {
            engine.replace(
              cancelExpense(
                engine.state,
                expId,
                currentPartner.name,
              ),
            );
            addAuditLog("مصروف", `إلغاء المصروف ${expId}`);
            showToast("تم إلغاء المصروف وعكس رصيد الشريك مع حفظ الأصل.");
          })
        }
        onUpdatePartnerAccount={(id, patch) => {
          safeAction(() => {
            setPartners((prev) =>
              prev.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      ...patch,
                      avatarLetter:
                        (patch.name || p.name).trim().charAt(0) ||
                        p.avatarLetter,
                    }
                  : p,
              ),
            );
            showToast("✅ تم تحديث حساب المالك!");
          });
        }}
        onClearAllDemoData={() => {
          downloadFullBackupJson(createBackup(engine.snapshot.state));
          if (
            window.confirm(
              "تم تنزيل نسخة احتياطية. هل تريد تصفير بيانات المحل بالكامل؟",
            )
          )
            safeAction(handleClearAllDemoData);
        }}
        onClearTransactionsKeepCatalog={() => {
          downloadFullBackupJson(createBackup(engine.snapshot.state));
          if (
            window.confirm(
              "تم تنزيل نسخة احتياطية. هل تريد تصفير الفواتير والأرصدة؟",
            )
          )
            safeAction(handleClearTransactionsKeepCatalog);
        }}
        onRestoreDefaultDemoData={handleRestoreDefaultDemoData}
        onDownloadBackupJson={() => {
          downloadFullBackupJson(createBackup(engine.snapshot.state));
          showToast("📥 تم تحميل النسخة الاحتياطية الكاملة بنجاح!");
        }}
        onExportFullExcel={async () => {
          try {
            await exportFullStoreExcel(
              items,
              salesInvoices,
              purchaseInvoices,
              suppliers,
              customers,
              expenses,
              cashierDays,
            );
            showToast("📊 تم تصدير ملف الإكسيل الشامل للمحل بنجاح!");
          } catch {
            showToast("تعذر تصدير Excel؛ حاول مجددًا.", 'danger');
          }
        }}
        onRestoreBackupJson={(data) => {
          try {
            if(!member.isOwner)throw Error('استعادة البيانات متاحة للمالك الرئيسي فقط');
            const restored = parseBackup(data);
            engine.restore(restored);
            showToast(
              "تم التحقق من النسخة واسترجاعها؛ تابع تأكيد الحفظ أعلى الشاشة.",
            );
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'تعذر استرجاع النسخة', 'danger');
          }
        }}
        onLogout={handleLogout}
        onNavigate={(sc) => setActiveScreen(sc)}
        onBack={() => {
          setActiveScreen(moreInitialTab==='menu'?'home':'sections');
          setMoreInitialTab("menu");
        }}
      />
    )}
  </>;
}
