import React, {useState} from 'react';
import {Plus, Receipt, Trash2} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
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

const amount = (line: InvoiceLine) => Number((Number(line.quantity) * Number(line.price)).toFixed(2));

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
  const blends = items.filter(item => item.category === 'manufactured_blend');
  const total = Number(lines.reduce((sum, line) => sum + amount(line), 0).toFixed(2));
  const paidAmount = method === 'آجل' ? Number(paid) : total;
  const moneyOrDash = (value: number) => Number.isFinite(value) ? `${money(value)} ج.م` : '—';

  function updateLine(id: string, change: Partial<Omit<InvoiceLine, 'id'>>) {
    setLines(current => current.map(line => line.id === id ? {...line, ...change} : line));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
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
        const quantity = Number(line.quantity);
        const price = Number(line.price);
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
      setBusy(true);
      const accepted = await onSaveSale({
        date, saleType: 'wholesale', customerId, customerName: customer.name, items: invoiceItems, subtotal: total,
        discount: 0, totalAmount: total, totalCost: 0, netProfit: 0, paidAmount,
        remainingAmount: Number((total - paidAmount).toFixed(2)), paymentMethod: method, partnerName: currentPartnerName,
      });
      if (!accepted) throw Error('لم تعتمد الفاتورة؛ راجع الرصيد وحالة الحفظ');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر اعتماد الفاتورة');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full min-w-0 border rounded-xl p-3 bg-white';
  return <main dir="rtl" className="operation-screen min-h-screen p-4 pb-28 space-y-4">
    <OperationHeader title="إنشاء فاتورة جملة" description="اختار العميل والتوليفات، وحدد السعر المتفق عليه." icon={Receipt} onBack={onBack} busy={busy} />
    <form noValidate className="space-y-4" onSubmit={save}>
      <section className="operation-surface">
        <h2>العميل والدفع</h2>
        <div className="operation-fields">
          <label>العميل<select required disabled={busy} className={input} value={customerId} onChange={event => setCustomerId(event.target.value)}>
            <option value="">اختر العميل</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} — {customer.area || 'المنطقة غير مسجلة'}</option>)}
          </select></label>
          <label>تاريخ الفاتورة<input required disabled={busy} className={input} type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          <label>طريقة الدفع<select disabled={busy} className={input} value={method} onChange={event => setMethod(event.target.value as SalesInvoice['paymentMethod'])}>
            <option>نقدي</option><option>محفظة/انستا باي</option><option>آجل</option>
          </select></label>
          {method === 'آجل' && <label>المدفوع الآن<input required disabled={busy} className={input} type="number" min="0" step="0.01" value={paid} onChange={event => setPaid(event.target.value)} /></label>}
        </div>
        {!customers.length && <p className="operation-note">أضف بيانات العميل ورقمه ومنطقته من قسم العملاء أولًا.</p>}
      </section>

      <section className="operation-surface space-y-3">
        <h2>التوليفات في الفاتورة</h2>
        {lines.map((line, index) => <fieldset key={line.id} className="record-card space-y-2">
          <legend>توليفة {index + 1}</legend>
          <div className="operation-fields">
            <label>التوليفة<select required disabled={busy} className={input} value={line.itemId} onChange={event => updateLine(line.id, {itemId: event.target.value})}>
              <option value="">اختر توليفة</option>
              {blends.map(item => <option key={item.id} value={item.id}>{item.name} (المتاح {item.stock} كجم)</option>)}
            </select></label>
            <label>الكمية بالكيلو<input required disabled={busy} className={input} type="number" min="0" step="any" value={line.quantity} onChange={event => updateLine(line.id, {quantity: event.target.value})} /></label>
            <label>سعر الكيلو المتفق عليه<input required disabled={busy} className={input} type="number" min="0" step="any" value={line.price} onChange={event => updateLine(line.id, {price: event.target.value})} /></label>
          </div>
          <div className="operation-form-footer">
            <p>قيمة السطر {moneyOrDash(amount(line))}</p>
            <button type="button" className="record-action text-red-700" disabled={busy} onClick={() => setLines(current => current.filter(value => value.id !== line.id))}>
              <Trash2 size={15} aria-hidden="true" />حذف السطر
            </button>
          </div>
        </fieldset>)}
        <button type="button" disabled={busy || !blends.length} onClick={() => setLines(current => [...current, {id: crypto.randomUUID(), itemId: '', quantity: '', price: ''}])} className="record-action">
          <Plus size={16} aria-hidden="true" />إضافة توليفة
        </button>
        {!blends.length && <p className="operation-note">أضف توليفة جاهزة في قسم المنتجات أولًا.</p>}
      </section>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      <footer className="operation-surface operation-form-footer">
        <dl>
          <div><dt>الإجمالي</dt><dd>{moneyOrDash(total)}</dd></div>
          <div><dt>المدفوع</dt><dd>{moneyOrDash(paidAmount)}</dd></div>
          <div><dt>المتبقي</dt><dd>{moneyOrDash(total - paidAmount)}</dd></div>
        </dl>
        <button type="submit" disabled={busy} className="operation-primary">
          {busy ? 'جارٍ اعتماد الفاتورة…' : 'اعتماد الفاتورة وخصم المخزون'}
        </button>
      </footer>
    </form>
  </main>;
}
