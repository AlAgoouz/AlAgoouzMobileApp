import React, {useMemo} from 'react';
import type {CashierDay, InventoryItem} from '../types/erp';
import {cashierDayImpact} from '../lib/cashierDays';
import {money} from '../lib/reporting';
import {unitLabel} from '../lib/units';
import {Modal} from './Modal';
import {RecordPagination, useRecordPage} from './RecordPagination';

export function CashierApprovalPreview({day, items, busy, error, onApprove, onClose}: {
  day: CashierDay;
  items: InventoryItem[];
  busy: boolean;
  error: string;
  onApprove: () => void;
  onClose: () => void;
}) {
  const impact = useMemo(() => {
    if (!day.itemsReport || !day.financialReport) return {error: 'يلزم الملف المالي وملف الأصناف لنفس اليوم.'} as const;
    try {
      const result = cashierDayImpact(day.itemsReport.lines, items, day.date);
      const quantities = new Map(result.consumption.map(row => [row.itemId, row.quantity]));
      const stockRows = result.items.flatMap(item => {
        const quantity = quantities.get(item.id);
        return quantity === undefined ? [] : [{item, quantity}];
      });
      stockRows.sort((a, b) => Number(b.item.stock < 0) - Number(a.item.stock < 0) || a.item.name.localeCompare(b.item.name, 'ar-EG'));
      return {...result, stockRows};
    } catch (error) {
      return {error: error instanceof Error ? error.message : 'تعذر حساب أثر يوم الكاشير.'} as const;
    }
  }, [day, items]);
  const page = useRecordPage('stockRows' in impact ? impact.stockRows : [], day.id);
  const ready = 'stockRows' in impact;
  return <Modal wide title={`مراجعة اعتماد يوم ${day.date}`} onClose={onClose} busy={busy}
    footer={<button type="button" className="operation-primary" onClick={onApprove} disabled={!ready || busy}>
      {busy ? 'جارٍ الاعتماد…' : 'تأكيد الاعتماد وخصم الأصناف'}
    </button>}>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {busy ? <p role="status">جارٍ تأكيد اعتماد اليوم…</p> : <>
    <dl className="record-facts">
      <div><dt>التقرير المالي</dt><dd>{day.financialReport?.fileName ?? 'ناقص'}</dd></div>
      <div><dt>تقرير الأصناف</dt><dd>{day.itemsReport?.fileName ?? 'ناقص'}</dd></div>
      <div><dt>مبيعات اليوم — Begun</dt><dd>{day.financialReport ? money(day.financialReport.totalRevenue) + ' ج.م' : 'ناقص'}</dd></div>
      {ready && <div><dt>التكلفة المتوقعة</dt><dd>{money(impact.totalCost)} ج.م</dd></div>}
    </dl>
    {!ready ? <p role="alert" className="text-red-700">{impact.error}</p> : <>
      {impact.shortages.length > 0 && <p className="operation-note text-red-700">{impact.shortages.length} صنف رصيده هيبقى بالسالب بعد الاعتماد.</p>}
      <h3 className="font-bold">الخصم والرصيد المتوقع</h3>
      <RecordPagination {...page} />
      <ul className="record-grid">
        {page.visible.map(({item, quantity}) => <li key={item.id} className="record-card">
          <h4>{item.name}</h4>
          <p>الخصم {quantity.toLocaleString('ar-EG', {maximumFractionDigits: 6})} {unitLabel(item.baseUnit)}</p>
          <p className={item.stock < 0 ? 'text-red-700 font-bold' : undefined}>الرصيد بعد الخصم {item.stock.toLocaleString('ar-EG', {maximumFractionDigits: 6})} {unitLabel(item.baseUnit)}</p>
        </li>)}
      </ul>
    </>}
    </>}
  </Modal>;
}
