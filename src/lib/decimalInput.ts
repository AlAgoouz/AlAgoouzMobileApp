export function parseLocalizedNumber(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  let text = String(value ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
  if (!text) return undefined;
  const negative = /^\(.*\)$/.test(text);
  text = text
    .replace(/[()\s\u200e\u200f]/g, '')
    .replace(/٬/g, '')
    .replace(/٫/g, '.');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  else if (/^-?\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return undefined;
  const number = Number(text) * (negative ? -1 : 1);
  return Number.isFinite(number) ? number : undefined;
}

// A single comma followed by three digits can indicate either decimals or thousands.
export function ambiguousDecimal(value: unknown): boolean {
  return typeof value === 'string' &&
    /^[+-]?[٠-٩۰-۹\d]{1,3},[٠-٩۰-۹\d]{3}$/.test(value.normalize('NFKC').replace(/[()\s\u200e\u200f]/g, ''));
}

export function parseDecimalInput(value: unknown): number | undefined {
  return ambiguousDecimal(value) ? undefined : parseLocalizedNumber(value);
}

export function decimalValue(value: unknown): number {
  return parseDecimalInput(value) ?? NaN;
}

export function hasInvalidNumbers(values: (number | undefined)[]): boolean {
  return values.some(value => value !== undefined && (!Number.isFinite(value) || value < 0));
}
