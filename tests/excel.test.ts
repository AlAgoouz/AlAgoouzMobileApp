import { it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCashierExcelBuffer } from '../src/lib/cashierExcelParser';
import { INITIAL_ITEMS } from '../src/data/initialData';
it('reads a real XLSX workbook and converts eight quarter-kilo packs to two kilos', async () => {
  const sheet = XLSX.utils.json_to_sheet([
    {
      الكود: 'BL-301',
      'اسم الصنف': 'ربع بن سادة فاتح (250 جم)',
      الكمية: 8,
      الوحدة: 'ربع كيلو',
      الإجمالي: 1080,
    },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'مبيعات');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const [row] = await parseCashierExcelBuffer(buffer, INITIAL_ITEMS);
  expect(row.error).toBeUndefined();
  expect(row.quantity).toBe(2);
  expect(row.unitHint).toBe('kg');
  expect(row.totalPrice).toBe(1080);
});
it('rejects oversized files before loading a workbook', async () => {
  await expect(
    parseCashierExcelBuffer(
      new ArrayBuffer(10 * 1024 * 1024 + 1),
      INITIAL_ITEMS,
    ),
  ).rejects.toThrow('10');
});
