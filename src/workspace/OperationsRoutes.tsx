import { checkSupplierDetails } from "../lib/contactDetails";
import { saveRecipe } from "../lib/recipeCatalog";
import { OperationHeader } from "../components/OperationHeader";
import { attachCashierReport, approveCashierDay } from "../lib/cashierDays";
import React from "react";
import { Lock } from "lucide-react";
import { InventoryItem, Supplier } from "../types/erp";
import { cancelPurchase, receivePurchaseRefund } from "../lib/ledger";
import type { ActiveWorkspace } from './useWorkspaceController';

const WholesaleInvoiceScreen=React.lazy(()=>import('../components/WholesaleInvoiceScreen').then(m=>({default:m.WholesaleInvoiceScreen})));

const CashierDayScreen=React.lazy(()=>import('../components/CashierDayScreen').then(m=>({default:m.CashierDayScreen})));

const PurchaseScreen = React.lazy(() =>
  import("../components/PurchaseScreen").then((module) => ({
    default: module.PurchaseScreen,
  })),
);

const ProductionAndRecipesScreen = React.lazy(() =>
  import("../components/ProductionAndRecipesScreen").then((module) => ({
    default: module.ProductionAndRecipesScreen,
  })),
);

const RecipesScreen=React.lazy(()=>import('../components/RecipesScreen').then(m=>({default:m.RecipesScreen})));

const StocktakingScreen = React.lazy(() =>
  import("../components/StocktakingAndStaffScreens").then((module) => ({
    default: module.StocktakingScreen,
  })),
);

export function OperationsRoutes({ workspace }: { workspace: ActiveWorkspace }) {
  const {
    mayWrite,
    activeScreen, setActiveScreen, showToast, cloud, engine, member, recipeTargetId,
    purchaseTargetId, setPurchaseTargetId, openRecipes, confirmSave, items, productionBatches,
    purchaseInvoices, suppliers, customers, employees, stocktakingRecords, cashierDaysForDisplay,
    currentPartner, defineRecipe, safeAction, setItems, setSuppliers, setReceiptModalInvoice,
    queuedReports, setQueuedReports, addAuditLog, handleExecuteProduction, handleSavePurchase,
    handleSaveSale, handleCommitStocktaking, saveInvoice, navigateScreen,
  } = workspace;

  return <>
    {activeScreen === "purchase" && (
      <PurchaseScreen initialInvoiceId={purchaseTargetId}
        items={items}
        suppliers={suppliers}
        purchaseInvoices={purchaseInvoices}
        currentPartnerName={currentPartner.name}
        onSavePurchase={mayWrite('purchases') ? async data=>{
          const invoice=await saveInvoice('purchase',data,()=>handleSavePurchase(data),()=>engine.state.purchaseInvoices);
          if(!invoice)return false;
          showToast(engine.isOffline ? 'مسودة فاتورة الشراء محفوظة على الجهاز وبانتظار المزامنة.' : 'تم حفظ فاتورة المشتريات '+invoice.invoiceNumber);
          return true;
        } : undefined}
        onReceiveRefund={mayWrite('purchases') && !engine.isOffline ? async (invoiceId, amount, date) => {
          if(engine.hasPending)throw Error('انتظر تأكيد الحفظ الحالي ثم أعد المحاولة.');
          engine.replace(receivePurchaseRefund(engine.state,invoiceId,amount,date,{id:member.userId,name:currentPartner.name}));
          await engine.flush();
          if(!engine.hasPending && engine.snapshot.status==='ready')showToast('تم تسجيل استلام المبلغ من المورد.');
        } : undefined}
        onDeletePurchaseInvoice={mayWrite('purchases') ? (invId) => {
          safeAction(() => {
            engine.replace(
              cancelPurchase(
                engine.state,
                invId,
                currentPartner.name,
              ),
            );
            addAuditLog("مرتجع", `إلغاء فاتورة مشتريات ${invId}`);
            showToast(
              "تم إلغاء الفاتورة وعكس المخزون والمديونية مع حفظ الأصل ومبلغ الاسترداد.",
            );
          });
        } : undefined}
        onQuickAddSupplier={mayWrite('contacts') ? (newSup) => {
          return safeAction(() => {
            checkSupplierDetails(newSup);
            const created: Supplier = {
              ...newSup,
              id: crypto.randomUUID(),
            };
            setSuppliers((prev) => [created, ...prev]);
            showToast(`✅ تمت إضافة المورد (${created.name})!`);
          });
        } : undefined}
        onQuickAddItem={mayWrite('catalog') ? (newItem) => {
          return safeAction(() => {
            const created: InventoryItem = {
              ...newItem,
              id: crypto.randomUUID(),
              openingStock: newItem.stock,
            };
            setItems((prev) => [created, ...prev]);
            showToast(`✅ تمت إضافة الصنف (${created.name}) للمخزن!`);
          });
        } : undefined}
        onBack={()=>{setActiveScreen(purchaseTargetId?'suppliers':'sections');setPurchaseTargetId(undefined);}}
      />
    )}

    {activeScreen==='recipes'&&<RecipesScreen items={items} drafts={cloud.state.catalogNameDrafts} initialTargetId={recipeTargetId} canManage={mayWrite('catalog')} onDefine={defineRecipe} onSave={async(target,recipe)=>{await saveRecipe(engine,target,recipe,{name:currentPartner.name,id:member?.userId});showToast('تم تأكيد حفظ الوصفة وتكلفتها');}} onBack={()=>setActiveScreen('sections')}/>}
    {activeScreen === "production" && (
      <ProductionAndRecipesScreen
        items={items}
        productionBatches={productionBatches}
        canRunProduction={mayWrite('production')}
        currentPartnerName={currentPartner.name}
        onOpenRecipes={()=>openRecipes()}
        reservedCodes={cloud.state.catalogNameDrafts.flatMap(d=>d.definition?[d.definition.code]:[])}
        onDefineRecipe={mayWrite('catalog')?defineRecipe:undefined}
        onExecuteProduction={(...args) => {
          try {
            return engine.transaction(() =>
              handleExecuteProduction(...args),
            );
          } catch (error) {
            return { ok: false, message: (error as Error).message };
          }
        }}
        onBack={() => setActiveScreen("home")}
      />
    )}

    {activeScreen === 'sales_pos' && (mayWrite('sales') ? <WholesaleInvoiceScreen items={items} customers={customers} currentPartnerName={currentPartner.name} onBack={()=>setActiveScreen('home')} onSaveSale={async data=>{
      const invoice=await saveInvoice('sale',data,()=>{
        const result=handleSaveSale(data);
        if(!result)throw Error('تعذر اعتماد الفاتورة');
        return result;
      },()=>engine.state.salesInvoices);
      if(!invoice)return false;
      if(engine.isOffline)showToast('مسودة فاتورة البيع محفوظة على الجهاز وبانتظار المزامنة.');
      else setReceiptModalInvoice(invoice);
      setActiveScreen('home');
      return true;
    }}/> : <OperationHeader title="فواتير الجملة" description="هذا الحساب يمكنه مراجعة سجل البيع. إنشاء الفواتير يتطلب صلاحية المبيعات." icon={Lock} onBack={()=>setActiveScreen('sections')}>
      <button type="button" onClick={()=>navigateScreen('sales_invoices')}>فتح سجل البيع</button>
    </OperationHeader>)}
    {activeScreen === 'cashier_sync' && <CashierDayScreen items={items} days={cashierDaysForDisplay} queued={queuedReports} canManage={mayWrite('cashier')} onBack={()=>setActiveScreen('home')} onAttach={async(date,report)=>{if(engine.hasPending)await confirmSave();engine.attachCashier(attachCashierReport(engine.state,date,report),report.file.sourceQueueId);await confirmSave();if(report.file.sourceQueueId)setQueuedReports(rows=>rows.filter(r=>r.id!==report.file.sourceQueueId));}} onApprove={async(id)=>{if(engine.isOffline)throw Error('اعتماد تقارير الكاشير يحتاج اتصالًا بالخادم.');engine.replace(approveCashierDay(engine.state,id,currentPartner.name));await confirmSave();}}/>}

    {activeScreen === "stocktaking" && (
      <StocktakingScreen
        items={items}
        canManage={mayWrite('stocktaking')}
        auditRecords={stocktakingRecords}
        employees={mayWrite('staff')?employees:[]}
        currentPartnerName={currentPartner.name}
        onCommitStocktaking={(...args) =>
          safeAction(() => handleCommitStocktaking(...args))
        }
        onBack={() => setActiveScreen("home")}
      />
    )}
  </>;
}
