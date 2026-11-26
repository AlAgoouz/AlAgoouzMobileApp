import type {AuditLogEntry, EmployeeTransaction, InventoryItem, Partner, ProductionBatch, PurchaseInvoice, SalesInvoice, SalesInvoiceItem, StocktakingAuditRecord, StocktakingItemVariance} from '../types/erp';
import type {StoreEngine} from './storeEngine';
import {businessDate} from './dates';
import {documentNumberPrefix, nextSequentialNumber} from './documentNumbers';
import {unitLabel as displayUnit} from './units';
import {productionNeeds, deductInventory} from './inventory';
import {receiveStock} from './costing';
import {receivePurchaseInventory} from './purchaseInventory';
import {recalculateRecipeCosts} from './itemCosts';
import {checkPurchase, prepareSale, checkStocktaking} from './operationChecks';
import {checkSupplierDetails, checkCustomerDetails} from './contactDetails';
import {divideMoney, multiplyMoney, roundMoney, sumMoney} from './money';
import {recordEmployeeAction} from './payroll';

type ToastTone = 'ok' | 'warn' | 'danger' | 'info';
interface InventoryActionsOptions {
  engine: StoreEngine;
  currentPartner: Pick<Partner,'name'>;
  requireFinancialPartner: () => Partner;
  addAuditLog: (type: AuditLogEntry['actionType'], description: string, amount?: number) => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

export function createInventoryActions({engine, currentPartner, requireFinancialPartner, addAuditLog, showToast}: InventoryActionsOptions) {
  // 1. تنفيذ أمر إنتاج وتخليط توليفة في قسم الإنتاج
  const handleExecuteProduction = (
    blendId: string,
    quantityKg: number,
    notes: string,
  ): { ok: boolean; message: string } => {
    const date = businessDate();
    const blend = engine.state.items.find((i) => i.id === blendId);
    if (!blend || !blend.recipe || blend.recipe.length === 0) {
      return { ok: false, message: "هذه التوليفة ليس لها وصفة محددة بعد." };
    }

    let needs: Map<string, number>;
    try {
      needs = productionNeeds(blend, quantityKg, engine.state.items);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }

    const consumedDetails: ProductionBatch["ingredientsConsumed"] = [];
    let totalBatchCost = 0;

    const updatedCatalog = engine.state.items.map((item) => {
      const needed = needs.get(item.id);
      if (needed !== undefined) {
        const usedInBase = Number(needed.toFixed(6));
        const ingCost = multiplyMoney(usedInBase, item.costPrice);
        totalBatchCost = sumMoney([totalBatchCost, ingCost]);
        consumedDetails.push({
          ingredientId: item.id,
          ingredientName: item.name,
          quantityUsed: usedInBase,
          displayQuantity:
            item.baseUnit === "kg"
              ? `${usedInBase} كجم (${Math.round(usedInBase * 1000)} جم)`
              : `${usedInBase} ${displayUnit(item.baseUnit)}`,
          cost: ingCost,
        });
        return {
          ...item,
          stock: Number((item.stock - usedInBase).toFixed(6)),
        };
      }
      return item;
    });

    const unitCostPerKg = divideMoney(totalBatchCost, quantityKg);

    const batchId = crypto.randomUUID();
    const finalCatalog = updatedCatalog.map((item) => {
      if (item.id === blendId) {
        return receiveStock(item, quantityKg, unitCostPerKg, {id:batchId,date,type:'production'});
      }
      return item;
    });

    const newBatch: ProductionBatch = {
      id: batchId,
      batchNumber: nextSequentialNumber(
        engine.state.productionBatches.map((b) => b.batchNumber),
        documentNumberPrefix("production", date),
        15,
      ),
      date,
      blendId: blend.id,
      blendName: blend.name,
      quantityProducedKg: quantityKg,
      unitCostPerKg,
      totalBatchCost: totalBatchCost,
      ingredientsConsumed: consumedDetails,
      partnerName: currentPartner.name,
      notes,
    };

    engine.field('items', recalculateRecipeCosts(finalCatalog));
    engine.field('productionBatches', (prev) => [newBatch, ...prev]);
    addAuditLog(
      "إنتاج توليفة",
      `تم تصنيع ${quantityKg} كجم من (${blend.name}) وسحب الحبوب الخام والتحويجة من المخزن وإضافتها لرصيد التوليفة`,
      totalBatchCost,
    );
    showToast(
      `✅ تم تصنيع ${quantityKg} كجم من (${blend.name}) وإضافتها لرصيد المخزن بنجاح!`,
    );
    return {
      ok: true,
      message: `تم سحب الخامات من المخزن وإضافة ${quantityKg} كجم (${
        quantityKg * 1000
      } جرام) إلى رصيد (${blend.name}) بنجاح!`,
    };
  };

  // 2. حفظ فاتورة شراء جديدة وتحديث متوسط التكلفة المرجح (WAC) والوصفات
  const handleSavePurchase = (
    invoiceData: Omit<PurchaseInvoice, "id" | "invoiceNumber">,
  ) => {
    invoiceData = {...invoiceData, accountingVersion:2};
    const supplier=engine.state.suppliers.find(s=>s.id===invoiceData.supplierId);
    if(!supplier)throw Error('اختر موردًا مسجلًا');
    checkSupplierDetails(supplier);
    invoiceData={...invoiceData,supplierName:supplier.name};
    checkPurchase(invoiceData, engine.state.items);
    if (
      !invoiceData.items.length ||
      invoiceData.items.some(
        (l) =>
          !Number.isFinite(l.quantity) ||
          l.quantity <= 0 ||
          !Number.isFinite(l.purchasePrice) ||
          l.purchasePrice < 0 ||
          (l.newRetailPrice !== undefined &&
            (!Number.isFinite(l.newRetailPrice) || l.newRetailPrice < 0)) ||
          (l.newWholesalePrice !== undefined &&
            (!Number.isFinite(l.newWholesalePrice) || l.newWholesalePrice < 0)),
      ) ||
      !Number.isFinite(invoiceData.totalAmount) ||
      invoiceData.totalAmount < 0 ||
      !Number.isFinite(invoiceData.paidAmount) ||
      invoiceData.paidAmount < 0 ||
      !Number.isFinite(invoiceData.remainingAmount) ||
      invoiceData.remainingAmount < 0 ||
      !engine.state.suppliers.some((s) => s.id === invoiceData.supplierId)
    )
      throw new Error(
        "راجع الأصناف والكميات والأسعار والمورد والمبالغ قبل حفظ الفاتورة",
      );
    const invNum = `PUR-${crypto.randomUUID().slice(0, 8)}`;
    const newInvoice: PurchaseInvoice = {
      ...invoiceData,
      id: crypto.randomUUID(),
      invoiceNumber: invNum,
      createdAt: new Date().toISOString(),
    };
    engine.field('items', receivePurchaseInventory(engine.state.items, newInvoice));
    engine.field('purchaseInvoices', (prev) => [newInvoice, ...prev]);

    engine.field('suppliers', (prev) =>
      prev.map((sup) =>
        sup.id === invoiceData.supplierId
          ? {
              ...sup,
              balance: sumMoney([sup.balance, invoiceData.remainingAmount]),
              totalPurchases: sumMoney([sup.totalPurchases, invoiceData.totalAmount]),
              invoicesCount: sup.invoicesCount + 1,
            }
          : sup,
      ),
    );

    addAuditLog(
      "شراء",
      `فاتورة شراء #${invNum} من (${invoiceData.supplierName}) وتحديث متوسط التكلفة (WAC) وتكلفة التوليفات المرتبطة`,
      invoiceData.totalAmount,
    );
    return newInvoice;
  };

  // دالة خصم الأصناف من المخزون (خصم مباشر للبن والتوليفات الجاهزة، وفك الوصفة للمشروبات!)

  // 3. حفظ فاتورة بيع (جملة أو قطاعي مباشر)
  const handleSaveSale = (
    saleData: Omit<SalesInvoice, "id" | "invoiceNumber">,
  ) => {
    let updatedInventory: InventoryItem[];
    let invoiceItems: SalesInvoiceItem[];
    let liveTotalCost = 0;
    try {
      if(saleData.saleType!=='wholesale'||saleData.items.some(line=>engine.state.items.find(i=>i.id===line.itemId)?.category!=='manufactured_blend'))throw Error('فواتير البيع الجديدة للتوليفات بالجملة فقط');
      const liveItems = engine.state.items;
      const customer=engine.state.customers.find(c=>c.id===saleData.customerId);
      if(!customer)throw Error('اختر عميلًا مسجلًا');
      checkCustomerDetails(customer);
      saleData={...saleData,customerName:customer.name};
      if (
        saleData.saleType === "wholesale" &&
        !engine.state.customers.some(
          (c) => c.id === saleData.customerId,
        )
      )
        throw new Error("اختر عميل جملة موجودًا قبل حفظ الفاتورة");
      if (
        !saleData.items.length ||
        saleData.items.some(
          (l) =>
            !Number.isFinite(l.quantity) ||
            l.quantity <= 0 ||
            !Number.isFinite(l.unitPrice) ||
            l.unitPrice < 0,
        )
      )
        throw new Error("أصناف الفاتورة أو كمياتها غير صالحة");
      if (
        !Number.isFinite(saleData.subtotal) ||
        saleData.subtotal < 0 ||
        !Number.isFinite(saleData.totalAmount) ||
        saleData.totalAmount < 0 ||
        !Number.isFinite(saleData.discount) ||
        saleData.discount < 0 ||
        saleData.discount > saleData.subtotal + 0.011 ||
        !Number.isFinite(saleData.paidAmount) ||
        saleData.paidAmount < 0 ||
        !Number.isFinite(saleData.remainingAmount) ||
        saleData.remainingAmount < 0
      )
        throw new Error("مبالغ الفاتورة غير صالحة");
      const prepared = prepareSale(saleData, liveItems);
      invoiceItems = prepared.items;
      liveTotalCost = prepared.totalCost;
      updatedInventory = deductInventory(invoiceItems, liveItems);
    } catch (error) {
      showToast((error as Error).message, 'danger');
      return false;
    }
    const prefix = saleData.saleType === "wholesale" ? "WH" : "POS";
    const invNum = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    const newSale: SalesInvoice = {
      ...saleData,
      id: crypto.randomUUID(),
      invoiceNumber: invNum,
      items: invoiceItems,
      totalCost: liveTotalCost,
      netProfit: sumMoney([saleData.totalAmount, -liveTotalCost]),
    };

    engine.field('items', updatedInventory);
    engine.field('salesInvoices', (prev) => [newSale, ...prev]);

    if (saleData.customerId) {
      engine.field('customers', (prev) =>
        prev.map((c) =>
          c.id === saleData.customerId
            ? {
                ...c,
                balance: sumMoney([c.balance, saleData.remainingAmount]),
                totalSales: sumMoney([c.totalSales, saleData.totalAmount]),
                invoicesCount: c.invoicesCount + 1,
                lastPurchaseDate: saleData.date,
              }
            : c,
        ),
      );
    }

    addAuditLog(
      saleData.saleType === "wholesale" ? "بيع جملة" : "بيع محل",
      `فاتورة ${
        saleData.saleType === "wholesale" ? "بيع جملة" : "بيع محل"
      } #${invNum} للعميل (${saleData.customerName}) وخصم الأصناف من المخزن`,
      saleData.totalAmount,
    );
    showToast(
      `تم تسجيل الفاتورة #${invNum}؛ تابع حالة حفظ السحابة أعلى الشاشة.`,
    );
    return newSale;
  };

  // 5. اعتماد محضر الجرد الفعلي على الميزان وتحديث المخزن
  const handleCommitStocktaking = (
    variances: StocktakingItemVariance[],
    notes: string,
    chargeShortageToEmployeeId?: string,
  ) => {
    const date = businessDate();
    variances = checkStocktaking(variances, engine.state.items);
    if (
      chargeShortageToEmployeeId &&
      !engine.state.employees.some((e) => e.id === chargeShortageToEmployeeId)
    )
      throw new Error("العامل المختار لتحميل العجز غير موجود");
    const changed = variances.filter((v) => Math.abs(v.difference) > 0.0001);
    const totalShortage = changed
      .filter((v) => v.difference < 0)
      .reduce((s, v) => s + Math.abs(v.financialDifference), 0);
    const totalSurplus = changed
      .filter((v) => v.difference > 0)
      .reduce((s, v) => s + v.financialDifference, 0);

    // تحديث الأرصدة الفعلية في المخزن
    engine.field('items', (prev) =>
      prev.map((item) => {
        const found = variances.find((v) => v.itemId === item.id);
        if (!found) return item;
        return { ...item, stock: found.actualStock };
      }),
    );

    const newRecord: StocktakingAuditRecord = {
      id: crypto.randomUUID(),
      auditNumber: nextSequentialNumber(
        engine.state.stocktakingRecords.map((r) => r.auditNumber),
        documentNumberPrefix("stocktaking", date),
        2,
      ),
      date,
      partnerName: currentPartner.name,
      notes,
      totalShortageValue: roundMoney(totalShortage),
      totalSurplusValue: roundMoney(totalSurplus),
      netVarianceValue: sumMoney([totalSurplus, -totalShortage]),
      itemsAudited: variances,
    };

    engine.field('stocktakingRecords', (prev) => [newRecord, ...prev]);

    // إذا تم اختيار تحميل العجز على أحد العمال
    if (chargeShortageToEmployeeId && totalShortage > 0) {
      handleRecordEmployeeAction(
        chargeShortageToEmployeeId,
        "خصم/عجز",
        roundMoney(totalShortage),
        `تحميل عجز محضر الجرد #${newRecord.auditNumber}`,
      );
    }

    addAuditLog(
      "جرد مخزن",
      `اعتماد محضر الجرد الفعلي #${newRecord.auditNumber} (${changed.length} فروقات على الميزان) — صافي الفرق: ${newRecord.netVarianceValue} ج.م`,
      Math.abs(newRecord.netVarianceValue),
    );
    showToast(
      `✅ تم اعتماد محضر الجرد #${newRecord.auditNumber} وتحديث أرصدة المخزن!`,
    );
  };

  // 6. تسجيل حركة للعامل (سلفة، يومية حضور، خصم/عجز، مكافأة، صرف راتب)
  const handleRecordEmployeeAction = (employeeId:string,type:EmployeeTransaction['type'],amount:number,notes:string,paidFrom?:EmployeeTransaction['paidFrom']) => {
    engine.replace(recordEmployeeAction(engine.state,employeeId,type,amount,notes,requireFinancialPartner().id,paidFrom));
    addAuditLog('شؤون عمال', `${type} للعامل: ${employeeId} — ${notes}`,amount);
    showToast('تم تسجيل حركة العامل وربط الصرف بمصروفه؛ تابع تأكيد الحفظ.');
  };

  return {handleExecuteProduction, handleSavePurchase, handleSaveSale, handleCommitStocktaking, handleRecordEmployeeAction};
}
