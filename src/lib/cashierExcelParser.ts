import type { InventoryItem } from '../types/erp';
import { mapRawCashierRows } from './cashierRows';
export {mapRawCashierRows, cashierSourceId} from './cashierRows';
export type {ParsedCashierRow} from './cashierRows';

export async function parseCashierExcelBuffer(buffer: ArrayBuffer, catalog: InventoryItem[]) {
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error('حجم الملف أكبر من 10 ميجابايت');
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, {type:'array'});
  if (!workbook.SheetNames.length) throw new Error('الملف لا يحتوي على ورقة بيانات');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], {defval:''});
  if (!rows.length || rows.length > 10000) throw new Error('عدد الصفوف غير صالح؛ الحد الأقصى 10000');
  return mapRawCashierRows(rows,catalog);
}

export async function downloadSampleCashierExcel() {
  const XLSX = await import('xlsx');
  const sampleData = [
    {
      'الكود': 'BL-302',
      'اسم الصنف': 'توليفة محوج مخصوص',
      'الكمية': 3.5,
      'الوحدة': 'كجم',
      'الإجمالي': 2100,
    },
    {
      'الكود': 'BL-301',
      'اسم الصنف': 'ربع بن سادة فاتح (250 جم)',
      'الكمية': 8,
      'الوحدة': 'ربع كيلو',
      'الإجمالي': 1080,
    },
    {
      'الكود': 'DR-402',
      'اسم الصنف': 'قهوة تركي دبل',
      'الكمية': 25,
      'الوحدة': 'كوب',
      'الإجمالي': 875,
    },
    {
      'الكود': 'DR-403',
      'اسم الصنف': 'قهوة فرنساوي',
      'الكمية': 14,
      'الوحدة': 'كوب',
      'الإجمالي': 630,
    },
    {
      'الكود': 'DR-404',
      'اسم الصنف': 'إسبريسو دبل',
      'الكمية': 10,
      'الوحدة': 'كوب',
      'الإجمالي': 400,
    },
    {
      'الكود': 'PR-501',
      'اسم الصنف': 'مياه صغيرة',
      'الكمية': 20,
      'الوحدة': 'قطعة',
      'الإجمالي': 160,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'مبيعات_الكاشير');
  XLSX.writeFile(wb, `مبيعات_كاشير_بن_العجوز_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
