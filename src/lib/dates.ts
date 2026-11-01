export function businessDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export type ReportPeriod = 'today' | '7days' | '30days' | 'all';
export function isInPeriod(
  value: string,
  period: ReportPeriod,
  now = new Date(),
): boolean {
  if (period === 'all') return true;
  const today = businessDate(now);
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(
    start.getUTCDate() -
      (period === '7days' ? 6 : period === '30days' ? 29 : 0),
  );
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= start.toISOString().slice(0, 10) &&
    value <= today
  );
}
