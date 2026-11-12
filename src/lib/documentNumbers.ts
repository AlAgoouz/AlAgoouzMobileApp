import { businessDate } from './dates';

export type DocumentSeries = 'production' | 'stocktaking';

const seriesPrefixes: Record<DocumentSeries, string> = {
  production: 'PRD',
  stocktaking: 'AUD',
};

export function documentNumberPrefix(
  series: DocumentSeries,
  date = businessDate(),
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('تاريخ العمل غير صالح');
  return `${seriesPrefixes[series]}-${date.slice(0, 4)}`;
}

export function nextSequentialNumber(
  existing: string[],
  prefix: string,
  startFrom: number,
): string {
  const suffixes = existing
    .map((value) => Number(value.match(/(\d+)$/)?.[1]))
    .filter((n) => Number.isFinite(n));
  const next =
    suffixes.reduce((max, value) => Math.max(max, value), startFrom) + 1;
  return `${prefix}-${next}`;
}
