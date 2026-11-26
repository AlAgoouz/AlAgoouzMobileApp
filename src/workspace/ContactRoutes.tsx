import { hasInvalidNumbers } from "../lib/decimalInput";
import { checkCustomerDetails, checkSupplierDetails } from "../lib/contactDetails";
import React from "react";
import { reversePayment, recordPayment } from "../lib/ledger";
import type { ActiveWorkspace } from './useWorkspaceController';

const SuppliersAndCustomersScreen = React.lazy(() =>
  import("../components/ManagementScreens").then((module) => ({
    default: module.SuppliersAndCustomersScreen,
  })),
);

export function ContactRoutes({ workspace }: { workspace: ActiveWorkspace }) {
  const {
    mayWrite,
    activeScreen, setActiveScreen, showToast, engine, customerTargetId, setCustomerTargetId,
    customerView, setCustomerView, supplierView, setSupplierView, returnFromCustomer, openPurchase,
    purchaseInvoices, salesInvoices, suppliers, customers, accountPayments, currentPartner,
    safeAction, setItems, setSuppliers, setCustomers, setReceiptModalInvoice, addAuditLog,
  } = workspace;

  return <>
    {activeScreen === "suppliers" && (
      <SuppliersAndCustomersScreen canManageContacts={mayWrite('contacts')} canManagePayments={mayWrite('collections')} onUpdateContact={(mode,id,details)=>safeAction(()=>{if(mode==='customers'){checkCustomerDetails(details);setCustomers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}else{checkSupplierDetails(details);setSuppliers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}addAuditLog("تعديل وصفة/صنف","تحديث بيانات التواصل");})}
        mode="suppliers" listView={supplierView} onListViewChange={setSupplierView} onOpenPurchase={openPurchase}
        suppliers={suppliers}
        customers={customers}
        purchaseInvoices={purchaseInvoices}
        salesInvoices={salesInvoices}
        accountPayments={accountPayments}
        onPaySupplier={(supId, amount, notes) =>
          safeAction(() => {
            engine.replace(
              recordPayment(
                engine.state,
                "supplier",
                supId,
                amount,
                currentPartner.name,
                notes,
              ),
            );
            addAuditLog("سداد/تحصيل", "سداد للمورد", amount);
            showToast(
              "تم تسجيل الدفعة وتوزيعها على الفواتير المستحقة؛ تابع تأكيد الحفظ.",
            );
          })
        }
        onDeletePayment={(payId) => {
          safeAction(() => {
            engine.replace(
              reversePayment(
                engine.state,
                payId,
                currentPartner.name,
              ),
            );
            addAuditLog("سداد/تحصيل", "إلغاء دفعة بحركة عكسية");
            showToast("تم إلغاء الدفعة وإعادة الرصيد مع حفظ السجل.");
          });
        }}
        onAddSupplier={(sup) => {
          return safeAction(() => {
            checkSupplierDetails(sup);
            if (!sup.name.trim() || hasInvalidNumbers([sup.balance])) {
              showToast(
                "راجع البيانات: اسم المورد مطلوب والرصيد رقم غير سالب.",
              );
              return;
            }
            setSuppliers((prev) => [
              { ...sup, id: crypto.randomUUID() },
              ...prev,
            ]);
            showToast(`✅ تمت إضافة المورد (${sup.name})!`);
          });
        }}
        onDeleteSupplier={(id) => {
          safeAction(() => {
            if (
              purchaseInvoices.some((i) => i.supplierId === id) ||
              accountPayments.some((p) => p.targetId === id) ||
              suppliers.find((s) => s.id === id)?.balance
            ) {
              showToast("حساب المورد مرتبط بحركات أو رصيد؛ لا يمكن حذفه.");
              return;
            }
            setSuppliers((prev) => prev.filter((s) => s.id !== id));
            // تنظيف أسعار المورد المحذوف من كتالوج الأصناف
            setItems((prev) =>
              prev.map((item) => ({
                ...item,
                supplierPrices: item.supplierPrices.filter(
                  (sp) => sp.supplierId !== id,
                ),
              })),
            );
            showToast("🗑️ تم حذف المورد!");
          });
        }}
        onCollectCustomer={() => {
          return safeAction(() => {});
        }}
        onAddCustomer={() => {
          safeAction(() => {});
        }}
        onDeleteCustomer={() => {
          safeAction(() => {});
        }}
        onBack={() => setActiveScreen("home")}
      />
    )}

    {activeScreen === "customers" && (
      <SuppliersAndCustomersScreen canManageContacts={mayWrite('contacts')} canManagePayments={mayWrite('collections')} onUpdateContact={(mode,id,details)=>safeAction(()=>{if(mode==='customers'){checkCustomerDetails(details);setCustomers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}else{checkSupplierDetails(details);setSuppliers(rows=>rows.map(c=>c.id===id?{...c,...details}:c));}addAuditLog("تعديل وصفة/صنف","تحديث بيانات التواصل");})}
        mode="customers" listView={customerView} onListViewChange={setCustomerView} initialStatementId={customerTargetId}
        onOpenSale={id=>setReceiptModalInvoice(salesInvoices.find(invoice=>invoice.id===id)??null)}
        suppliers={suppliers}
        customers={customers}
        purchaseInvoices={purchaseInvoices}
        salesInvoices={salesInvoices}
        accountPayments={accountPayments}
        onPaySupplier={() => {
          return safeAction(() => {});
        }}
        onAddSupplier={() => {
          safeAction(() => {});
        }}
        onDeleteSupplier={() => {
          safeAction(() => {});
        }}
        onCollectCustomer={(custId, amount, notes) =>
          safeAction(() => {
            engine.replace(
              recordPayment(
                engine.state,
                "customer",
                custId,
                amount,
                currentPartner.name,
                notes,
              ),
            );
            addAuditLog("سداد/تحصيل", "تحصيل من العميل", amount);
            showToast(
              "تم تسجيل الدفعة وتوزيعها على الفواتير المستحقة؛ تابع تأكيد الحفظ.",
            );
          })
        }
        onDeletePayment={(payId) => {
          safeAction(() => {
            engine.replace(
              reversePayment(
                engine.state,
                payId,
                currentPartner.name,
              ),
            );
            addAuditLog("سداد/تحصيل", "إلغاء دفعة بحركة عكسية");
            showToast("تم إلغاء الدفعة وإعادة الرصيد مع حفظ السجل.");
          });
        }}
        onAddCustomer={(cust) => {
          return safeAction(() => {
            checkCustomerDetails(cust);
            if (!cust.name.trim() || hasInvalidNumbers([cust.balance])) {
              showToast(
                "راجع البيانات: اسم العميل مطلوب والرصيد رقم غير سالب.",
              );
              return;
            }
            setCustomers((prev) => [
              { ...cust, id: crypto.randomUUID() },
              ...prev,
            ]);
            showToast(`✅ تمت إضافة العميل (${cust.name})!`);
          });
        }}
        onDeleteCustomer={(id) => {
          safeAction(() => {
            if (
              salesInvoices.some((i) => i.customerId === id) ||
              accountPayments.some((p) => p.targetId === id) ||
              customers.find((c) => c.id === id)?.balance
            ) {
              showToast("حساب العميل مرتبط بحركات أو رصيد؛ لا يمكن حذفه.");
              return;
            }
            setCustomers((prev) => prev.filter((c) => c.id !== id));
            showToast("🗑️ تم حذف العميل!");
          });
        }}
        onBack={()=>{setCustomerTargetId(undefined);setActiveScreen(returnFromCustomer);}}
      />
    )}
  </>;
}
