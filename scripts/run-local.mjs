import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {loadEnv} from 'vite';

const settings = loadEnv('development', process.cwd(), '');
const url = settings.VITE_SUPABASE_URL;
const key = settings.VITE_SUPABASE_PUBLISHABLE_KEY || settings.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('اضبط عنوان Supabase والمفتاح العام في ملف .env.local.');
const python = settings.AGOUZ_LOCAL_PYTHON || resolve(process.platform === 'win32'
  ? '.venv/Scripts/python.exe' : '.venv/bin/python');
if (!existsSync(python)) throw new Error('جهّز بيئة Python المحلية باتباع خطوات README.md.');

const apiOrigin = 'http://127.0.0.1:8093';
const children = [];
function start(command, args, env = process.env) {
  const child = spawn(command, args, {env, stdio: 'inherit', windowsHide: true});
  children.push(child);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}
function stop() {
  for (const child of children) if (child.exitCode === null) child.kill();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const backend = start(python, ['-m', 'uvicorn', 'main:app', '--app-dir', 'backend',
    '--host', '127.0.0.1', '--port', '8093'], {
    ...process.env, ...settings, SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key,
  });
  const waitForApi = async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const response = await fetch(apiOrigin + '/api/health', {signal: AbortSignal.timeout(500)});
        if (response.ok && (await response.json()).service === 'agouz-online-imports') return;
      } catch { /* The API is starting. */ }
      await delay(250);
    }
    throw new Error('تعذر تشغيل واجهة Python المحلية. راجع تبعيات التشغيل والمنفذ 8093.');
  };
  await Promise.race([waitForApi(), backend.then(() => { throw new Error('توقفت واجهة Python. راجع رسالة التشغيل أعلاه.'); })]);
  const launchArgs = ['node_modules/vite/bin/vite.js', '--port', settings.AGOUZ_LOCAL_WEB_PORT || '5173'];
  if (process.argv.includes('--open')) launchArgs.push('--open');
  process.exitCode = await Promise.race([backend, start(process.execPath, launchArgs)]);
} finally {
  stop();
}
