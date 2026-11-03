import React,{useState} from 'react';
import type {supplierPurchaseHistory} from '../lib/supplierPurchases';
import {RecordPagination,useRecordPage} from './RecordPagination';
export function SupplierPurchasePanels({data}:{data:ReturnType<typeof supplierPurchaseHistory>}){
 const [latestOpen,setLatestOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
 const page=useRecordPage(data.history,'supplier-history');
 return <>
  <details onToggle={e=>setLatestOpen(e.currentTarget.open)}><summary>آخر أسعار الشراء لكل صنف</summary>{latestOpen&&(data.latest.length?data.latest.map(l=><p key={l.itemId}>{l.itemName}: {l.purchasePrice} ج.م / {l.unit} — {l.date}</p>):<p>لا توجد مشتريات بعد</p>)}</details>
  <details onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>سجل المشتريات وأسعار الدفعات</summary>{historyOpen&&<><RecordPagination {...page}/>{page.visible.map((l,index)=><p key={l.invoiceId+'-'+index}>{l.date} — {l.invoiceNumber}: {l.itemName}، {l.quantity} {l.unit} × {l.purchasePrice} ج.م قبل الضريبة</p>)}</>}</details>
 </>;
}
