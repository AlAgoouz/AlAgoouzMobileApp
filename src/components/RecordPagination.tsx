import React, { useMemo, useState } from 'react';

export function useRecordPage<T>(
  records: readonly T[],
  resetKey: unknown,
  pageSize = 50,
  controlled?: { page: number; setPage: (page: number) => void },
) {
  const [position, setPosition] = useState({ key: resetKey, page: 0 });
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const requestedPage = controlled?.page ?? (position.key === resetKey ? position.page : 0);
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const visible = useMemo(() => records.slice(page * pageSize, (page + 1) * pageSize), [records, page, pageSize]);
  const setPage = (next: number) => {
    const clampedPage = Math.max(0, Math.min(next, pages - 1));
    if (controlled) controlled.setPage(clampedPage);
    else setPosition({ key: resetKey, page: clampedPage });
  };
  return { visible, page, pages, total: records.length, pageSize, setPage };
}

export function RecordPagination({
  page,
  pages,
  total,
  pageSize,
  setPage,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  setPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav
      aria-label="صفحات السجل"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-card p-2.5 text-xs text-ink"
    >
      <button
        type="button"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        className="action-button min-h-[44px] min-w-[44px] px-3 py-2 text-xs disabled:opacity-40"
      >
        الصفحة السابقة
      </button>
      <span role="status" className="font-bold text-ink-strong [font-variant-numeric:tabular-nums]">
        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} من {total}
      </span>
      <button
        type="button"
        disabled={page === pages - 1}
        onClick={() => setPage(page + 1)}
        className="action-button min-h-[44px] min-w-[44px] px-3 py-2 text-xs disabled:opacity-40"
      >
        الصفحة التالية
      </button>
    </nav>
  );
}
