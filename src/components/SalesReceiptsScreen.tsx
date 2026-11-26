import { ReceiptText as HeaderReceiptText } from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {CashierDayHistory} from './CashierDayHistory';
import type {CashierDay} from '../types/erp';
import React, { useState, useMemo } from "react";
import {RecordPagination,useRecordPage} from './RecordPagination';
import { RotateCcw, Printer, Trash2, MessageCircle } from 'lucide-react';
import { Customer, SalesInvoice } from "../types/erp";
import { InvoiceReceiptModal } from "./ReceiptAndStatementModals";

export const SalesInvoicesAndReturnsScreen: React.FC<{
  salesInvoices: SalesInvoice[];
  cashierDays?:CashierDay[];
  customers: Customer[];
  onReturnInvoice: (invoiceId: string) => void;
  onDeleteInvoice: (invoiceId: string) => void;
  onBack: () => void;
}> = ({
  salesInvoices,
  cashierDays=[],
  customers,
  onReturnInvoice,
  onDeleteInvoice,
  onBack,
}) => {
  const [historyKind,setHistoryKind]=useState<'wholesale'|'cashier'|'legacy'>(()=>cashierDays.length?'cashier':salesInvoices.some(i=>i.saleType!=='wholesale')?'legacy':'wholesale');
  const invoiceRecords=useMemo(()=>salesInvoices.filter(i=>historyKind==='wholesale'?i.saleType==='wholesale':i.saleType!=='wholesale'),[salesInvoices,historyKind]);
  const [selectedReceiptInv, setSelectedReceiptInv] =
    useState<SalesInvoice | null>(null);
  const [invoiceSearch,setInvoiceSearch]=useState('');
  const matchingInvoices=useMemo(()=>{
    const q=invoiceSearch.trim().toLocaleLowerCase();
    return q?invoiceRecords.filter(inv=>[inv.invoiceNumber,inv.customerName,inv.date,...inv.items.map(line=>line.itemName)].some(text=>text.toLocaleLowerCase().includes(q))):invoiceRecords;
  },[invoiceRecords,invoiceSearch]);
  const invoicePage=useRecordPage(matchingInvoices,invoiceSearch);

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title={<>سجل المبيعات ( {salesInvoices.length} )</>} description={<>فواتير الجملة وأيام الكاشير والسجل السابق.</>} icon={HeaderReceiptText} onBack={onBack}><button
          type="button"
          onClick={() => window.print()}
          aria-label="طباعة الصفحة الحالية"
          title="طباعة الصفحة الحالية"
        >
          <Printer className="w-5 h-5" aria-hidden="true" />
        </button></OperationHeader>

      <div className="operation-tab-strip">
        <nav aria-label="نوع سجل المبيعات" className="record-tabs">
          {([{id:'wholesale',label:'فواتير الجملة'},{id:'cashier',label:'مبيعات أيام الكاشير'},{id:'legacy',label:'السجل السابق'}] as const).map(t=><button type="button" key={t.id} aria-pressed={historyKind===t.id} onClick={()=>setHistoryKind(t.id)}>{t.label}</button>)}
        </nav>
      </div>
      {historyKind==='cashier'?<CashierDayHistory days={cashierDays}/>:<>
      <div className="record-workspace">
        <label className="record-search">البحث في الفواتير
          <input aria-label="بحث في كل الفواتير" placeholder="رقم الفاتورة أو العميل أو التاريخ أو الصنف" value={invoiceSearch} onChange={event=>setInvoiceSearch(event.target.value)} />
        </label>
        <RecordPagination {...invoicePage} />
        {matchingInvoices.length === 0 ? (
          <p className="record-state">
            {invoiceSearch.trim() ? 'لا توجد فواتير مطابقة للبحث.' : 'لا توجد فواتير مسجلة حالياً.'}
          </p>
        ) : (
          <div className="record-grid">
            {invoicePage.visible.map((inv) => (
              <article
                key={inv.id}
                className={`record-card space-y-3 ${
                  inv.isReturned ? "border-status-danger-line bg-status-danger-bg/40 opacity-85" : ""
                }`}
              >
                <div className="record-heading mb-0">
                  <div>
                    <p className="font-extrabold text-gold" dir="ltr">
                      #{inv.invoiceNumber} • {inv.date}
                    </p>
                    <h2 className="font-extrabold text-ink-strong">
                      {inv.customerName}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="record-badge">
                      {inv.isReturned
                        ? "مرتجع"
                        : inv.saleType === "wholesale"
                          ? "جملة"
                          : inv.saleType === "cashier_sync"
                            ? "كاشير"
                            : "محل"}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteInvoice(inv.id)}
                      className="action-button text-status-danger border-status-danger-line"
                      disabled
                      aria-label="حذف المستند المعتمد معطل"
                      title="حذف المستند المعتمد معطل؛ استخدم المرتجع"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="bg-surface-sunken rounded-md p-2.5 space-y-1 border border-line-subtle text-xs">
                  {inv.items.map((line, idx) => (
                    <div key={idx} className="flex justify-between font-bold">
                      <span>
                        • {line.itemName} ({line.quantity} {line.unitLabel})
                      </span>
                      <span>{line.totalPrice} ج.م</span>
                    </div>
                  ))}
                </div>

                <dl className="record-facts mb-0">
                  <div>
                    <dt>الإجمالي</dt>
                    <dd>{inv.totalAmount} ج.م</dd>
                  </div>
                  <div>
                    <dt>الربح</dt>
                    <dd className="text-status-ok">+{inv.netProfit.toFixed(1)} ج.م</dd>
                  </div>
                </dl>

                <div className="record-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedReceiptInv(inv)}
                    className="record-action flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>طباعة / واتساب</span>
                  </button>
                  {inv.isReturned && inv.returnRefundAmount !== undefined && (
                    <p className="text-xs text-status-warn">
                      مبلغ الاسترداد المسجل:{" "}
                      {inv.returnRefundAmount.toLocaleString("ar-EG")} ج.م
                    </p>
                  )}
                  {!inv.isReturned && (<details className="w-full"><summary className="action-button w-full cursor-pointer justify-center">تسوية استثنائية</summary>
                    <button
                      type="button"
                      onClick={() => onReturnInvoice(inv.id)}
                      className="action-button w-full mt-2 text-status-warn border-status-warn-line"
                    >
                      <RotateCcw className="w-4 h-4" aria-hidden="true" />
                      تسجيل مرتجع استثنائي
                    </button></details>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <RecordPagination {...invoicePage} />
      </div>
      </>}
      {selectedReceiptInv && (
        <InvoiceReceiptModal
          invoice={selectedReceiptInv}
          customerPhone={
            customers.find(
              (c) =>
                c.id === selectedReceiptInv.customerId ||
                c.name === selectedReceiptInv.customerName,
            )?.phone || ""
          }
          onClose={() => setSelectedReceiptInv(null)}
        />
      )}
    </div>
  );
};
