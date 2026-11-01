import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function exportDate(fileName, configuredDate) {
  const value =
    configuredDate ||
    fileName.match(/(?:^|[^0-9])(\d{4}-\d{2}-\d{2})(?:[^0-9]|$)/)?.[1];
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value
  )
    throw new Error(
      'حدد تاريخ المبيعات في اسم الملف YYYY-MM-DD أو CASHIER_SALE_DATE؛ لم يتم رفع الملف',
    );
  return value;
}
async function stableFile(filePath) {
  let last = '',
    stable = 0;
  for (let attempt = 0; attempt < 50; attempt++) {
    const stat = await fs.stat(filePath);
    if (stat.size > 10 * 1024 * 1024)
      throw new Error('حجم الملف أكبر من 10 ميجابايت');
    const current = stat.size + ':' + stat.mtimeMs;
    if (current === last) stable++;
    else stable = 0;
    if (stable >= 3) return;
    last = current;
    await delay(200);
  }
  throw new Error('الملف لا يزال قيد الكتابة؛ ستعاد المحاولة');
}
export async function processCashierFile(
  filePath,
  { client, archiveFolder, saleDate, waitForStable = true },
) {
  if (!client) throw new Error('لا يوجد اتصال موثق؛ لم تتم أرشفة الملف');
  const name = path.basename(filePath);
  if (
    name.startsWith('~$') ||
    !['.xlsx', '.xls', '.csv'].includes(path.extname(name).toLowerCase())
  )
    return;
  const date = exportDate(name, saleDate);
  if (waitForStable) await stableFile(filePath);
  const buffer = await fs.readFile(filePath);
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error('الملف كبير جدًا');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (!workbook.SheetNames.length)
    throw new Error('الملف لا يحتوي ورقة بيانات');
  const rows = XLSX.utils.sheet_to_json(
    workbook.Sheets[workbook.SheetNames[0]],
    { defval: '' },
  );
  if (!rows.length || rows.length > 10000)
    throw new Error('عدد الصفوف غير صالح');
  const hash = createHash('sha256')
    .update(date + '\n')
    .update(buffer)
    .digest('hex');
  const { data, error } = await client.rpc('bon_erp_enqueue_export', {
    p_file_name: name,
    p_sale_date: date,
    p_raw_rows: rows,
    p_content_hash: hash,
  });
  if (error || !data)
    throw new Error(error?.message || 'لم يصل تأكيد رفع الملف');
  await fs.mkdir(archiveFolder, { recursive: true });
  const destination = path.join(archiveFolder, hash + '_' + name);
  // rename follows confirmed idempotent enqueue. A failed rename is safe to retry.
  await fs.rename(filePath, destination);
  return { queueId: data, destination, rows: rows.length };
}
export async function startWatcher(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !env.CASHIER_EMAIL || !env.CASHIER_PASSWORD)
    throw new Error(
      'اضبط اتصال Supabase وبريد وكلمة مرور حساب الكاشير. لن يتم نقل أي ملف قبل ذلك.',
    );
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: env.CASHIER_EMAIL,
    password: env.CASHIER_PASSWORD,
  });
  if (error) throw new Error('فشل توثيق حساب الكاشير؛ تحقق من إعداداته');
  const folder = path.resolve(env.CASHIER_WATCH_FOLDER || 'cashier-exports');
  const archiveFolder = path.join(folder, 'Archive');
  await fs.mkdir(folder, { recursive: true });
  let busy = false,
    closed = false;
  const scan = async () => {
    if (busy || closed) return;
    busy = true;
    try {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        try {
          const result = await processCashierFile(
            path.join(folder, entry.name),
            { client, archiveFolder, saleDate: env.CASHIER_SALE_DATE },
          );
          if (result) console.log('تم رفع وأرشفة:', entry.name);
        } catch (error) {
          console.error('لم يعتمد الملف:', entry.name, error.message);
        }
      }
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => {
    void scan().catch((error) =>
      console.error('تعذر فحص المجلد:', error.message),
    );
  }, 5000);
  await scan();
  console.log('مراقبة ملفات الكاشير:', folder);
  return () => {
    closed = true;
    clearInterval(timer);
    client.auth.stopAutoRefresh();
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  startWatcher().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
