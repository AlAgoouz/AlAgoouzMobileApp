import type { InventoryItem } from '../types/erp';

export interface ParsedCashierRow {
  rawName: string;
  rawCode?: string;
  quantity: number;
  unitHint: 'kg' | 'gram' | 'piece' | 'liter' | 'ml';
  totalPrice?: number;
  unitPrice?: number;
  matchedItem?: InventoryItem;
  error?: string;
}

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

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[^\p{L}\p{N}]/gu, '');
const aliases: Record<string, string[]> = {
  code: [
    'كود',
    'الكود',
    'باركود',
    'الباركود',
    'كود الصنف',
    'code',
    'barcode',
    'item code',
    'product code',
  ],
  name: [
    'اسم',
    'الصنف',
    'اسم الصنف',
    'صنف',
    'المنتج',
    'اسم المنتج',
    'البيان',
    'name',
    'item',
    'product',
    'item name',
    'product name',
  ],
  qty: [
    'الكمية',
    'كمية',
    'الكميه',
    'عدد',
    'العدد',
    'وزن',
    'الوزن',
    'qty',
    'quantity',
    'sold quantity',
  ],
  unit: ['وحدة', 'الوحدة', 'وحده', 'unit', 'unit of measure'],
  total: [
    'الاجمالي',
    'الإجمالي',
    'اجمالي',
    'إجمالي',
    'القيمة',
    'قيمة',
    'total',
    'amount',
    'total price',
    'total amount',
  ],
  price: ['سعر', 'السعر', 'سعر الوحدة', 'price', 'unit price'],
};

export function mapRawCashierRows(
  rows: Record<string, unknown>[],
  catalog: InventoryItem[],
): ParsedCashierRow[] {
  return rows
    .filter((row) => Object.values(row).some((v) => String(v ?? '').trim()))
    .map((row) => {
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        const field = Object.keys(aliases).find((f) =>
          aliases[f].some((alias) => normalize(alias) === normalize(key)),
        );
        if (field) values[field] = value;
      }
      const rawName = String(values.name ?? '').trim();
      const rawCode = String(values.code ?? '').trim();
      const rawQuantity = parseLocalizedNumber(values.qty);
      const totalPrice = parseLocalizedNumber(values.total);
      const unitPrice = parseLocalizedNumber(values.price);
      let error: string | undefined;
      if (!rawName && !rawCode) error = 'عمود اسم الصنف أو الكود غير موجود';
      if (rawQuantity === undefined || rawQuantity === 0)
        error = 'الكمية غير صالحة أو صفر';
      // Returns require an original invoice; never turn negative source rows into sales.
      if (
        (rawQuantity ?? 0) < 0 ||
        (totalPrice ?? 0) < 0 ||
        (unitPrice ?? 0) < 0
      )
        error = 'هذا الصف مرتجع؛ سجله من الفاتورة الأصلية قبل استيراد الملف';
      if (
        values.total !== undefined &&
        String(values.total).trim() !== '' &&
        totalPrice === undefined
      )
        error = 'الإجمالي غير صالح';
      if (
        values.price !== undefined &&
        String(values.price).trim() !== '' &&
        unitPrice === undefined
      )
        error = 'سعر الوحدة غير صالح';
      let candidates = rawCode
        ? catalog.filter(
            (i) =>
              normalize(i.code) === normalize(rawCode) || i.barcode === rawCode,
          )
        : [];
      const nameWithoutWeight = rawName
        .replace(/\([^)]*\)/g, '')
        .replace(/\b(?:125|250|500|1000)\b/g, '')
        .replace(/ثمن|تمن|ربع|نصف|نص\s|كيلو|كجم|جرام|جم/g, '')
        .trim();
      if (!rawCode) {
        const exact = catalog.filter(
          (i) =>
            normalize(i.name) === normalize(rawName) ||
            normalize(i.name) === normalize(nameWithoutWeight),
        );
        candidates = exact.length
          ? exact
          : normalize(nameWithoutWeight).length >= 4
            ? catalog.filter(
                (i) =>
                  normalize(i.name).includes(normalize(nameWithoutWeight)) ||
                  normalize(nameWithoutWeight).includes(normalize(i.name)),
              )
            : [];
      }
      const matchedItem = candidates.length === 1 ? candidates[0] : undefined;
      if (!matchedItem)
        error =
          candidates.length > 1
            ? 'الاسم يطابق أكثر من صنف؛ استخدم الكود'
            : 'الصنف غير موجود أو الكود غير صحيح';
      const unit = String(values.unit ?? '')
        .trim()
        .toLowerCase();
      const hint = `${unit} ${rawName}`;
      const pack = /ثمن|تمن/.test(hint)
        ? 0.125
        : /ربع/.test(hint)
          ? 0.25
          : /نصف|نص(?:\s|$)/.test(hint)
            ? 0.5
            : undefined;
      let unitHint: ParsedCashierRow['unitHint'] =
        matchedItem?.baseUnit ?? 'piece';
      let quantity = rawQuantity ?? 0;
      const grams = /^(جرام|جم|g|gm|gram|grams)$/.test(unit);
      const kilos = /^(كيلو|كجم|kg|kilogram|kilograms)$/.test(unit);
      if (grams) unitHint = 'gram';
      else if (kilos) unitHint = 'kg';
      else if (pack && matchedItem?.baseUnit === 'kg') {
        unitHint = 'kg';
        quantity *= pack;
      } else if (/^(مل|مليلتر|ml)$/.test(unit)) unitHint = 'ml';
      else if (/^(لتر|liter|litre|l)$/.test(unit)) unitHint = 'liter';
      else if (
        /^(قطعة|قطعه|كوب|عدد|عبوة|عبوه|piece|pcs|cup|bottle)$/.test(unit)
      )
        unitHint = 'piece';
      else if (unit) error = `وحدة غير معروفة: ${unit}`;
      else if (matchedItem?.baseUnit === 'kg')
        error = 'حدد وحدة الوزن صراحةً لتجنب خصم كمية خاطئة';
      if (
        matchedItem &&
        ((matchedItem.baseUnit === 'piece' && unitHint !== 'piece') ||
          (matchedItem.baseUnit === 'kg' &&
            !['kg', 'gram'].includes(unitHint)) ||
          (matchedItem.baseUnit === 'liter' &&
            !['liter', 'ml'].includes(unitHint)))
      )
        error = 'الوحدة لا تطابق وحدة الصنف';
      return {
        rawName,
        rawCode,
        quantity,
        unitHint,
        totalPrice,
        unitPrice,
        matchedItem,
        error,
      };
    });
}

export async function cashierSourceId(
  rows: ParsedCashierRow[],
  saleDate: string,
): Promise<string> {
  const canonical = JSON.stringify({
    date: saleDate,
    rows: rows
      .map((r) => ({
        id: r.matchedItem?.id ?? r.rawCode ?? r.rawName,
        quantity: Number(
          (['gram', 'ml'].includes(r.unitHint)
            ? r.quantity / 1000
            : r.quantity
          ).toFixed(6),
        ),
        total:
          r.totalPrice ??
          (r.unitPrice !== undefined
            ? Number((r.unitPrice * r.quantity).toFixed(2))
            : null),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
