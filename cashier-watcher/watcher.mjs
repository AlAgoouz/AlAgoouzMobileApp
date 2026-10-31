/**
 * أداة المراقبة التلقائية لفولدر مبيعات كاشير (بُن العجوز - أصل المزاج)
 * تراقب الفولدر المحدد وبمجرد خروج أي شيت إكسيل (.xlsx / .xls / .csv) من برنامج الكاشير:
 * 1. تقرأ الأصناف والكميات والأوزان والمبالغ
 * 2. ترفعها فوراً إلى قاعدة بيانات Supabase ليتم خصم المخزون والوصفات تلقائياً
 * 3. تنقل الملف المعالج إلى مجلد Archive لعدم تكرار خصمه
 */

import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// إعدادات الفولدر المراد مراقبته على جهاز الكاشير
const WATCH_FOLDER = process.env.CASHIER_WATCH_FOLDER || path.resolve(process.cwd(), 'cashier-exports');
const ARCHIVE_FOLDER = path.join(WATCH_FOLDER, 'Archive');

// بيانات الاتصال بـ Supabase
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!fs.existsSync(WATCH_FOLDER)) {
  fs.mkdirSync(WATCH_FOLDER, { recursive: true });
}
if (!fs.existsSync(ARCHIVE_FOLDER)) {
  fs.mkdirSync(ARCHIVE_FOLDER, { recursive: true });
}

console.log('==========================================================');
console.log('☕ أداة الربط التلقائي لكاشير (بُن العجوز - أصل المزاج)');
console.log(`📂 الفولدر المراقب حالياً: ${WATCH_FOLDER}`);
console.log('==========================================================');

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabase) {
  console.log('⚠️ تنبيه: لم يتم ضبط متغيرات SUPABASE_URL و SUPABASE_ANON_KEY بعد.');
  console.log('   سيتم قراءة الملفات محلياً وعرض محتواها حتى تضع مفاتيح Supabase.');
}

const processingFiles = new Set();

async function processExcelFile(filePath) {
  const fileName = path.basename(filePath);
  if (fileName.startsWith('~$') || processingFiles.has(filePath)) return;

  const ext = path.extname(fileName).toLowerCase();
  if (!['.xlsx', '.xls', '.csv'].includes(ext)) return;

  processingFiles.add(filePath);
  try {
    // انتظار نصف ثانية للتأكد من انتهاء برنامج الكاشير من كتابة الملف
    await new Promise((r) => setTimeout(r, 600));
    if (!fs.existsSync(filePath)) return;

    console.log(`\n📥 تم اكتشاف شيت مبيعات جديد: ${fileName}`);
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    console.log(`✅ تم قراءة ${rows.length} سطر من ملف الكاشير.`);

    if (supabase && rows.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('cashier_sync_queue').insert({
        file_name: fileName,
        sale_date: today,
        raw_rows: rows,
        processed: false,
      });

      if (error) {
        console.error('❌ خطأ أثناء الإرسال إلى Supabase:', error.message);
        return;
      }
      console.log('🚀 تم رفع مبيعات الكاشير إلى Supabase بنجاح! ستظهر الآن على موبايلات الشركاء الأربعة.');
    }

    // نقل الملف إلى مجلد Archive
    const archivedName = `${Date.now()}_${fileName}`;
    const destPath = path.join(ARCHIVE_FOLDER, archivedName);
    fs.renameSync(filePath, destPath);
    console.log(`📦 تم نقل الملف بعد معالجته إلى: Archive/${archivedName}`);
  } catch (err) {
    console.error(`❌ خطأ في قراءة الملف ${fileName}:`, err.message);
  } finally {
    processingFiles.delete(filePath);
  }
}

// فحص أي ملفات موجودة عند بدء التشغيل
for (const file of fs.readdirSync(WATCH_FOLDER)) {
  const fullPath = path.join(WATCH_FOLDER, file);
  if (fs.statSync(fullPath).isFile()) {
    processExcelFile(fullPath);
  }
}

// مراقبة الفولدر لحظياً
fs.watch(WATCH_FOLDER, (eventType, filename) => {
  if (!filename) return;
  const fullPath = path.join(WATCH_FOLDER, filename);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    processExcelFile(fullPath);
  }
});

console.log('👀 جاري مراقبة الفولدر... ضع أي شيت إكسيل خارج من الكاشير هنا ليتم رفعه تلقائياً.');
