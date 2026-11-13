export const normalizeRecordSearch = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065f\u0640]/g, '')
  .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) % 16));

export function matchesRecordSearch(query: string, ...fields: (string | undefined)[]) {
  const terms = normalizeRecordSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const target = normalizeRecordSearch(fields.filter(Boolean).join(' '));
  return terms.every(term => target.includes(term));
}
