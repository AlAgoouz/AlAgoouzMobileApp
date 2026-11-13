import React from 'react';
import {Modal} from './Modal';
import {RecordPagination,useRecordPage} from './RecordPagination';
import {money} from '../lib/reporting';
import type {CashierDay} from '../types/erp';
export function CashierDayDetail({day,names,onClose}:{day:CashierDay;names:Record<string,string>;onClose:()=>void}){
 const corrections=useRecordPage(day.costCorrections??[],day.id,12);
 const lines=useRecordPage(day.itemsReport?.lines??[],day.id),consumption=useRecordPage(day.consumption??[],day.id);
 return <Modal wide title={`تفاصيل يوم ${day.date}`} description={day.status==='approved'?'يوم معتمد؛ الإيراد والمخزون مسجلان مرة واحدة.':'يوم ينتظر اكتمال التقارير والاعتماد.'} onClose={onClose}>
  <dl className="record-facts"><div><dt>إيراد التقرير المالي</dt><dd>{day.financialReport?money(day.financialReport.totalRevenue)+' ج.م':'لم يصل'}</dd></div><div><dt>تكلفة الاستهلاك عند الاعتماد</dt><dd>{day.totalCost!==undefined?money(day.totalCost)+' ج.م':'لم تُحدد'}</dd></div></dl>
  {day.correctedTotalCost!==undefined&&day.correctedTotalCost!==day.totalCost&&<dl className="record-facts">
   <div><dt>تكلفة يوم البيع بعد التسوية</dt><dd>{money(day.correctedTotalCost)} ج.م</dd></div>
   <div><dt>فرق التكلفة على يوم البيع</dt><dd>{money(day.correctedTotalCost-(day.totalCost??0))} ج.م</dd></div>
  </dl>}
  {corrections.total>0&&<section className="space-y-2" aria-label="تسوية عجز اليوم">
   <h3 className="font-bold">تسوية عجز اليوم</h3>
   {corrections.total>corrections.pageSize&&<RecordPagination {...corrections}/>}
   {corrections.visible.map(line=><article key={line.itemId} className="record-card">
    <h4>{names[line.itemId]??line.itemId}</h4>
    <p>الكمية المسعّرة من التوريد: {line.covered.toLocaleString('ar-EG',{maximumFractionDigits:6})} · كمية العجز اللي لسه بتكلفة الاعتماد: {line.uncovered.toLocaleString('ar-EG',{maximumFractionDigits:6})}</p>
    <p>تكلفة الصنف بعد التسوية: {money(line.totalCost)} ج.م</p>
    <ul>{line.allocations.map(entry=><li key={entry.purchaseId}>
     فاتورة {entry.invoiceNumber} · {entry.purchaseDate} · {entry.quantity.toLocaleString('ar-EG',{maximumFractionDigits:6})} × {money(entry.unitCost)} ج.م
    </li>)}</ul>
   </article>)}
  </section>}
  <p>الملف المالي: {day.financialReport?.fileName??'ناقص'} · ملف الأصناف: {day.itemsReport?.fileName??'ناقص'}</p>
  {day.approvedAt&&<p>الاعتماد: {day.approvedAt} · {day.partnerName}</p>}
  <h3 className="font-bold">الأصناف المباعة</h3><p className="text-xs">الأسماء الحالية للأصناف، والكميات المحفوظة مع التقرير.</p><RecordPagination {...lines}/>
  <div className="record-grid">{lines.visible.map((line,i)=><article className="record-card" key={i}><h4>{names[line.itemId]??line.itemId}</h4><p>{money(line.quantity)} {line.unitLabel}</p></article>)}</div>
  <h3 className="font-bold">استهلاك المخزون وتكلفته المسجلة</h3><RecordPagination {...consumption}/>
  <div className="record-grid">{consumption.visible.map(line=><article className="record-card" key={line.itemId}><h4>{names[line.itemId]??line.itemId}</h4><p>الكمية بوحدة المخزون: {money(line.quantity)}</p><p>تكلفة الوحدة: {money(line.unitCost)} · الإجمالي: {money(line.totalCost)} ج.م</p>{day.shortages?.find(s=>s.itemId===line.itemId)&&<p className="text-red-700">العجز: {money(day.shortages.find(s=>s.itemId===line.itemId)!.shortage)}</p>}</article>)}</div>
  {!day.consumption&&<p>الاستهلاك يُسجل عند اعتماد اليوم.</p>}
 </Modal>;
}
