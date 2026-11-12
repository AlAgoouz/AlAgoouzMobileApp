import React,{useState} from 'react';
import type {supplierPurchaseHistory} from '../lib/supplierPurchases';
import {RecordPagination,useRecordPage} from './RecordPagination';
export function SupplierPurchasePanels({data,onOpenInvoice}:{data:ReturnType<typeof supplierPurchaseHistory>;onOpenInvoice?:(id:string)=>void}){
 const [latestOpen,setLatestOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
 const page=useRecordPage(data.history,'supplier-history');
 return <>
  <details onToggle={e=>setLatestOpen(e.currentTarget.open)}><summary>آخر أسعار الشراء لكل صنف</summary>{latestOpen&&(data.latest.length?data.latest.map(l=><p key={l.itemId}>{l.itemName}: {l.purchasePrice} ج.م / {l.unit} — {l.date} {onOpenInvoice&&<button type="button" className="record-action" onClick={()=>onOpenInvoice(l.invoiceId)}>فتح الفاتورة</button>}</p>):<p>لا توجد مشتريات بعد</p>)}</details>
  <details onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>سجل المشتريات وأسعار الدفعات</summary>{historyOpen&&<><RecordPagination {...page}/>{page.visible.map((l,index)=><p key={l.invoiceId+'-'+index}>{l.date} — {l.invoiceNumber}: {l.itemName}، {l.quantity} {l.unit} × {l.purchasePrice} ج.م قبل الضريبة {onOpenInvoice&&<button type="button" className="record-action" onClick={()=>onOpenInvoice(l.invoiceId)}>فتح الفاتورة</button>}</p>)}</>}</details>
 </>;
}
