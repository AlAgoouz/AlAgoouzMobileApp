import {serverInvoicePdf,downloadExport} from '../lib/reportExports';
import {Modal} from './Modal';
import React, { useState, useMemo } from 'react';
import { escapePrintData } from '../lib/safeHtml';
import { businessDate } from '../lib/dates';
import {whatsAppNumber} from '../lib/contactDetails';
import {Printer, MessageCircle, ArrowDownLeft, ArrowUpRight, Plus, Trash2, CheckCircle2, Phone} from 'lucide-react';
import {
  SalesInvoice,
  PurchaseInvoice,
  Supplier,
  Customer,
  AccountPaymentRecord,
  InventoryItem,
  Expense,
} from '../types/erp';

// تنسيق رقم الموبايل المصري للواتساب
export function formatEgyptWhatsAppPhone(rawPhone?: string): string {
  if(!rawPhone)return '';
  try{return whatsAppNumber(rawPhone);}catch{return '';}
}

// ============================================================================
// 1. نافذة طباعة الفاتورة وإرسالها واتساب (InvoiceReceiptModal)
// ============================================================================
interface InvoiceReceiptModalProps {
  invoice: SalesInvoice;
  customerPhone?: string;
  onClose: () => void;
}

export const InvoiceReceiptModal: React.FC<InvoiceReceiptModalProps> = ({
  invoice,
  customerPhone = '',
  onClose,
}) => {
  const [phoneInput, setPhoneInput] = useState(customerPhone);
  const [pdfBusy,setPdfBusy]=useState(false),[pdfError,setPdfError]=useState('');
  const exportPdf=async(share:boolean)=>{
    if(pdfBusy)return;setPdfBusy(true);setPdfError('');
    try{
      const file=await serverInvoicePdf(invoice.id);
      if(share&&navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:`فاتورة ${invoice.invoiceNumber}`});}catch(error){if((error as Error).name==='AbortError')return;downloadExport(file);setPdfError('تم تنزيل الفاتورة؛ افتح محادثة العميل من زر واتساب وأرفق الملف.');}}
      else {downloadExport(file);if(share)setPdfError('تم تنزيل الفاتورة؛ افتح محادثة العميل من زر واتساب وأرفق الملف.');}
    }catch(error){if((error as Error).name!=='AbortError')setPdfError((error as Error).message);}finally{setPdfBusy(false);}
  };

  const buildWhatsAppInvoiceText = () => {
    const lines: string[] = [
      `☕ *بُن العجوز — أصل المزاج*`,
      `🧾 *فاتورة ${
        invoice.saleType === 'wholesale'
          ? 'مبيعات جملة'
          : invoice.saleType === 'retail'
            ? 'بيع محل'
            : 'كاشير'
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
      lines.push(
        `الإجمالي قبل الخصم: ${invoice.subtotal.toLocaleString('ar-EG')} ج.م`,
      );
      lines.push(`الخصم: -${invoice.discount.toLocaleString('ar-EG')} ج.م`);
    }
    lines.push(
      `💰 *الإجمالي المطلوب: ${invoice.totalAmount.toLocaleString('ar-EG')} ج.م*`,
    );
    lines.push(
      `✅ المدفوع (${invoice.paymentMethod}): ${invoice.paidAmount.toLocaleString('ar-EG')} ج.م`,
    );
    if (invoice.remainingAmount > 0) {
      lines.push(
        `⚠️ *المتبقي آجل: ${invoice.remainingAmount.toLocaleString('ar-EG')} ج.م*`,
      );
    } else {
      lines.push(`✨ الفاتورة خالصة بالكامل`);
    }
    lines.push(`────────────────`);
    lines.push(`شكراً لتعاملكم مع *بُن العجوز* ☕`);

    return lines.join('\n');
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(buildWhatsAppInvoiceText());
    const formattedPhone = formatEgyptWhatsAppPhone(phoneInput);
    const url = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handlePrintReceipt = () => {
    const printInvoice = escapePrintData(invoice);
    const printWin = window.open('', '_blank', 'width=420,height=700');
    if (!printWin) {
      window.print();
      return;
    }

    const rowsHtml = printInvoice.items
      .map(
        (it) => `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px dashed #ccc;font-weight:bold;">${it.itemName}</td>
          <td style="padding:6px 4px;border-bottom:1px dashed #ccc;text-align:center;">${it.quantity} ${it.unitLabel}</td>
          <td style="padding:6px 4px;border-bottom:1px dashed #ccc;text-align:left;font-weight:bold;">${it.totalPrice.toLocaleString('ar-EG')} ج.م</td>
        </tr>`,
      )
      .join('');

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>فاتورة #${printInvoice.invoiceNumber} - بُن العجوز</title>
        <style>
          body { font-family: 'Cairo', 'Tahoma', sans-serif; width: 320px; margin: 0 auto; padding: 12px; color: #1E1612; }
          .header { text-align: center; border-bottom: 2px solid #1E1612; padding-bottom: 8px; margin-bottom: 10px; }
          .title { font-size: 18px; font-weight: 900; margin: 4px 0 2px; }
          .sub { font-size: 12px; color: #555; }
          .meta { font-size: 12px; margin-bottom: 10px; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #1E1612; color: #FBF5B7; padding: 6px 4px; text-align: right; }
          .totals { margin-top: 10px; border-top: 2px solid #1E1612; padding-top: 8px; font-size: 13px; line-height: 1.7; }
          .footer { text-align: center; margin-top: 14px; font-size: 11px; border-top: 1px dashed #999; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">☕ بُن العجوز — أصل المزاج</div>
          <div class="sub">فاتورة ${
            printInvoice.saleType === 'wholesale'
              ? 'مبيعات جملة'
              : 'مبيعات المحل'
          }</div>
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
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="totals">
          ${
            printInvoice.discount > 0
              ? `<div>الإجمالي الفرعي: ${printInvoice.subtotal} ج.م | الخصم: ${printInvoice.discount} ج.م</div>`
              : ''
          }
          <div style="font-size:15px;font-weight:900;">الإجمالي المطلوب: ${printInvoice.totalAmount.toLocaleString('ar-EG')} ج.م</div>
          <div>المدفوع (${printInvoice.paymentMethod}): <b>${printInvoice.paidAmount.toLocaleString('ar-EG')} ج.م</b></div>
          ${
            printInvoice.remainingAmount > 0
              ? `<div style="color:#b91c1c;font-weight:900;">المتبقي آجل: ${printInvoice.remainingAmount.toLocaleString('ar-EG')} ج.م</div>`
              : `<div>حالة الفاتورة: خالصة بالكامل ✓</div>`
          }
        </div>
        <div class="footer">شكراً لتعاملكم مع بُن العجوز — أصل المزاج ☕</div>
        <script>window.onload = function(){ window.print(); }</script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <Modal title={<>بُن العجوز — أصل المزاج</>} description={<>فاتورة # {invoice.invoiceNumber} •  {invoice.date}</>} onClose={onClose} footer={<div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={handleSendWhatsApp}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-2xl shadow flex items-center justify-center gap-1.5 text-xs"
            >
              <MessageCircle className="w-4 h-4" />
              <span>إرسال واتساب</span>
            </button>
            <button
              onClick={handlePrintReceipt}
              className="bg-[#1E1612] hover:bg-[#2B201A] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-3 rounded-2xl shadow flex items-center justify-center gap-1.5 text-xs"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>طباعة الفاتورة</span>
            </button>
          </div>}><div className="space-y-3">
          <div className="bg-white rounded-2xl p-3 border border-[#E6DEC8] flex items-center justify-between text-xs">
            <div>
              <div className="text-[10px] text-[#7A6855]">العميل</div>
              <div className="font-black text-[#1E1612]">
                {invoice.customerName}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-[#7A6855]">الدفع</div>
              <div className="font-extrabold text-[#9E7918]">
                {invoice.paymentMethod}
              </div>
            </div>
          </div>

          {/* جدول الأصناف */}
          <div className="bg-white rounded-2xl border border-[#E6DEC8] overflow-hidden">
            <div className="bg-[#1E1612] text-[#FBF5B7] px-3 py-2 text-[11px] font-extrabold grid grid-cols-12">
              <span className="col-span-6">الصنف</span>
              <span className="col-span-3 text-center">الكمية</span>
              <span className="col-span-3 text-left">الإجمالي</span>
            </div>
            <div className="divide-y divide-[#F0EAE0] text-xs">
              {invoice.items.map((it, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 grid grid-cols-12 items-center"
                >
                  <span className="col-span-6 font-extrabold text-[#1E1612]">
                    {it.itemName}
                  </span>
                  <span className="col-span-3 text-center text-[11px] text-[#7A6855] font-bold">
                    {it.quantity} {it.unitLabel}
                  </span>
                  <span className="col-span-3 text-left font-black text-[#1E1612]">
                    {it.totalPrice.toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* الإجماليات */}
          <div className="bg-white rounded-2xl p-3.5 border border-[#E6DEC8] space-y-1.5 text-xs">
            {invoice.discount > 0 && (
              <div className="flex justify-between text-[#7A6855]">
                <span>الخصم:</span>
                <span className="font-bold">-{invoice.discount} ج.م</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-[#1E1612]">
              <span>الإجمالي المطلوب:</span>
              <span>{invoice.totalAmount.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-bold">
              <span>المدفوع:</span>
              <span>{invoice.paidAmount.toLocaleString('ar-EG')} ج.م</span>
            </div>
            {invoice.remainingAmount > 0 && (
              <div className="flex justify-between text-red-600 font-black pt-1 border-t border-[#F0EAE0]">
                <span>المتبقي آجل:</span>
                <span>
                  {invoice.remainingAmount.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
            )}
          </div>

          {/* رقم واتساب العميل */}
          <div className="bg-white rounded-2xl p-3 border border-[#E6DEC8] space-y-1.5">
            <label className="text-[11px] font-extrabold text-[#7A6855] flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              رقم موبايل العميل لإرسال الفاتورة واتساب:
            </label>
            <input
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="010xxxxxxxx (أو اتركه فارغاً لاختيار جهة اتصال)"
              className="w-full border border-[#DFD7C6] rounded-xl px-3 py-2 text-xs font-bold bg-[#FAF8F4]"
            />
          </div>

          {/* أزرار الطباعة والواتساب */}
          {invoice.saleType==='wholesale'&&invoice.items.every(line=>line.category==='manufactured_blend')&&<div className="grid grid-cols-2 gap-2">
            <button disabled={pdfBusy} onClick={()=>void exportPdf(false)} className="border rounded-xl p-3 font-bold">{pdfBusy?'جارٍ تجهيز الفاتورة…':'تنزيل الفاتورة PDF'}</button>
            <button disabled={pdfBusy} onClick={()=>void exportPdf(true)} className="border rounded-xl p-3 font-bold">مشاركة ملف الفاتورة</button>
          </div>}
          {pdfError&&<p role="status" className="text-xs">{pdfError}</p>}

        </div></Modal>
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
  onDeletePayment,
  onClose,
}) => {
  const [newPayAmount, setNewPayAmount] = useState('');
  const [newPayNotes, setNewPayNotes] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  // تجميع الفواتير الخاصة بهذا المورد أو العميل
  const relatedInvoices = useMemo(() => {
    if (mode === 'supplier') {
      return purchaseInvoices.filter(
        (inv) =>
          !inv.isCancelled &&
          (inv.supplierId === target.id || inv.supplierName === target.name),
      );
    }
    return salesInvoices.filter(
      (inv) =>
        !inv.isReturned &&
        (inv.customerId === target.id || inv.customerName === target.name),
    );
  }, [mode, target, purchaseInvoices, salesInvoices]);

  // تجميع الدفعات المسجلة لهذا المورد أو العميل
  const relatedPayments = useMemo(() => {
    return accountPayments.filter(
      (p) =>
        !p.reversedAt &&
        p.targetType === mode &&
        (p.targetId === target.id || p.targetName === target.name),
    );
  }, [mode, target, accountPayments]);

  const handleQuickPay = () => {
    const amt = parseFloat(newPayAmount) || 0;
    if (amt <= 0) return;
    const accepted = onRecordPayment(
      amt,
      newPayNotes.trim() ||
        (mode === 'supplier' ? 'سداد دفعة للمورد' : 'تحصيل دفعة من العميل'),
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
        lines.push(
          `• ${p.date}: *${p.amount.toLocaleString('ar-EG')} ج.م* (${p.notes || 'دفعة'})`,
        );
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
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handlePrintStatement = () => {
    const printInvoices = escapePrintData(relatedInvoices);
    const printPayments = escapePrintData(relatedPayments);
    const printTarget = escapePrintData(target);
    const printWin = window.open('', '_blank', 'width=650,height=800');
    if (!printWin) {
      window.print();
      return;
    }

    const invRows = printInvoices
      .map(
        (inv) => `
        <tr>
          <td>#${inv.invoiceNumber}</td>
          <td>${inv.date}</td>
          <td>فاتورة ${mode === 'supplier' ? 'شراء' : 'بيع'}</td>
          <td>${inv.totalAmount.toLocaleString('ar-EG')} ج.م</td>
          <td>${inv.paidAmount.toLocaleString('ar-EG')} ج.م</td>
          <td style="font-weight:bold;color:#b91c1c;">${inv.remainingAmount.toLocaleString('ar-EG')} ج.م</td>
        </tr>`,
      )
      .join('');

    const payRows = printPayments
      .map(
        (p) => `
        <tr>
          <td>${p.date}</td>
          <td>${p.notes || 'دفعة حساب'}</td>
          <td style="font-weight:bold;color:#047857;">${p.amount.toLocaleString('ar-EG')} ج.م</td>
          <td>${p.partnerName}</td>
        </tr>`,
      )
      .join('');

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>كشف حساب - ${printTarget.name}</title>
        <style>
          body { font-family: 'Cairo', 'Tahoma', sans-serif; padding: 20px; color: #1E1612; }
          .header { text-align: center; border-bottom: 2px solid #1E1612; padding-bottom: 12px; margin-bottom: 16px; }
          h2 { margin: 0 0 4px; }
          .summary { display: flex; justify-content: space-between; background: #FAF8F4; padding: 12px; border: 1px solid #C59B27; border-radius: 10px; margin-bottom: 16px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
          th { background: #1E1612; color: #FBF5B7; padding: 8px; text-align: right; }
          td { padding: 7px 8px; border-bottom: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>☕ بُن العجوز — أصل المزاج</h2>
          <div>كشف حساب تفصيلي (${mode === 'supplier' ? 'مورد' : 'عميل'}): <b>${printTarget.name}</b></div>
        </div>
        <div class="summary">
          <div><b>الاسم:</b> ${printTarget.name} (${printTarget.phone})</div>
          <div><b>الرصيد المتبقي الحالي:</b> <span style="color:#b91c1c;font-weight:900;">${printTarget.balance.toLocaleString('ar-EG')} ج.م</span></div>
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
        <script>window.onload = function(){ window.print(); }</script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <Modal title={<>كشف حساب:  {target.name}</>} description={<>{mode === 'supplier'
                ? 'سجل فواتير التوريد والدفعات'
                : 'سجل مسحوبات العميل والتحصيل'} {' '} •  {target.phone}</>} onClose={onClose} footer={<div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={handleSendWhatsAppStatement}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-2xl shadow flex items-center justify-center gap-1.5 text-xs"
            >
              <MessageCircle className="w-4 h-4" />
              <span>إرسال الكشف واتساب</span>
            </button>
            <button
              onClick={handlePrintStatement}
              className="bg-[#1E1612] hover:bg-[#2B201A] text-[#FBF5B7] border border-[#C59B27] font-extrabold py-3 rounded-2xl shadow flex items-center justify-center gap-1.5 text-xs"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>طباعة كشف الحساب</span>
            </button>
          </div>}><div className="space-y-3.5">
          {/* ملخص الرصيد */}
          <div className="rounded-2xl bg-gradient-to-br from-[#1E1612] to-[#2B201A] text-white p-3.5 border border-[#C59B27] grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] text-[#D4AF37]">
                {mode === 'supplier' ? 'إجمالي التوريد' : 'إجمالي المسحوبات'}
              </div>
              <div className="text-xs font-black mt-0.5">
                {(mode === 'supplier'
                  ? (target as Supplier).totalPurchases
                  : (target as Customer).totalSales
                ).toLocaleString('ar-EG')}{' '}
                ج.م
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#D4AF37]">عدد الفواتير</div>
              <div className="text-xs font-black mt-0.5">
                {relatedInvoices.length} فاتورة
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#D4AF37]">
                {mode === 'supplier' ? 'المتبقي له' : 'المتبقي عليه'}
              </div>
              <div className="text-sm font-black text-amber-300 mt-0.5">
                {target.balance.toLocaleString('ar-EG')} ج.م
              </div>
            </div>
          </div>

          {savedNotice && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl p-2.5 text-xs font-extrabold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>تم تسجيل الدفعة وخصمها من الرصيد المتبقي بنجاح!</span>
            </div>
          )}

          {/* تسجيل دفعة سريعة داخل الكشف */}
          {target.balance > 0 && (
            <div className="bg-white rounded-2xl p-3 border border-[#E6DEC8] space-y-2">
              <div className="text-xs font-extrabold text-[#1E1612]">
                + تسجيل{' '}
                {mode === 'supplier'
                  ? 'سداد دفعة للمورد'
                  : 'تحصيل دفعة من العميل'}
                :
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={newPayAmount}
                  onChange={(e) => setNewPayAmount(e.target.value)}
                  placeholder="المبلغ (ج.م)"
                  className="w-28 border border-[#DFD7C6] rounded-xl px-2.5 py-1.5 text-xs font-black text-center bg-[#FAF8F4]"
                />
                <input
                  type="text"
                  value={newPayNotes}
                  onChange={(e) => setNewPayNotes(e.target.value)}
                  placeholder="ملاحظة (نقدي / محفظة)..."
                  className="flex-1 border border-[#DFD7C6] rounded-xl px-2.5 py-1.5 text-xs font-bold bg-[#FAF8F4]"
                />
                <button
                  onClick={handleQuickPay}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  تسجيل
                </button>
              </div>
            </div>
          )}

          {/* 1. الفواتير المسجلة في الكشف */}
          <div className="bg-white rounded-2xl p-3 border border-[#E6DEC8] space-y-2">
            <div className="text-xs font-black text-[#1E1612] flex items-center justify-between">
              <span>🧾 الفواتير ({relatedInvoices.length})</span>
              <span className="text-[10px] text-[#7A6855]">
                التفاصيل والآجل
              </span>
            </div>
            {relatedInvoices.length === 0 ? (
              <div className="text-center py-3 text-xs text-[#7A6855]">
                لا توجد فواتير مسجلة لهذا الاسم بعد
              </div>
            ) : (
              <div className="space-y-2">
                {relatedInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 rounded-xl bg-[#FAF8F4] border border-[#EDE6D8] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[#9E7918]">
                        #{inv.invoiceNumber} • {inv.date}
                      </span>
                      <span className="font-black text-[#1E1612]">
                        {inv.totalAmount.toLocaleString('ar-EG')} ج.م
                      </span>
                    </div>
                    <div className="text-[11px] text-[#5C4B3E]">
                      {inv.items
                        .map((i) => `${i.itemName} (${i.quantity})`)
                        .join(' + ')}
                    </div>
                    <div className="flex justify-between text-[11px] pt-1 border-t border-[#E6DEC8]">
                      <span className="text-emerald-700 font-bold">
                        مدفوع: {inv.paidAmount.toLocaleString('ar-EG')} ج.م
                      </span>
                      <span
                        className={
                          inv.remainingAmount > 0
                            ? 'text-red-600 font-black'
                            : 'text-[#7A6855]'
                        }
                      >
                        متبقي: {inv.remainingAmount.toLocaleString('ar-EG')} ج.م
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. سجل الدفعات والتحصيلات */}
          <div className="bg-white rounded-2xl p-3 border border-[#E6DEC8] space-y-2">
            <div className="text-xs font-black text-[#1E1612]">
              💵 سجل الدفعات النقدية ({relatedPayments.length})
            </div>
            {relatedPayments.length === 0 ? (
              <div className="text-center py-3 text-xs text-[#7A6855]">
                لا توجد دفعات منفصلة مسجلة بعد
              </div>
            ) : (
              <div className="space-y-1.5">
                {relatedPayments.map((pay) => (
                  <div
                    key={pay.id}
                    className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {mode === 'supplier' ? (
                        <ArrowUpRight className="w-4 h-4 text-emerald-700 shrink-0" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-700 shrink-0" />
                      )}
                      <div>
                        <div className="font-extrabold text-[#1E1612]">
                          {pay.notes || 'دفعة نقدية'}
                        </div>
                        <div className="text-[10px] text-[#7A6855]">
                          {pay.date} • بواسطة: {pay.partnerName}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-emerald-700">
                        {pay.amount.toLocaleString('ar-EG')} ج.م
                      </span>
                      {onDeletePayment && (
                        <button
                          onClick={() => onDeletePayment(pay.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="حذف الدفعة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* أزرار إرسال كشف الحساب واتساب أو طباعته */}

        </div></Modal>
  );
};

// ============================================================================
// 3. دوال النسخ الاحتياطي الشامل وتصدير إكسيل الكامل (Backup & Restore)
// ============================================================================
