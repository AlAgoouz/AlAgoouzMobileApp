import React, {useId, useMemo, useRef, useState} from 'react';
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
import {multiplyMoney,roundMoney,sumMoney} from '../lib/money';

interface InvoiceLine {
  id: string;
  itemId: string;
  quantity: string;
  price: string;
}

const numeric = (value: string) => parseLocalizedNumber(value) ?? NaN;
function quantityError(value: string) {
  const quantity = numeric(value);
  return Number.isFinite(quantity) && quantity > 0 ? '' : 'أدخل كمية أكبر من صفر.';
}

function priceError(value: string) {
  const price = numeric(value);
  return Number.isFinite(price) && price >= 0 ? '' : 'أدخل سعرًا صحيحًا لا يقل عن صفر.';
}

const amount = (line: InvoiceLine) => {
  const quantity=numeric(line.quantity),price=numeric(line.price);
  if(!Number.isFinite(quantity)||!Number.isFinite(price))return NaN;
  try{return multiplyMoney(quantity,price);}catch{return NaN;}
};

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
  const [saveError, setSaveError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldNotice, setFieldNotice] = useState('');
  const invoiceId = useId();
  const form = useRef<HTMLFormElement>(null);
  const customerButton = useRef<HTMLButtonElement>(null);
  const addBlendButton = useRef<HTMLButtonElement>(null);
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
  let total=NaN;
  try{total=sumMoney(lines.map(amount).filter(Number.isFinite));}
  catch{/* The invoice cannot be approved with an out-of-range total. */}
  const paidAmount = method === 'آجل' ? numeric(paid) : total;
  const moneyOrDash = (value: number) => Number.isFinite(value) ? `${money(value)} ج.م` : '—';

  function updateLine(id: string, change: Partial<Omit<InvoiceLine, 'id'>>) {
    setLines(current => current.map(line => line.id === id ? {...line, ...change} : line));
  }

  function fieldFeedback(id: string, reason: string) {
    const visible = Boolean(reason && (submitted || touched[id]));
    return {
      id, name: id,
      'aria-invalid': visible,
      'aria-describedby': visible ? id + '-error' : undefined,
      onBlur: () => {
        setTouched(previous => ({...previous, [id]: true}));
        setFieldNotice(reason);
      },
    };
  }

  function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      const customer = customers.find(value => value.id === customerId);
      if (!customer) { customerButton.current?.focus(); throw Error('اختر عميلًا مسجلًا'); }
      checkCustomerDetails(customer);
      if (!date) { form.current?.querySelector<HTMLInputElement>('[name=invoice-date]')?.focus(); throw Error('حدد تاريخ الفاتورة'); }
      if (!lines.length) { addBlendButton.current?.focus(); throw Error('أضف توليفة للفاتورة'); }
      setSubmitted(true);
      const invalidLine = lines.find(line => quantityError(line.quantity) || priceError(line.price));
      if (invalidLine) {
        const field = quantityError(invalidLine.quantity) ? 'quantity' : 'price';
        const fieldId = invoiceId + '-' + invalidLine.id + '-' + field;
        // Wait for React to render the field's error before moving focus.
        requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
        return;
      }
      const invoiceItems: SalesInvoiceItem[] = lines.map(line => {
        const item = blends.find(value => value.id === line.itemId);
        const quantity = numeric(line.quantity);
        const price = numeric(line.price);
        if (!item) {
          throw Error('حدد التوليفة والكمية وسعر البيع لكل سطر');
        }
        const totalPrice = amount(line);
        const totalCost = multiplyMoney(quantity,item.costPrice);
        return {
          itemId: item.id, itemName: item.name, category: item.category, quantity,
          unitLabel: 'كجم', normalizedQtyInBaseUnit: quantity, unitPrice: price, unitCost: item.costPrice,
          totalPrice, totalCost, profit: sumMoney([totalPrice,-totalCost]),
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
      setSaveError('');
      setReview({
        date, saleType: 'wholesale', customerId, customerName: customer.name, items: invoiceItems, subtotal: total,
        discount: 0, totalAmount: total, totalCost: 0, netProfit: 0, paidAmount,
        remainingAmount: roundMoney(total - paidAmount), paymentMethod: method, partnerName: currentPartnerName,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر مراجعة الفاتورة');
    }
  }

  async function confirm() {
    if (!review || saving.current) return;
    saving.current = true;
    setBusy(true);
    setSaveError('');
    try {
      if (!await onSaveSale(review)) throw Error('لم تعتمد الفاتورة؛ راجع الرصيد وحالة الحفظ');
      setReview(undefined);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'تعذر اعتماد الفاتورة');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const input = 'w-full min-w-0 border rounded-xl p-3 bg-white';
  return <main dir="rtl" className="operation-screen invoice-workspace min-h-screen p-4 pb-28 space-y-4">
    <OperationHeader title="إنشاء فاتورة جملة" description="اختار العميل والتوليفات، وحدد السعر المتفق عليه." icon={Receipt} onBack={onBack} busy={busy} />
    <form ref={form} method="post" noValidate className="space-y-4" onSubmit={prepare} aria-busy={busy}>
      <p role="status" className="sr-only">{fieldNotice}</p>
      <section className="operation-surface">
        <h2>العميل والدفع</h2>
        <div className="operation-fields">
          <div className="invoice-choice">
            <span>العميل</span>
            <button ref={customerButton} type="button" className="picker-trigger" disabled={busy} aria-haspopup="dialog" onClick={() => setPicker('customer')}>
              <Search size={17} aria-hidden="true" />{customerName ?? 'اختيار العميل'}
            </button>
          </div>
          <label>تاريخ الفاتورة<input required disabled={busy} className={input} type="date" name="invoice-date" value={date} onChange={event => setDate(event.target.value)} /></label>
          <label>طريقة الدفع<select name="payment-method" disabled={busy} className={input} value={method} onChange={event => setMethod(event.target.value as SalesInvoice['paymentMethod'])}>
            <option>نقدي</option><option>محفظة/انستا باي</option><option>آجل</option>
          </select></label>
          {method === 'آجل' && <label>المدفوع الآن<input required disabled={busy} className={input} type="text" inputMode="decimal" name="paid-amount" value={paid} onChange={event => setPaid(event.target.value)} /></label>}
        </div>
        {!customers.length && <p className="operation-note">أضف بيانات العميل ورقمه ومنطقته من قسم العملاء أولًا.</p>}
      </section>

      <section className="operation-surface space-y-3">
        <div className="invoice-lines-heading">
          <h2>التوليفات في الفاتورة</h2>
          <button ref={addBlendButton} type="button" disabled={busy || !blends.length} onClick={() => setPicker('blend')} className="record-action">
            <Plus size={16} aria-hidden="true" />إضافة توليفة
          </button>
        </div>
        {lines.map(line => {
          const quantityReason = quantityError(line.quantity);
          const priceReason = priceError(line.price);
          const quantity = fieldFeedback(invoiceId + '-' + line.id + '-quantity', quantityReason);
          const price = fieldFeedback(invoiceId + '-' + line.id + '-price', priceReason);
          return <fieldset key={line.id} className="invoice-line">
          <legend>{blends.find(item => item.id === line.itemId)?.name}</legend>
          <div className="operation-fields">
            <div className="invoice-field">
              <label htmlFor={quantity.id}>الكمية بالكيلو</label>
              <input {...quantity} required disabled={busy} className={input} type="text" inputMode="decimal" value={line.quantity} onChange={event => updateLine(line.id, {quantity: event.target.value})} />
              {quantity['aria-invalid'] && <p className="field-error" id={quantity.id + '-error'}>{quantityReason}</p>}
            </div>
            <div className="invoice-field">
              <label htmlFor={price.id}>سعر الكيلو المتفق عليه</label>
              <input {...price} required disabled={busy} className={input} type="text" inputMode="decimal" value={line.price} onChange={event => updateLine(line.id, {price: event.target.value})} />
              {price['aria-invalid'] && <p className="field-error" id={price.id + '-error'}>{priceReason}</p>}
            </div>
          </div>
          <div className="operation-form-footer">
            <p>قيمة السطر <b>{moneyOrDash(amount(line))}</b></p>
            <button type="button" className="record-action text-red-700" disabled={busy} onClick={() => setLines(current => current.filter(value => value.id !== line.id))}>
              <Trash2 size={15} aria-hidden="true" />حذف السطر
            </button>
          </div>
        </fieldset>;
        })}
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
        const newLine = {id:crypto.randomUUID(),itemId:id,quantity:'',price:''};
        setSubmitted(false);
        setLines(current => [...current,newLine]);
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
      {saveError && <p role="alert" className="field-error">{saveError}</p>}
      <h3>الكميات اللي هتتخصم من المخزون</h3>
      <ul className="invoice-review-lines">{review.items.map((line,index) => <li key={index}>
        <span>{line.itemName}</span><b>{money(line.quantity)} كجم</b>
      </li>)}</ul>
    </Modal>}
  </main>;
}
