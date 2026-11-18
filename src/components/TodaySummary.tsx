import React from 'react';
import {Eye, EyeOff} from 'lucide-react';
import type {DashboardModel} from '../lib/readModels';
import {ActionButton} from './ActionButton';
import {Money} from './Money';

export function TodaySummary({date, model, error, onRetry, hideProfit, onToggleProfit}: {
  date: string;
  model: DashboardModel | null;
  error?: string;
  onRetry?: () => void;
  hideProfit: boolean;
  onToggleProfit: () => void;
}) {
  const entry = model?.report.entries.find(row => row.date === date);
  const profit = entry ? entry.profit : 0;
  const cash = model?.cash?.to === date ? model.cash.closing : null;
  return <section className="visual-card today-summary" aria-labelledby="today-summary-title">
    <header>
      <h2 id="today-summary-title">ملخص اليوم</h2>
      {model && <ActionButton onClick={onToggleProfit} aria-pressed={hideProfit}>
        {hideProfit ? <Eye size={16} aria-hidden="true"/> : <EyeOff size={16} aria-hidden="true"/>}
        خصوصية الربح
      </ActionButton>}
    </header>
    {model ? <dl className="today-metrics">
      <div><dt>المبيعات المسجلة</dt><dd><Money value={entry?.sales ?? 0}/></dd></div>
      <div><dt>صافي الربح</dt><dd>{hideProfit ? '••••' : profit === null ? 'بانتظار التكلفة' : <Money value={profit}/>}</dd></div>
      <div><dt>الرصيد الدفتري</dt><dd>{cash === null ? 'غير متاح' : <Money value={cash}/>}</dd></div>
    </dl> : error ? <p role="status">تعذر تحميل أرقام اليوم. {onRetry && <ActionButton onClick={onRetry}>إعادة تحميل ملخص اليوم</ActionButton>}</p>
      : <p role="status">جارٍ تحميل أرقام اليوم…</p>}
    {model && error && <p className="operation-note" role="status">أرقام اليوم معروضة من آخر تحديث ناجح. {onRetry && <ActionButton onClick={onRetry}>تحديث ملخص اليوم</ActionButton>}</p>}
  </section>;
}
