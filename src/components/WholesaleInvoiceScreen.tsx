import React,{useState} from 'react';
import type {InventoryItem,Customer,SalesInvoice,SalesInvoiceItem} from '../types/erp';
import {businessDate} from '../lib/dates';
import {checkCustomerDetails} from '../lib/contactDetails';
export function WholesaleInvoiceScreen({items,customers,currentPartnerName,onSaveSale,onBack}: {
 items:InventoryItem[];customers:Customer[];currentPartnerName:string;
 onSaveSale:(invoice:Omit<SalesInvoice,'id'|'invoiceNumber'>)=>Promise<boolean>;
 onBack:()=>void;
}){
 const [customerId,setCustomerId]=useState(''),[date,setDate]=useState(businessDate());
 const [method,setMethod]=useState<SalesInvoice['paymentMethod']>('نقدي');
 const [paid,setPaid]=useState('0'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [lines,setLines]=useState<{itemId:string;quantity:string;price:string}[]>([]);
 const blends=items.filter(i=>i.category==='manufactured_blend');
 const total=Number(lines.reduce((s,l)=>s+Number((Number(l.quantity)*Number(l.price)).toFixed(2)),0).toFixed(2));
 const input='w-full border rounded-xl p-3 bg-white';
 const save=async()=>{
  if(busy)return;setError('');
  try{
   const customer=customers.find(c=>c.id===customerId);if(!customer)throw Error('اختر عميلًا مسجلًا');
   checkCustomerDetails(customer);
   if(!lines.length)throw Error('أضف توليفة للفاتورة');
   const invoiceItems:SalesInvoiceItem[]=lines.map(l=>{
    const item=blends.find(i=>i.id===l.itemId);const quantity=Number(l.quantity),price=Number(l.price);
    if(!item||!l.quantity.trim()||!l.price.trim()||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0)throw Error('حدد التوليفة والكمية وسعر البيع لكل سطر');
    const amount=Number((quantity*price).toFixed(2));const cost=Number((quantity*item.costPrice).toFixed(2));
    return {itemId:item.id,itemName:item.name,category:item.category,quantity,unitLabel:'كجم',normalizedQtyInBaseUnit:quantity,unitPrice:price,unitCost:item.costPrice,totalPrice:amount,totalCost:cost,profit:amount-cost};
   });
   const paidAmount=method==='آجل'?Number(paid):total;
   if(!Number.isFinite(paidAmount)||paidAmount<0||paidAmount>total||(method==='آجل'&&!paid.trim()))throw Error('المدفوع يجب أن يكون بين صفر وإجمالي الفاتورة');
   setBusy(true);
   const accepted=await onSaveSale({date,saleType:'wholesale',customerId,customerName:customer.name,items:invoiceItems,subtotal:total,discount:0,totalAmount:total,totalCost:0,netProfit:0,paidAmount,remainingAmount:Number((total-paidAmount).toFixed(2)),paymentMethod:method,partnerName:currentPartnerName});
   if(!accepted)throw Error('لم تعتمد الفاتورة؛ راجع الرصيد وحالة الحفظ');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <main dir="rtl" className="min-h-screen bg-[#FAF8F4] p-4 pb-28 space-y-4">
  <button onClick={onBack}>رجوع</button><h1 className="font-black text-xl">إنشاء فاتورة جملة</h1>
  <label className="block">العميل<select className={input} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">اختر العميل</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} — {c.area||'المنطقة غير مسجلة'}</option>)}</select></label>
  {!customers.length&&<p>أضف بيانات العميل ورقمه ومنطقته من قسم العملاء أولًا.</p>}
  <label className="block">تاريخ الفاتورة<input className={input} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
  <label className="block">طريقة الدفع<select className={input} value={method} onChange={e=>setMethod(e.target.value as SalesInvoice['paymentMethod'])}><option>نقدي</option><option>محفظة/انستا باي</option><option>آجل</option></select></label>
  {method==='آجل'&&<label className="block">المدفوع الآن (صفر للآجل الكامل)<input className={input} type="number" min="0" value={paid} onChange={e=>setPaid(e.target.value)}/></label>}
  <h2 className="font-bold">محتويات الفاتورة — التوليفات فقط</h2>
  {lines.map((l,index)=><fieldset key={index} className="border rounded-xl p-3 space-y-2"><legend>الصنف {index+1}</legend>
   <label className="block">التوليفة<select className={input} value={l.itemId} onChange={e=>setLines(lines.map((row,i)=>i===index?{...row,itemId:e.target.value}:row))}><option value="">اختر توليفة</option>{blends.map(i=><option key={i.id} value={i.id}>{i.name} (المتاح {i.stock} كجم)</option>)}</select></label>
   <label className="block">الكمية بالكيلو<input className={input} type="number" step="any" value={l.quantity} onChange={e=>setLines(lines.map((row,i)=>i===index?{...row,quantity:e.target.value}:row))}/></label>
   <label className="block">سعر الكيلو المتفق عليه<input className={input} type="number" step="0.01" value={l.price} onChange={e=>setLines(lines.map((row,i)=>i===index?{...row,price:e.target.value}:row))}/></label>
   <button onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>حذف السطر</button>
  </fieldset>)}
  <button onClick={()=>setLines([...lines,{itemId:'',quantity:'',price:''}])} className="border rounded-xl p-3">إضافة توليفة</button>
  <p className="font-black">الإجمالي: {Number.isFinite(total)?total.toLocaleString('ar-EG'):'—'} ج.م</p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  <button disabled={busy} onClick={()=>void save()} className="w-full bg-[#1E1612] text-white p-3 rounded-xl disabled:opacity-50">{busy?'جارٍ اعتماد الفاتورة…':'اعتماد الفاتورة وخصم المخزون'}</button>
 </main>;
}
