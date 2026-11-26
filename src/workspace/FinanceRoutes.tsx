import { hasInvalidNumbers } from "../lib/decimalInput";
import { saveFinancialOpening } from "../lib/financialOpening";
import { PagedSalesHistory } from "../components/PagedSalesHistory";
import React from "react";
import { Employee } from "../types/erp";
import { saveSaleReturn } from "../lib/ledger";
import { reverseEmployeeAction, closePayrollPeriod, currentPayrollPeriod } from "../lib/payroll";
import type { ActiveWorkspace } from './useWorkspaceController';

const SmartInsightsScreen = React.lazy(() =>
  import("../components/ReportsAndInsightsScreens").then((module) => ({
    default: module.SmartInsightsScreen,
  })),
);

const ProfitReportsScreen = React.lazy(() =>
  import("../components/ReportsAndInsightsScreens").then((module) => ({
    default: module.ProfitReportsScreen,
  })),
);

const SalesInvoicesAndReturnsScreen = React.lazy(() =>
  import("../components/ManagementScreens").then((module) => ({
    default: module.SalesInvoicesAndReturnsScreen,
  })),
);

const StaffAndPayrollScreen = React.lazy(() =>
  import("../components/StocktakingAndStaffScreens").then((module) => ({
    default: module.StaffAndPayrollScreen,
  })),
);

export function FinanceRoutes({ workspace }: { workspace: ActiveWorkspace }) {
  const {
    mayWrite,
    activeScreen, setActiveScreen, setMoreInitialTab, reportPeriod, setReportPeriod, showToast,
    setSelectedFinancialPartnerId, historyEditing, setHistoryEditing, salesHistoryView,
    setSalesHistoryView, cloud, engine, member, setExpenseDetailId, setCashierDetailId, openCustomer,
    items, salesInvoices, cashierDays, customers, expenses, partners, employees,
    employeeTransactions, reportSales, cashierDaysForDisplay, financialPartner, currentPartner,
    requireFinancialPartner, safeAction, setEmployees, setReceiptModalInvoice, returnBusy,
    addAuditLog, handleRecordEmployeeAction,
  } = workspace;

  return <>
    {activeScreen === "sales_invoices" && (!historyEditing?<PagedSalesHistory view={salesHistoryView} onViewChange={setSalesHistoryView} onOpenCustomer={openCustomer} onBack={()=>setActiveScreen('home')} onManage={mayWrite('sales')?()=>setHistoryEditing(true):undefined}/>:(
      <SalesInvoicesAndReturnsScreen
        cashierDays={cashierDaysForDisplay}
        salesInvoices={salesInvoices}
        customers={customers}
        onReturnInvoice={async (invId) => {
          if(returnBusy.current)return;
          if(!window.confirm('تأكيد المرتجع الاستثنائي وعكس قيمته المالية؟ تعود البضاعة بتكلفة الفاتورة الأصلية، ومكونات المشروبات والتحويجات تظل مستهلكة.'))return;
          returnBusy.current=true;
          try {
            await saveSaleReturn(engine,invId,currentPartner.name,member?.userId);
            showToast('تم حفظ المرتجع وعكس المستحق وتحديث متوسط تكلفة البضاعة؛ المكونات تظل مستهلكة.');
          } catch(error) {
            showToast(error instanceof Error?error.message:'تعذر تأكيد حفظ المرتجع', 'danger');
          } finally {returnBusy.current=false;}
        }}
        onDeleteInvoice={() => {
          showToast(
            "هذه فاتورة معتمدة؛ استخدم المرتجع لعكس أثرها مع الاحتفاظ بالأصل.",
          );
        }}
        onBack={() => setActiveScreen("home")}
      />
    ))}

    {activeScreen === "insights" && (
      <SmartInsightsScreen
        period={reportPeriod} onPeriod={setReportPeriod}
        items={items}
        salesInvoices={reportSales}
        customers={customers}
        onNavigate={(sc) => {if(sc==='partners'){setMoreInitialTab('partners');setActiveScreen('more');}else setActiveScreen(sc);}}
        onBack={() => setActiveScreen("reports")}
      />
    )}

    {activeScreen === "reports" && (
      <ProfitReportsScreen
        onOpenRecord={(kind,id)=>{
          if(kind==='expense')setExpenseDetailId(id);
          else if(cashierDays.some(day=>day.id===id))setCashierDetailId(id);
          else setReceiptModalInvoice(salesInvoices.find(invoice=>invoice.id===id)??null);
        }}
        financeState={cloud.state}
        onSaveOpening={member?.isOwner?(date,amount,reason)=>saveFinancialOpening(engine,date,amount,reason,{id:member.userId,name:currentPartner.name}):undefined}
        items={items}
        salesInvoices={reportSales}
        expenses={expenses}
        partners={partners}
        period={reportPeriod} onPeriod={setReportPeriod}
        onInsights={()=>setActiveScreen('insights')}
        onBack={() => setActiveScreen("home")}
      />
    )}

    {activeScreen === "staff_payroll" && (
      <StaffAndPayrollScreen onOpenExpense={setExpenseDetailId}
        canManage={mayWrite('staff')}
        partners={partners}
        selectedFinancialPartnerId={financialPartner?.id??''}
        onSelectFinancialPartnerId={setSelectedFinancialPartnerId}
        employees={employees}
        transactions={employeeTransactions}
        currentPartnerName={currentPartner.name}
        onReverseEmployeeAction={(id)=>safeAction(()=>{
          engine.replace(reverseEmployeeAction(engine.state,id,currentPartner.name));
          addAuditLog('شؤون عمال',`عكس حركة العامل ${id} ومصروفها`);
        })}
        onClosePayrollPeriod={(id)=>safeAction(()=>{
          if(engine.hasPending) throw new Error('انتظر اكتمال حفظ التعديلات قبل إقفال شهر آخر');
          engine.replace(closePayrollPeriod(engine.state,id,requireFinancialPartner().id));
          addAuditLog('شؤون عمال',`إقفال شهر العامل ${id} وترحيل المستحقات`);
        })}
        onRecordEmployeeAction={(...args) =>
          safeAction(() => handleRecordEmployeeAction(...args))
        }
        onAddNewEmployee={(newEmp) =>
          safeAction(() => {
            if (
              !newEmp.name.trim() ||
              hasInvalidNumbers([
                newEmp.baseMonthlySalary,
                newEmp.dailyRate,
                newEmp.workedDaysThisMonth,
                newEmp.totalAdvances,
                newEmp.totalDeductions,
                newEmp.totalBonuses,
                newEmp.totalPaidOut,
              ])
            ) {
              showToast(
                "راجع بيانات العامل: الاسم مطلوب وقيم الرواتب والحركات أرقام غير سالبة.",
              );
              return;
            }
            const created: Employee = {
              ...newEmp,
              payrollPeriod: currentPayrollPeriod(),
              openingPayable: 0,
              id: crypto.randomUUID(),
            };
            setEmployees((prev) => [created, ...prev]);
            addAuditLog("شؤون عمال", `إضافة عامل: ${created.name}`);
            showToast(`✅ تمت إضافة العامل (${created.name})!`);
          })
        }
        onDeleteEmployee={(empId) => {
          safeAction(() => {
            if (employeeTransactions.some((t) => t.employeeId === empId)) {
              showToast(
                "للعامل حركات مسجلة (سلف/رواتب/خصومات)؛ لا يمكن حذفه للحفاظ على دقة السجلات.",
              );
              return;
            }
            setEmployees((prev) => prev.filter((e) => e.id !== empId));
            showToast("🗑️ تم حذف العامل!");
          });
        }}
        onBack={() => setActiveScreen("home")}
      />
    )}
  </>;
}
