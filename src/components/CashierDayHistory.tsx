import React, { useMemo, useState } from 'react';
import type { CashierDay } from '../types/erp';
import { RecordPagination, useRecordPage } from './RecordPagination';
import { EmptyState } from './EmptyState';
import { Calendar } from 'lucide-react';

export function CashierDayHistory({ days }: { days: CashierDay[] }) {
  const [search, setSearch] = useState('');
  const sorted = useMemo(
    () => [...days].filter((d) => d.date.includes(search)).sort((a, b) => b.date.localeCompare(a.date)),
    [days, search],
  );
  const page = useRecordPage(sorted, search);

  return (
    <section className="record-workspace space-y-3">
      <label className="record-search">
        البحث بتاريخ يوم الكاشير
        <input
          placeholder="YYYY-MM-DD"
          className="operation-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <RecordPagination {...page} />
      <div className="record-grid">
        {page.visible.map((d) => (
          <article key={d.id} className="record-card space-y-2">
            <div className="record-heading">
              <h2>
                {d.date} — {d.status === 'approved' ? 'يوم معتمد' : 'يوم غير مكتمل'}
              </h2>
              <span className="record-badge">{d.status === 'approved' ? 'معتمد' : 'قيد المراجعة'}</span>
            </div>
            <dl className="record-facts">
              <div>
                <dt>الإيراد</dt>
                <dd>{d.financialReport?.totalRevenue.toLocaleString('ar-EG') ?? 'غير محدد'} ج.م</dd>
              </div>
              <div>
                <dt>التكلفة</dt>
                <dd>
                  {d.status === 'approved'
                    ? (d.correctedTotalCost ?? d.totalCost)?.toLocaleString('ar-EG') + ' ج.م'
                    : 'بانتظار اعتماد التقريرين'}
                </dd>
              </div>
              {d.status === 'approved' && (
                <div>
                  <dt>مجمل الربح</dt>
                  <dd>
                    {Number((d.financialReport!.totalRevenue - (d.correctedTotalCost ?? d.totalCost!)).toFixed(2)).toLocaleString(
                      'ar-EG',
                    )}{' '}
                    ج.م
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-ink wrap-break-word">
              المالي: {d.financialReport?.fileName ?? 'ناقص'} — الأصناف: {d.itemsReport?.fileName ?? 'ناقص'}
            </p>
            {!!d.shortages?.length && (
              <p role="alert" className="text-xs font-bold text-status-danger bg-status-danger-bg border border-status-danger-line rounded-md p-2">
                سُجل عجز في {d.shortages.length} أصناف عند الاعتماد.
              </p>
            )}
          </article>
        ))}
      </div>
      {!page.total && <EmptyState icon={Calendar} title="لا توجد أيام كاشير مطابقة" description="غيّر تاريخ البحث أو ارفع تقارير يوم عمل جديد." />}
    </section>
  );
}
