import * as XLSX from 'xlsx';
import { InventoryItem, SalesInvoiceItem } from '../types/erp';

export interface ParsedCashierRow {
  rawName: string;
  rawCode?: string;
  quantity: number;
  unitHint: 'kg' | 'gram' | 'piece';
  totalPrice?: number;
  unitPrice?: number;
  matchedItem?: InventoryItem;
}

/**
 * قراءة شيت إكسيل أو CSV خارج من برنامج الكاشير ومطابقته ذكياً مع أصناف ووصفات (بُن العجوز)
 * يدعم الأوزان (ثمن = 125 جم، ربع = 250 جم، نصف = 500 جم، كيلو = 1000 جم) والأعداد (أكواب/زجاجات)
 */
export function parseCashierExcelBuffer(
  buffer: ArrayBuffer,
  catalog: InventoryItem[]
): ParsedCashierRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return mapRawCashierRows(rows, catalog);
}

export function mapRawCashierRows(
  rows: Record<string, unknown>[],
  catalog: InventoryItem[]
): ParsedCashierRow[] {
  const results: ParsedCashierRow[] = [];

  for (const row of rows) {
    const entries = Object.entries(row);
    if (entries.length === 0) continue;

    // البحث الذكي عن أعمدة الاسم، الكود، الكمية، الوحدة، السعر، الإجمالي بالعربي أو الإنجليزي
    let nameVal = '';
    let codeVal = '';
    let qtyVal = 0;
    let unitStr = '';
    let priceVal = 0;
    let totalVal = 0;

    for (const [k, v] of entries) {
      const key = k.trim().toLowerCase();
      const strVal = String(v ?? '').trim();
      if (!strVal) continue;

      if (
        key.includes('اسم') ||
        key.includes('صنف') ||
        key.includes('منتج') ||
        key.includes('بيان') ||
        key.includes('name') ||
        key.includes('item') ||
        key.includes('product')
      ) {
        nameVal = strVal;
      } else if (
        key.includes('كود') ||
        key.includes('باركود') ||
        key.includes('code') ||
        key.includes('barcode')
      ) {
        codeVal = strVal;
      } else if (
        key.includes('كمي') ||
        key.includes('كمية') ||
        key.includes('عدد') ||
        key.includes('وزن') ||
        key.includes('qty') ||
        key.includes('quantity')
      ) {
        qtyVal = parseFloat(strVal.replace(/[^\d.]/g, '')) || 0;
      } else if (key.includes('وحد') || key.includes('unit')) {
        unitStr = strVal;
      } else if (
        key.includes('اجمال') ||
        key.includes('إجمال') ||
        key.includes('قيمة') ||
        key.includes('total') ||
        key.includes('amount')
      ) {
        totalVal = parseFloat(strVal.replace(/[^\d.]/g, '')) || 0;
      } else if (key.includes('سعر') || key.includes('price')) {
        priceVal = parseFloat(strVal.replace(/[^\d.]/g, '')) || 0;
      }
    }

    if (!nameVal && entries.length >= 2) {
      nameVal = String(entries[0][1] || '').trim();
      qtyVal = qtyVal || parseFloat(String(entries[1][1] || '1')) || 1;
    }

    if (!nameVal || qtyVal <= 0) continue;

    // استنتاج الوزن لو اسم الصنف مكتوب فيه (ثمن / تمن / ربع / نص / نصف / جرام / جم)
    let unitHint: 'kg' | 'gram' | 'piece' = 'piece';
    let effectiveQty = qtyVal;

    const lowerName = nameVal.toLowerCase();
    const lowerUnit = unitStr.toLowerCase();

    if (lowerUnit.includes('جرام') || lowerUnit.includes('جم') || lowerUnit === 'g' || lowerUnit === 'gm') {
      unitHint = 'gram';
    } else if (lowerUnit.includes('كيلو') || lowerUnit.includes('كجم') || lowerUnit === 'kg') {
      unitHint = 'kg';
    } else if (lowerName.includes('ثمن') || lowerName.includes('تمن') || lowerName.includes('125')) {
      unitHint = 'gram';
      effectiveQty = qtyVal * 125;
    } else if (lowerName.includes('ربع') || lowerName.includes('250')) {
      unitHint = 'gram';
      effectiveQty = qtyVal * 250;
    } else if (lowerName.includes('نصف') || lowerName.includes('نص ') || lowerName.includes('500')) {
      unitHint = 'gram';
      effectiveQty = qtyVal * 500;
    }

    // مطابقة الصنف مع الكتالوج
    const matched = catalog.find((item) => {
      if (codeVal && (item.code.toLowerCase() === codeVal.toLowerCase() || item.barcode === codeVal)) {
        return true;
      }
      const cleanCatalogName = item.name.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '').trim();
      const cleanRowName = nameVal
        .replace(/(ثمن|تمن|ربع|نصف|نص|كيلو|كجم|جم|جرام)/g, '')
        .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
        .trim();

      if (cleanCatalogName.includes(cleanRowName) || cleanRowName.includes(cleanCatalogName)) {
        return true;
      }
      // كلمات مفتاحية ذكية لمحل البن
      if (cleanRowName.includes('محوج') && item.id === 'blend-mahoug-special') return true;
      if (cleanRowName.includes('سادة') && cleanRowName.includes('فاتح') && item.id === 'blend-sada-light') return true;
      if (cleanRowName.includes('غامق') && item.id === 'blend-dark-strong') return true;
      if (cleanRowName.includes('تركي') && cleanRowName.includes('دبل') && item.id === 'drink-turkish-double') return true;
      if (cleanRowName.includes('تركي') && cleanRowName.includes('سنجل') && item.id === 'drink-turkish-single') return true;
      if (cleanRowName.includes('فرنساوي') && item.id === 'drink-french-coffee') return true;
      if (cleanRowName.includes('اسبريسو') || cleanRowName.includes('إسبريسو')) {
        return lowerName.includes('حبوب') || lowerName.includes('كيلو')
          ? item.id === 'raw-esp-ital'
          : item.id === 'drink-espresso-double';
      }
      if (cleanRowName.includes('مياه') || cleanRowName.includes('ميه')) {
        return item.id === 'direct-water-small';
      }
      return false;
    });

    if (matched && matched.baseUnit === 'kg' && unitHint === 'piece') {
      // لو الصنف بالكيلو والرقم أكبر من 25 نعتبره بالجرام، غير كده بالكيلو
      unitHint = effectiveQty >= 25 ? 'gram' : 'kg';
    }

    results.push({
      rawName: nameVal,
      rawCode: codeVal,
      quantity: effectiveQty,
      unitHint,
      unitPrice: priceVal || undefined,
      totalPrice: totalVal || undefined,
      matchedItem: matched,
    });
  }

  return results;
}

/**
 * إنشاء ملف إكسيل نموذجي جاهز للتجربة أو لتصديره لبرنامج الكاشير
 */
export function downloadSampleCashierExcel() {
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
