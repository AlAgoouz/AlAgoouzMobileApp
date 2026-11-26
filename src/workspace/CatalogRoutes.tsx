import { hasInvalidNumbers } from "../lib/decimalInput";
import { saveCatalogNameDraft, saveCatalogNameDraftChange } from "../lib/catalogNameDrafts";
import React from "react";
import { adjustCatalogItem, canDeleteCatalogItem } from "../lib/catalogAdjustments";
import type { ActiveWorkspace } from './useWorkspaceController';

const ProductsCatalogScreen = React.lazy(() =>
  import("../components/ManagementScreens").then((module) => ({
    default: module.ProductsCatalogScreen,
  })),
);

const InventoryScreen = React.lazy(() =>
  import("../components/ManagementScreens").then((module) => ({
    default: module.InventoryScreen,
  })),
);

const ShortagesScreen = React.lazy(() =>
  import("../components/ManagementScreens").then((module) => ({
    default: module.ShortagesScreen,
  })),
);

export function CatalogRoutes({ workspace }: { workspace: ActiveWorkspace }) {
  const {
    mayWrite,
    activeScreen, setActiveScreen, showToast, cloud, engine, member, setMovementId, openRecipes,
    confirmSave, items, currentPartner, defineRecipe, safeAction, setItems, addAuditLog,
  } = workspace;

  return <>
    {activeScreen === "products" && (
      <ProductsCatalogScreen onOpenMovement={setMovementId}
        canManage={mayWrite('catalog')}
        onOpenRecipe={openRecipes}
        onDefineRecipe={mayWrite('catalog')?defineRecipe:undefined}
        nameDrafts={cloud.state.catalogNameDrafts}
        onChangeNameDraft={mayWrite('catalog')?(id,name)=>saveCatalogNameDraftChange(engine,id,name,{name:currentPartner.name,id:member?.userId}):undefined}
        onCompleteNameDraft={mayWrite('catalog')?(id,item)=>saveCatalogNameDraft(engine,id,item,{name:currentPartner.name,id:member?.userId}):undefined}
        items={items}
        onAddNewItem={(newItem) => {
          return safeAction(() => {
            if (
              hasInvalidNumbers([
                newItem.stock,
                newItem.minStock,
                newItem.costPrice,
                newItem.retailPrice,
                newItem.wholesalePrice,
              ]) ||
              !newItem.name.trim()
            ) {
              showToast(
                "راجع البيانات: الاسم مطلوب والأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
              );
              return;
            }
            setItems((prev) => [
              { ...newItem, id: crypto.randomUUID(), openingStock:newItem.stock },
              ...prev,
            ]);
            addAuditLog(
              "تعديل وصفة/صنف",
              `تعريف منتج جديد: ${newItem.name}`,
            );
            showToast(`✅ تمت إضافة المنتج (${newItem.name}) في الكتالوج!`);
          });
        }}
        onUpdateItem={(id, patch) => {
          return safeAction(() => {
            if (
              hasInvalidNumbers([
                patch.stock,
                patch.minStock,
                patch.costPrice,
                patch.lastPurchasePrice,
                patch.retailPrice,
                patch.wholesalePrice,
              ])
            ) {
              showToast(
                "الأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
              );
              return;
            }
            engine.replace(adjustCatalogItem(engine.state,id,patch,currentPartner.name));
            addAuditLog("تعديل وصفة/صنف", `تحديث تسعير/بيانات منتج`);
            showToast(
              "✅ تم تحديث المنتج وإعادة حساب تكلفة الوصفات المرتبطة!",
            );
          });
        }}
        onDeleteItem={async(id) => {
          if(engine.hasPending)await confirmSave();
          if(!engine.state.items.some(i=>i.id===id))return;
          if(!safeAction(() => {
            if (!canDeleteCatalogItem(engine.state,id)) {
              throw Error("لا يمكن حذف صنف مرتبط بوصفة أو فاتورة أو حركة مخزون.");
            }
            setItems((prev) => prev.filter((i) => i.id !== id));
            addAuditLog("تعديل وصفة/صنف", `حذف منتج من الكتالوج`);
          }))throw Error('تعذر حذف المنتج؛ راجع حالة الحفظ أو التنبيه');
          await confirmSave();showToast("تم حذف المنتج بنجاح");
        }}
        onNavigateToProduction={() => setActiveScreen("production")}
        onNavigateToInventory={() => setActiveScreen("inventory")}
        onNavigateToPurchase={() => setActiveScreen("purchase")}
        onBack={() => setActiveScreen("sections")}
      />
    )}

    {activeScreen === "inventory" && (
      <InventoryScreen onOpenMovement={setMovementId}
        items={items}
        canManage={mayWrite('catalog')}
        onAddNewItem={(newItem) => {
          return safeAction(() => {
            if (
              hasInvalidNumbers([
                newItem.stock,
                newItem.minStock,
                newItem.costPrice,
                newItem.retailPrice,
                newItem.wholesalePrice,
              ]) ||
              !newItem.name.trim()
            ) {
              showToast(
                "راجع البيانات: الاسم مطلوب والأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
              );
              return;
            }
            setItems((prev) => [
              { ...newItem, id: crypto.randomUUID() },
              ...prev,
            ]);
            addAuditLog("تعديل وصفة/صنف", `إضافة صنف: ${newItem.name}`);
            showToast(`✅ تمت إضافة (${newItem.name}) للمخزن!`);
          });
        }}
        onUpdateItemPricesAndStock={(id, patch) => {
          return safeAction(() => {
            if (
              hasInvalidNumbers([
                patch.stock,
                patch.minStock,
                patch.costPrice,
                patch.retailPrice,
                patch.wholesalePrice,
              ])
            ) {
              showToast(
                "الأرصدة والأسعار يجب أن تكون أرقامًا صحيحة غير سالبة.",
              );
              return;
            }
            engine.replace(adjustCatalogItem(engine.state,id,patch,currentPartner.name));
            addAuditLog("تعديل وصفة/صنف", `تعديل رصيد/سعر صنف`);
            showToast("✅ تم تحديث الصنف وتكلفة الوصفات!");
          });
        }}
        onDeleteItem={(id) => {
          safeAction(() => {
            if (!canDeleteCatalogItem(engine.state,id)) {
              showToast("لا يمكن حذف صنف مرتبط بوصفة أو فاتورة.");
              return;
            }
            setItems((prev) => prev.filter((i) => i.id !== id));
            addAuditLog("تعديل وصفة/صنف", `حذف صنف من المخزن`);
            showToast("🗑️ تم حذف الصنف من المخزن!");
          });
        }}
        onNavigateToProduction={() => setActiveScreen("production")}
        onBack={() => setActiveScreen("home")}
      />
    )}

    {activeScreen === "shortages" && (
      <ShortagesScreen onOpenMovement={setMovementId}
        items={items}
        onNavigateToPurchase={() => setActiveScreen("purchase")}
        onNavigateToProduction={() => setActiveScreen("production")}
        onBack={() => setActiveScreen("home")}
      />
    )}
  </>;
}
