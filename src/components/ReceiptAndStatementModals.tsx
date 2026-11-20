import { serverInvoicePdf, downloadExport } from '../lib/reportExports';
import { Modal } from './Modal';
import { RecordPagination, useRecordPage } from './RecordPagination';
import React, { useState, useMemo } from 'react';
import { escapePrintData } from '../lib/safeHtml';
import { businessDate } from '../lib/dates';
import { whatsAppNumber } from '../lib/contactDetails';
import { Printer, MessageCircle, ArrowDownLeft, ArrowUpRight, Plus, Trash2, CheckCircle2, Phone } from 'lucide-react';
import {
  SalesInvoice,
  PurchaseInvoice,
  Supplier,
  Customer,
  AccountPaymentRecord,
} from '../types/erp';

// تنسيق رقم الموبايل المصري للواتساب
export function formatEgyptWhatsAppPhone(rawPhone?: string): string {
  if (!rawPhone) return '';
  try {
    return whatsAppNumber(rawPhone);
  } catch {
    return '';
  }
}

function openPrintDocument({
  title,
  windowFeatures,
  widthCss,
  bodyHtml,
}: {
  title: string;
  windowFeatures: string;
  widthCss: string;
  bodyHtml: string;
}) {
  const printWin = window.open('', '_blank', windowFeatures);
  if (!printWin) {
    window.print();
    return;
  }

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>${title}</title>
      <style>
        body { font-family: 'Cairo', 'Tahoma', sans-serif; ${widthCss} margin: 0 auto; padding: 16px; color: #241710; background: #fff; }
        .header { text-align: center; border-bottom: 2px solid #241710; padding-bottom: 10px; margin-bottom: 12px; }
        .title { font-size: 18px; font-weight: 800; margin: 4px 0 2px; }
        .sub { font-size: 12px; color: #594738; }
        .meta { font-size: 12px; margin-bottom: 12px; line-height: 1.65; }
        .summary { display: flex; justify-content: space-between; gap: 12px; background: #FBF9F5; padding: 12px; border: 1px solid #9B6D28; border-radius: 10px; margin-bottom: 14px; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; }
        th { background: #241710; color: #F7EBD0; padding: 7px 6px; text-align: right; }
        td { padding: 7px 6px; border-bottom: 1px solid #DDD1C2; }
        .totals { margin-top: 10px; border-top: 2px solid #241710; padding-top: 8px; font-size: 13px; line-height: 1.75; }
        .footer { text-align: center; margin-top: 14px; font-size: 12px; border-top: 1px dashed #8C7A66; padding-top: 8px; color: #594738; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>${bodyHtml}</body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  printWin.print();
}

// ============================================================================
// 1. نافذة طباعة الفاتورة وإرسالها واتساب (InvoiceReceiptModal)
// ============================================================================
interface InvoiceReceiptModalProps {
  invoice: SalesInvoice;
  customerPhone?: string;
  onOpenCustomer?: (id: string) => void;
  onClose: () => void;
}

export const InvoiceReceiptModal: React.FC<InvoiceReceiptModalProps> = ({
  invoice,
  customerPhone = '',
  onOpenCustomer,
  onClose,
}) => {
  const [phoneInput, setPhoneInput] = useState(customerPhone);
  const isWholesale = invoice.saleType === 'wholesale';
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMessage, setPdfMessage] = useState('');
  const [shareFile, setShareFile] = useState<File>();

  const exportPdf = async (forShare: boolean) => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfMessage('');
    try {
      const file = await serverInvoicePdf(invoice.id, invoice.invoiceNumber);
      if (forShare && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        setShareFile(file);
        setPdfMessage('الملف جاهز. اضغط على مشاركة الملف واختر واتساب.');
      } else {
        downloadExport(file);
        if (forShare) setPdfMessage('تم تنزيل الفاتورة. افتح محادثة واتساب وأرفق الملف.');
      }
    } catch (error) {
      setPdfMessage(
        error instanceof Error ? error.message : 'تعذر تجهيز الفاتورة. راجع الاتصال وتسجيل الدخول ثم أعد المحاولة.',
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const sharePdf = async () => {
    if (!shareFile || pdfBusy) return;
    setPdfBusy(true);
    try {
      await navigator.share({ files: [shareFile], title: `فاتورة ${invoice.invoiceNumber}` });
      setPdfMessage('');
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      downloadExport(shareFile);
      setPdfMessage('تم تنزيل الفاتورة. افتح محادثة واتساب وأرفق الملف.');
    } finally {
      setPdfBusy(false);
    }
  };

  const buildWhatsAppInvoiceText = () => {
    const lines: string[] = [
      `☕ *بُن العجوز — أصل المزاج*`,
      `🧾 *فاتورة ${
        invoice.saleType === 'wholesale' ? 'مبيعات جملة' : invoice.saleType === 'retail' ? 'بيع محل' : 'كاشير'
      }*`,
      `رقم الفاتورة: *#${invoice.invoiceNumber}*`,
      `التاريخ: ${invoice.date}`,
      `العميل: *${invoice.customerName}*`,
      `────────────────`,
      `*الأصناف:*`,
    ];

    invoice.items.forEach((it, idx) => {
      lines.push(
        `${idx + 1}. *${it.itemName}* (${it.quantity} ${it.unitLabel}) = *${it.totalPrice.toLocaleString('ar-EG')} ج.م*`,
      );
    });

    lines.push(`────────────────`);
    if (invoice.discount > 0) {
      lines.push(`الإجمالي قبل الخصم: ${invoice.subtotal.toLocaleString('ar-EG')} ج.م`);
      lines.push(`الخصم: -${invoice.discount.toLocaleString('ar-EG')} ج.م`);
    }
    lines.push(`💰 *الإجمالي المطلوب: ${invoice.totalAmount.toLocaleString('ar-EG')} ج.م*`);
    lines.push(`✅ المدفوع (${invoice.paymentMethod}): ${invoice.paidAmount.toLocaleString('ar-EG')} ج.م`);
    if (invoice.remainingAmount > 0) {
      lines.push(`⚠️ *المتبقي آجل: ${invoice.remainingAmount.toLocaleString('ar-EG')} ج.م*`);
    } else {
      lines.push(`✨ الفاتورة خالصة بالكامل`);
    }
    lines.push(`────────────────`);
    lines.push(`شكراً لتعاملكم مع *بُن العجوز* ☕`);

    return lines.join('\n');
  };

  const handleSendWhatsApp = () => {
    const formattedPhone = formatEgyptWhatsAppPhone(phoneInput);
    const base = `https://wa.me/${formattedPhone}`;
    const url = isWholesale ? base : `${base}?text=${encodeURIComponent(buildWhatsAppInvoiceText())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePrintReceipt = () => {
    const printInvoice = escapePrintData(invoice);
    const rowsHtml = printInvoice.items
      .map(
        (it) => `
        <tr>
          <td style="font-weight:bold;">${it.itemName}</td>
          <td style="text-align:center;">${it.quantity} ${it.unitLabel}</td>
          <td style="text-align:left;font-weight:bold;">${it.totalPrice.toLocaleString('ar-EG')} ج.م</td>
        </tr>`,
      )
      .join('');

    openPrintDocument({
      title: `فاتورة #${printInvoice.invoiceNumber} - بُن العجوز`,
      windowFeatures: 'width=420,height=700',
      widthCss: 'width: 320px;',
      bodyHtml: `
        <div class="header">
          <div class="title">بُن العجوز — أصل المزاج</div>
          <div class="sub">فاتورة ${printInvoice.saleType === 'wholesale' ? 'مبيعات جملة' : 'مبيعات المحل'}</div>
        </div>
        <div class="meta">
          <div><b>رقم الفاتورة:</b> #${printInvoice.invoiceNumber}</div>
          <div><b>التاريخ:</b> ${printInvoice.date}</div>
          <div><b>العميل:</b> ${printInvoice.customerName}</div>
          <div><b>المسؤول:</b> ${printInvoice.partnerName}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th style="text-align:center;">الكمية</th>
              <th style="text-align:left;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="totals">
          ${printInvoice.discount > 0 ? `<div>الإجمالي الفرعي: ${printInvoice.subtotal} ج.م | الخصم: ${printInvoice.discount} ج.م</div>` : ''}
          <div style="font-size:15px;font-weight:800;">الإجمالي المطلوب: ${printInvoice.totalAmount.toLocaleString('ar-EG')} ج.م</div>
          <div>المدفوع (${printInvoice.paymentMethod}): <b>${printInvoice.paidAmount.toLocaleString('ar-EG')} ج.م</b></div>
          ${
            printInvoice.remainingAmount > 0
              ? `<div style="color:#B42318;font-weight:800;">المتبقي آجل: ${printInvoice.remainingAmount.toLocaleString('ar-EG')} ج.م</div>`
              : `<div>حالة الفاتورة: خالصة بالكامل ✓</div>`
          }
        </div>
        <div class="footer">شكراً لتعاملكم مع بُن العجوز — أصل المزاج</div>
      `,
    });
  };

  return (
    <Modal
      title="بُن العجوز — أصل المزاج"
      description={`فاتورة #${invoice.invoiceNumber} • ${invoice.date}`}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="action-button bg-status-ok-bg border-status-ok-line text-status-ok font-extrabold"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>{isWholesale ? 'فتح محادثة واتساب' : 'إرسال واتساب'}</span>
          </button>
          <button type="button" onClick={handlePrintReceipt} className="operation-primary font-extrabold">
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>طباعة الفاتورة</span>
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="bg-surface-sunken rounded-lg p-3.5 border border-line flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0 space-y-1">
            <div className="text-xs text-ink-faint">العميل</div>
            <div className="font-extrabold text-ink-strong text-sm">{invoice.customerName}</div>
            {invoice.customerId && onOpenCustomer && (
              <button
                type="button"
                className="record-action record-action--inline"
                onClick={() => onOpenCustomer(invoice.customerId!)}
              >
                فتح كشف العميل
              </button>
            )}
          </div>
          <div className="text-end shrink-0">
            <div className="text-xs text-ink-faint">الدفع</div>
            <div className="font-extrabold text-gold">{invoice.paymentMethod}</div>
          </div>
        </div>

        {/* جدول الأصناف */}
        <div className="bg-surface-card rounded-lg border border-line overflow-hidden">
          <div className="bg-espresso text-gold-highlight px-3 py-2.5 text-xs font-extrabold grid grid-cols-12 gap-2">
            <span className="col-span-6">الصنف</span>
            <span className="col-span-3 text-center">الكمية</span>
            <span className="col-span-3 text-end">الإجمالي</span>
          </div>
          <div className="divide-y divide-line-subtle text-xs">
            {invoice.items.map((it, idx) => (
              <div key={idx} className="px-3 py-2.5 grid grid-cols-12 gap-2 items-center">
                <span className="col-span-6 font-extrabold text-ink-strong">{it.itemName}</span>
                <span className="col-span-3 text-center text-xs text-ink-faint font-bold [font-variant-numeric:tabular-nums]">
                  {it.quantity} {it.unitLabel}
                </span>
                <span className="col-span-3 text-end font-extrabold text-ink-strong [font-variant-numeric:tabular-nums]">
                  {it.totalPrice.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* الإجماليات */}
        <div className="bg-surface-sunken rounded-lg p-3.5 border border-line space-y-1.5 text-xs [font-variant-numeric:tabular-nums]">
          {invoice.discount > 0 && (
            <div className="flex justify-between text-ink-default">
              <span>الخصم:</span>
              <span className="font-bold">-{invoice.discount} ج.م</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-extrabold text-ink-strong">
            <span>الإجمالي المطلوب:</span>
            <span>{invoice.totalAmount.toLocaleString('ar-EG')} ج.م</span>
          </div>
          <div className="flex justify-between text-status-ok font-bold">
            <span>المدفوع:</span>
            <span>{invoice.paidAmount.toLocaleString('ar-EG')} ج.م</span>
          </div>
          {invoice.remainingAmount > 0 && (
            <div className="flex justify-between text-status-danger font-extrabold pt-1.5 border-t border-line-subtle">
              <span>المتبقي آجل:</span>
              <span>{invoice.remainingAmount.toLocaleString('ar-EG')} ج.م</span>
            </div>
          )}
        </div>

        {/* رقم واتساب العميل */}
        <div className="bg-surface-sunken rounded-lg p-3 border border-line space-y-1.5">
          <label className="text-xs font-extrabold text-ink flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-status-ok" aria-hidden="true" />
            رقم موبايل العميل لإرسال الفاتورة واتساب:
          </label>
          <input
            type="text"
            dir="ltr"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="010xxxxxxxx (أو اتركه فارغاً لاختيار جهة اتصال)"
            className="operation-input"
          />
        </div>

        {isWholesale && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" disabled={pdfBusy} onClick={() => void exportPdf(false)} className="action-button">
              {pdfBusy ? 'جارٍ تجهيز الفاتورة…' : 'تنزيل الفاتورة PDF'}
            </button>
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void (shareFile ? sharePdf() : exportPdf(true))}
              className="action-button"
            >
              {shareFile ? 'مشاركة الملف' : 'تجهيز PDF للمشاركة'}
            </button>
          </div>
        )}
        {pdfMessage && (
          <p role="status" className="text-xs font-bold text-ink bg-surface-sunken border border-line rounded-md p-2.5">
            {pdfMessage}
          </p>
        )}
      </div>
    </Modal>
  );
};

// ============================================================================
// 2. نافذة كشف الحساب التفصيلي للمورد أو العميل (AccountStatementModal)
// ============================================================================
interface AccountStatementModalProps {
  mode: 'supplier' | 'customer';
  target: Supplier | Customer;
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  accountPayments: AccountPaymentRecord[];
  onRecordPayment: (amount: number, notes: string) => boolean;
  onOpenInvoice?: (id: string) => void;
  onDeletePayment?: (paymentId: string) => void;
  onClose: () => void;
}

export const AccountStatementModal: React.FC<AccountStatementModalProps> = ({
  mode,
  target,
  purchaseInvoices,
  salesInvoices,
  accountPayments,
  onRecordPayment,
  onOpenInvoice,
  onDeletePayment,
  onClose,
}) => {
  const [newPayAmount, setNewPayAmount] = useState('');
  const [newPayNotes, setNewPayNotes] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  const relatedInvoices = useMemo(() => {
    if (mode === 'supplier') {
      return purchaseInvoices.filter(
        (inv) =>
          !inv.isCancelled &&
          (inv.supplierId ? inv.supplierId === target.id : inv.supplierName === target.name),
      );
    }
    return salesInvoices.filter(
      (inv) =>
        !inv.isReturned &&
        (inv.customerId ? inv.customerId === target.id : inv.customerName === target.name),
    );
  }, [mode, target, purchaseInvoices, salesInvoices]);

  const invoicePage = useRecordPage<PurchaseInvoice | SalesInvoice>(relatedInvoices, target.id, 20);

  const relatedPayments = useMemo(() => {
    return accountPayments.filter(
      (p) =>
        !p.reversedAt &&
        p.targetType === mode &&
        (p.targetId ? p.targetId === target.id : p.targetName === target.name),
    );
  }, [mode, target, accountPayments]);

  const handleQuickPay = () => {
    const amt = parseFloat(newPayAmount) || 0;
    if (amt <= 0) return;
    const accepted = onRecordPayment(
      amt,
      newPayNotes.trim() || (mode === 'supplier' ? 'سداد دفعة للمورد' : 'تحصيل دفعة من العميل'),
    );
    if (!accepted) return;
    setNewPayAmount('');
    setNewPayNotes('');
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const buildWhatsAppStatementText = () => {
    const isSup = mode === 'supplier';
    const lines: string[] = [
      `☕ *بُن العجوز — أصل المزاج*`,
      `📊 *كشف حساب ${isSup ? 'مورد' : 'عميل جملة'}: ${target.name}*`,
      `تاريخ الكشف: ${businessDate()}`,
      `────────────────`,
    ];

    if (relatedInvoices.length > 0) {
      lines.push(`*🧾 الفواتير (${relatedInvoices.length}):*`);
      relatedInvoices.slice(0, 8).forEach((inv) => {
        lines.push(
          `• #${inv.invoiceNumber} (${inv.date}): إجمالي *${inv.totalAmount.toLocaleString('ar-EG')} ج.م* | مدفوع: ${inv.paidAmount.toLocaleString('ar-EG')} | متبقي: *${inv.remainingAmount.toLocaleString('ar-EG')} ج.م*`,
        );
      });
    }

    if (relatedPayments.length > 0) {
      lines.push(`────────────────`);
      lines.push(`*💵 الدفعات المسددة (${relatedPayments.length}):*`);
      relatedPayments.slice(0, 8).forEach((p) => {
        lines.push(`• ${p.date}: *${p.amount.toLocaleString('ar-EG')} ج.م* (${p.notes || 'دفعة'})`);
      });
    }

    lines.push(`────────────────`);
    lines.push(
      `📌 *الرصيد المتبقي الحالي ${isSup ? 'لكم' : 'عليكم'}: ${target.balance.toLocaleString('ar-EG')} ج.م*`,
    );
    lines.push(`شكراً لتعاملكم مع *بُن العجوز* ☕`);

    return lines.join('\n');
  };

  const handleSendWhatsAppStatement = () => {
    const text = encodeURIComponent(buildWhatsAppStatementText());
    const phone = formatEgyptWhatsAppPhone(target.phone);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePrintStatement = () => {
    const printInvoices = escapePrintData(relatedInvoices);
    const printPayments = escapePrintData(relatedPayments);
    const printTarget = escapePrintData(target);

    const invRows = printInvoices
      .map(
        (inv) => `
        <tr>
          <td>#${inv.invoiceNumber}</td>
          <td>${inv.date}</td>
          <td>فاتورة ${mode === 'supplier' ? 'شراء' : 'بيع'}</td>
          <td>${inv.totalAmount.toLocaleString('ar-EG')} ج.م</td>
          <td>${inv.paidAmount.toLocaleString('ar-EG')} ج.م</td>
          <td style="font-weight:bold;color:#B42318;">${inv.remainingAmount.toLocaleString('ar-EG')} ج.م</td>
        </tr>`,
      )
      .join('');

    const payRows = printPayments
      .map(
        (p) => `
        <tr>
          <td>${p.date}</td>
          <td>${p.notes || 'دفعة حساب'}</td>
          <td style="font-weight:bold;color:#1D6344;">${p.amount.toLocaleString('ar-EG')} ج.م</td>
          <td>${p.partnerName}</td>
        </tr>`,
      )
      .join('');

    openPrintDocument({
      title: `كشف حساب - ${printTarget.name}`,
      windowFeatures: 'width=650,height=800',
      widthCss: 'max-width: 720px;',
      bodyHtml: `
        <div class="header">
          <div class="title">بُن العجوز — أصل المزاج</div>
          <div class="sub">كشف حساب تفصيلي (${mode === 'supplier' ? 'مورد' : 'عميل'}): <b>${printTarget.name}</b></div>
        </div>
        <div class="summary">
          <div><b>الاسم:</b> ${printTarget.name} (${printTarget.phone})</div>
          <div><b>الرصيد المتبقي الحالي:</b> <span style="color:#B42318;font-weight:800;">${printTarget.balance.toLocaleString('ar-EG')} ج.م</span></div>
        </div>
        <h4>1. سجل الفواتير (${printInvoices.length})</h4>
        <table>
          <thead>
            <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>البيان</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr>
          </thead>
          <tbody>${invRows || '<tr><td colspan="6">لا توجد فواتير مسجلة</td></tr>'}</tbody>
        </table>
        <h4>2. سجل الدفعات النقدية (${printPayments.length})</h4>
        <table>
          <thead>
            <tr><th>التاريخ</th><th>البيان</th><th>المبلغ المسدد</th><th>بواسطة</th></tr>
          </thead>
          <tbody>${payRows || '<tr><td colspan="4">لا توجد دفعات منفصلة</td></tr>'}</tbody>
        </table>
      `,
    });
  };

  return (
    <Modal
      title={`كشف حساب: ${target.name}`}
      description={`${mode === 'supplier' ? 'سجل فواتير التوريد والدفعات' : 'سجل مسحوبات العميل والتحصيل'} • ${target.phone}`}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleSendWhatsAppStatement}
            className="action-button bg-status-ok-bg border-status-ok-line text-status-ok font-extrabold"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>إرسال الكشف واتساب</span>
          </button>
          <button type="button" onClick={handlePrintStatement} className="operation-primary font-extrabold">
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>طباعة كشف الحساب</span>
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* ملخص الرصيد */}
        <div className="summary-banner-dark summary-banner-stats">
          <div className="summary-stat-box">
            <div className="text-xs text-gold-soft">{mode === 'supplier' ? 'إجمالي التوريد' : 'إجمالي المسحوبات'}</div>
            <div className="text-sm font-extrabold text-gold-highlight mt-0.5 [font-variant-numeric:tabular-nums]">
              {(mode === 'supplier'
                ? (target as Supplier).totalPurchases
                : (target as Customer).totalSales
              ).toLocaleString('ar-EG')}{' '}
              ج.م
            </div>
          </div>
          <div className="summary-stat-box">
            <div className="text-xs text-gold-soft">عدد الفواتير</div>
            <div className="text-sm font-extrabold text-gold-highlight mt-0.5 [font-variant-numeric:tabular-nums]">
              {relatedInvoices.length} فاتورة
            </div>
          </div>
          <div className="summary-stat-box">
            <div className="text-xs text-gold-soft">{mode === 'supplier' ? 'المتبقي له' : 'المتبقي عليه'}</div>
            <div className="text-sm font-extrabold text-gold-highlight mt-0.5 [font-variant-numeric:tabular-nums]">
              {target.balance.toLocaleString('ar-EG')} ج.م
            </div>
          </div>
        </div>

        {savedNotice && (
          <div
            role="status"
            className="bg-status-ok-bg border border-status-ok-line text-status-ok rounded-md p-2.5 text-xs font-extrabold flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>تم تسجيل الدفعة وخصمها من الرصيد المتبقي بنجاح!</span>
          </div>
        )}

        {/* تسجيل دفعة سريعة داخل الكشف */}
        {target.balance > 0 && (
          <div className="bg-surface-sunken rounded-lg p-3 border border-line space-y-2">
            <div className="text-xs font-extrabold text-ink-strong">
              + تسجيل {mode === 'supplier' ? 'سداد دفعة للمورد' : 'تحصيل دفعة من العميل'}:
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="number"
                value={newPayAmount}
                onChange={(e) => setNewPayAmount(e.target.value)}
                placeholder="المبلغ (ج.م)"
                className="w-28 min-h-[44px] border border-line-control rounded-md px-2.5 py-2 text-xs font-extrabold text-center bg-surface-control"
              />
              <input
                type="text"
                value={newPayNotes}
                onChange={(e) => setNewPayNotes(e.target.value)}
                placeholder="ملاحظة (نقدي / محفظة)..."
                className="flex-1 min-w-[140px] min-h-[44px] border border-line-control rounded-md px-3 py-2 text-xs font-bold bg-surface-control"
              />
              <button
                type="button"
                onClick={handleQuickPay}
                className="operation-primary min-h-[44px] px-3.5 text-xs font-extrabold shrink-0"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                تسجيل
              </button>
            </div>
          </div>
        )}

        {/* 1. الفواتير المسجلة في الكشف */}
        <div className="bg-surface-card rounded-lg p-3 border border-line space-y-2.5">
          <div className="text-xs font-extrabold text-ink-strong flex items-center justify-between">
            <span>الفواتير ({relatedInvoices.length})</span>
            <span className="text-xs text-ink-faint">التفاصيل والآجل</span>
          </div>
          {relatedInvoices.length === 0 ? (
            <div className="text-center py-3 text-xs text-ink-faint">لا توجد فواتير مسجلة لهذا الاسم بعد</div>
          ) : (
            <div className="space-y-2">
              <RecordPagination {...invoicePage} />
              {invoicePage.visible.map((inv) => (
                <div key={inv.id} className="p-3 rounded-md bg-surface-sunken border border-line-subtle text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-gold">
                      #{inv.invoiceNumber} • {inv.date}
                    </span>
                    <span className="font-extrabold text-ink-strong [font-variant-numeric:tabular-nums]">
                      {inv.totalAmount.toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>
                  <div className="text-xs text-ink">{inv.items.map((i) => `${i.itemName} (${i.quantity})`).join(' + ')}</div>
                  <div className="flex justify-between text-xs pt-1.5 border-t border-line-subtle [font-variant-numeric:tabular-nums]">
                    <span className="text-status-ok font-bold">مدفوع: {inv.paidAmount.toLocaleString('ar-EG')} ج.م</span>
                    <span className={inv.remainingAmount > 0 ? 'text-status-danger font-extrabold' : 'text-ink-faint'}>
                      متبقي: {inv.remainingAmount.toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>
                  {onOpenInvoice && (
                    <button type="button" className="record-action" onClick={() => onOpenInvoice(inv.id)}>
                      فتح الفاتورة
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. سجل الدفعات والتحصيلات */}
        <div className="bg-surface-card rounded-lg p-3 border border-line space-y-2.5">
          <div className="text-xs font-extrabold text-ink-strong">سجل الدفعات النقدية ({relatedPayments.length})</div>
          {relatedPayments.length === 0 ? (
            <div className="text-center py-3 text-xs text-ink-faint">لا توجد دفعات منفصلة مسجلة بعد</div>
          ) : (
            <div className="space-y-2">
              {relatedPayments.map((pay) => (
                <div
                  key={pay.id}
                  className="p-2.5 rounded-md bg-status-ok-bg border border-status-ok-line flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {mode === 'supplier' ? (
                      <ArrowUpRight className="w-4 h-4 text-status-ok shrink-0" aria-hidden="true" />
                    ) : (
                      <ArrowDownLeft className="w-4 h-4 text-status-ok shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="font-extrabold text-ink-strong truncate">{pay.notes || 'دفعة نقدية'}</div>
                      <div className="text-xs text-ink-faint">
                        {pay.date} • بواسطة: {pay.partnerName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-extrabold text-status-ok [font-variant-numeric:tabular-nums]">
                      {pay.amount.toLocaleString('ar-EG')} ج.م
                    </span>
                    {onDeletePayment && (
                      <button
                        type="button"
                        onClick={() => onDeletePayment(pay.id)}
                        className="action-button min-h-[44px] min-w-[44px] p-2 border-status-danger-line bg-status-danger-bg text-status-danger"
                        title="حذف الدفعة"
                        aria-label="حذف الدفعة"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
