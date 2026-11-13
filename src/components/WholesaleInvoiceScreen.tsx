import React, {useMemo, useRef, useState} from 'react';
import {Plus, Receipt, Search, Trash2} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {RecordPicker} from './RecordPicker';
import {parseLocalizedNumber} from '../lib/cashierRows';
import {inventoryDeductions} from '../lib/inventory';
import {Modal} from './Modal';
import type {Customer, InventoryItem, SalesInvoice, SalesInvoiceItem} from '../types/erp';
import {businessDate} from '../lib/dates';
import {checkCustomerDetails} from '../lib/contactDetails';
import {money} from '../lib/reporting';

interface InvoiceLine {
  id: string;
  itemId: string;
  quantity: string;
  price: string;
}

const numeric = (value: string) => parseLocalizedNumber(value) ?? NaN;
const amount = (line: InvoiceLine) => Number((numeric(line.quantity) * numeric(line.price)).toFixed(2));

export function WholesaleInvoiceScreen({items, customers, currentPartnerName, onSaveSale, onBack}: {
  items: InventoryItem[];
  customers: Customer[];
  currentPartnerName: string;
  onSaveSale: (invoice: Omit<SalesInvoice, 'id' | 'invoiceNumber'>) => Promise<boolean>;
  onBack: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(businessDate());
  const [method, setMethod] = useState<SalesInvoice['paymentMethod']>('نقدي');
  const [paid, setPaid] = useState('0');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [picker,setPicker] = useState<'customer' | 'blend'>();
  const [review,setReview] = useState<Omit<SalesInvoice,'id'|'invoiceNumber'>>();
  const saving = useRef(false);
  const blends = useMemo(() => items.filter(item => item.category === 'manufactured_blend'), [items]);
  const customerOptions = useMemo(() => customers.map(customer => ({
    id: customer.id, title: customer.name, detail: [customer.area,customer.phone].filter(Boolean).join(' · '),
    keywords: (customer.phone ?? '').replace(/[^0-9٠-٩۰-۹]/g,''),
  })), [customers]);
  const blendOptions = useMemo(() => blends.map(item => ({
    id: item.id, title: item.name, detail: item.code + ' · المتاح ' + money(item.stock) + ' كجم',
  })), [blends]);
  const customerName = customers.find(customer => customer.id === customerId)?.name;
  const total = Number(lines.reduce((sum, line) => sum + (Number.isFinite(amount(line)) ? amount(line) : 0), 0).toFixed(2));
  const paidAmount = method === 'آجل' ? numeric(paid) : total;
  const moneyOrDash = (value: number) => Number.isFinite(value) ? `${money(value)} ج.م` : '—';

  function updateLine(id: string, change: Partial<Omit<InvoiceLine, 'id'>>) {
    setLines(current => current.map(line => line.id === id ? {...line, ...change} : line));
  }

  function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      const customer = customers.find(value => value.id === customerId);
      if (!customer) throw Error('اختر عميلًا مسجلًا');
      checkCustomerDetails(customer);
      if (!date) throw Error('حدد تاريخ الفاتورة');
      if (!lines.length) throw Error('أضف توليفة للفاتورة');
      const invoiceItems: SalesInvoiceItem[] = lines.map(line => {
        const item = blends.find(value => value.id === line.itemId);
        const quantity = numeric(line.quantity);
        const price = numeric(line.price);
        if (!item || !line.quantity.trim() || !line.price.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
          throw Error('حدد التوليفة والكمية وسعر البيع لكل سطر');
        }
        const totalPrice = amount(line);
        const totalCost = Number((quantity * item.costPrice).toFixed(2));
        return {
          itemId: item.id, itemName: item.name, category: item.category, quantity,
          unitLabel: 'كجم', normalizedQtyInBaseUnit: quantity, unitPrice: price, unitCost: item.costPrice,
          totalPrice, totalCost, profit: totalPrice - totalCost,
        };
      });
      if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > total || (method === 'آجل' && !paid.trim())) {
        throw Error('المدفوع يجب أن يكون بين صفر وإجمالي الفاتورة');
      }
      for (const [id,required] of inventoryDeductions(invoiceItems,items)) {
        const item = blends.find(value => value.id === id);
        if (item && item.stock + 0.0000001 < required) {
          throw Error('رصيد ' + item.name + ' غير كافٍ. المتاح ' + money(item.stock) + ' كجم والمطلوب ' + money(required) + ' كجم.');
        }
      }
      setReview({
        date, saleType: 'wholesale', customerId, customerName: customer.name, items: invoiceItems, subtotal: total,
        discount: 0, totalAmount: total, totalCost: 0, netProfit: 0, paidAmount,
        remainingAmount: Number((total - paidAmount).toFixed(2)), paymentMethod: method, partnerName: currentPartnerName,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر مراجعة الفاتورة');
    }
  }

  async function confirm() {
    if (!review || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (!await onSaveSale(review)) throw Error('لم تعتمد الفاتورة؛ راجع الرصيد وحالة الحفظ');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر اعتماد الفاتورة');
    } finally {
      saving.current = false;
      setBusy(false);
      setReview(undefined);
    }
  }

  const input = 'w-full min-w-0 border rounded-xl p-3 bg-white';
  return <main dir="rtl" className="operation-screen invoice-workspace min-h-screen p-4 pb-28 space-y-4">
    <OperationHeader title="إنشاء فاتورة جملة" description="اختار العميل والتوليفات، وحدد السعر المتفق عليه." icon={Receipt} onBack={onBack} busy={busy} />
    <form noValidate className="space-y-4" onSubmit={prepare}>
      <section className="operation-surface">
        <h2>العميل والدفع</h2>
        <div className="operation-fields">
          <div className="invoice-choice">
            <span>العميل</span>
            <button type="button" className="picker-trigger" disabled={busy} aria-haspopup="dialog" onClick={() => setPicker('customer')}>
              <Search size={17} aria-hidden="true" />{customerName ?? 'اختيار العميل'}
            </button>
          </div>
          <label>تاريخ الفاتورة<input required disabled={busy} className={input} type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          <label>طريقة الدفع<select disabled={busy} className={input} value={method} onChange={event => setMethod(event.target.value as SalesInvoice['paymentMethod'])}>
            <option>نقدي</option><option>محفظة/انستا باي</option><option>آجل</option>
          </select></label>
          {method === 'آجل' && <label>المدفوع الآن<input required disabled={busy} className={input} type="text" inputMode="decimal" value={paid} onChange={event => setPaid(event.target.value)} /></label>}
        </div>
        {!customers.length && <p className="operation-note">أضف بيانات العميل ورقمه ومنطقته من قسم العملاء أولًا.</p>}
      </section>

      <section className="operation-surface space-y-3">
        <div className="invoice-lines-heading">
          <h2>التوليفات في الفاتورة</h2>
          <button type="button" disabled={busy || !blends.length} onClick={() => setPicker('blend')} className="record-action">
            <Plus size={16} aria-hidden="true" />إضافة توليفة
          </button>
        </div>
        {lines.map(line => <fieldset key={line.id} className="invoice-line">
          <legend>{blends.find(item => item.id === line.itemId)?.name}</legend>
          <div className="operation-fields">
            <label>الكمية بالكيلو<input required disabled={busy} className={input} type="text" inputMode="decimal" value={line.quantity} onChange={event => updateLine(line.id, {quantity: event.target.value})} /></label>
            <label>سعر الكيلو المتفق عليه<input required disabled={busy} className={input} type="text" inputMode="decimal" value={line.price} onChange={event => updateLine(line.id, {price: event.target.value})} /></label>
          </div>
          <div className="operation-form-footer">
            <p>قيمة السطر <b>{moneyOrDash(amount(line))}</b></p>
            <button type="button" className="record-action text-red-700" disabled={busy} onClick={() => setLines(current => current.filter(value => value.id !== line.id))}>
              <Trash2 size={15} aria-hidden="true" />حذف السطر
            </button>
          </div>
        </fieldset>)}
        {!blends.length && <p className="operation-note">أضف توليفة جاهزة في قسم المنتجات أولًا.</p>}
      </section>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      <footer className="operation-surface operation-form-footer invoice-summary">
        <dl>
          <div><dt>الإجمالي</dt><dd>{moneyOrDash(total)}</dd></div>
          <div><dt>المدفوع</dt><dd>{moneyOrDash(paidAmount)}</dd></div>
          <div><dt>المتبقي</dt><dd>{moneyOrDash(total - paidAmount)}</dd></div>
        </dl>
        <button type="submit" disabled={busy} className="operation-primary">
          مراجعة الفاتورة
        </button>
      </footer>
    </form>
    {picker === 'customer' && <RecordPicker title="اختيار عميل" searchLabel="ابحث باسم العميل أو رقم التليفون"
      options={customerOptions} selectedId={customerId} onSelect={id => {setCustomerId(id);setPicker(undefined);}}
      onClose={() => setPicker(undefined)} />}
    {picker === 'blend' && <RecordPicker title="اختيار توليفة" searchLabel="ابحث باسم التوليفة أو الكود"
      options={blendOptions} onSelect={id => {
        setLines(current => [...current,{id:crypto.randomUUID(),itemId:id,quantity:'',price:''}]);
        setPicker(undefined);
      }} onClose={() => setPicker(undefined)} />}
    {review && <Modal title="مراجعة فاتورة الجملة" onClose={() => setReview(undefined)} busy={busy}
      footer={<button type="button" className="operation-primary" disabled={busy} onClick={() => void confirm()}>
        {busy ? 'جارٍ اعتماد الفاتورة…' : 'اعتماد الفاتورة وخصم المخزون'}
      </button>}>
      <dl className="record-facts">
        <div><dt>العميل</dt><dd>{review.customerName}</dd></div>
        <div><dt>الإجمالي</dt><dd>{moneyOrDash(review.totalAmount)}</dd></div>
        <div><dt>المدفوع</dt><dd>{moneyOrDash(review.paidAmount)}</dd></div>
        <div><dt>المتبقي</dt><dd>{moneyOrDash(review.remainingAmount)}</dd></div>
      </dl>
      <h3>الكميات اللي هتتخصم من المخزون</h3>
      <ul className="invoice-review-lines">{review.items.map((line,index) => <li key={index}>
        <span>{line.itemName}</span><b>{money(line.quantity)} كجم</b>
      </li>)}</ul>
    </Modal>}
  </main>;
}
