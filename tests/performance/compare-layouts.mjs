import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5284';
const output = process.env.AGOUZ_VISUAL_DIR ?? 'layout-comparison';
const mode = process.argv[2];
const date = new Date('2026-11-20T09:00:00Z');
const screens = [
  ['cashier', 'تقارير يوم الكاشير', 'تقارير يوم الكاشير'],
  ['inventory', 'مخزن البن', 'المخزن والأصناف'],
  ['purchases', 'المشتريات', 'المشتريات وفواتير التوريد'],
];

function useFixtureSession() {
  const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated', role: 'authenticated', email: 'owner@example.test',
    created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
  };
  const now = Math.floor(Date.now() / 1000);
  localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: encode({ alg: 'HS256', typ: 'JWT' }) + '.' +
      encode({ sub: user.id, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 }) + '.fixture',
    refresh_token: 'fixture', expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user,
  }));
}

async function capture(browser) {
  const directory = join(output, mode);
  await mkdir(directory, { recursive: true });
  for (const viewport of [{ width: 320, height: 740 }, { width: 1440, height: 900 }]) {
    const phone = viewport.width < 600;
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, colorScheme, isMobile: phone, hasTouch: phone, locale: 'ar-EG', reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      await page.clock.setFixedTime(date);
      const save = async name => {
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].filter(img => img.loading !== 'lazy').map(img => img.decode().catch(() => {})));
        });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' page overflows');
        await page.screenshot({ path: join(directory, [name, viewport.width, colorScheme].join('-') + '.png'), animations: 'disabled' });
      };
      try {
        await page.goto(origin);
        await page.getByRole('heading', { name: 'أهلًا برجوعك' }).waitFor();
        await save('login');
        await context.addInitScript(useFixtureSession);
        await page.reload();
        await page.getByText('ملخص الإحصائيات والأرباح المباشر', { exact: true }).waitFor();
        await save('dashboard');
        for (const [name, title, heading] of screens) {
          await page.getByRole('button', { name: 'الأقسام', exact: true }).last().click();
          await page.locator('.section-tile').filter({ has: page.getByText(title, { exact: true }) }).click();
          await page.getByRole('main').getByRole('heading', { name: heading, exact: true }).first().waitFor();
          await save(name);
        }
      } finally {
        await context.close();
      }
    }
  }
}

async function compare(browser) {
  const baseline = join(output, 'base');
  const current = join(output, 'current');
  const diffs = join(output, 'diff');
  await mkdir(diffs, { recursive: true });
  const names = (await readdir(baseline)).filter(name => name.endsWith('.png')).sort();
  assert.equal(names.length, (screens.length + 2) * 4);
  assert.deepEqual(names, (await readdir(current)).filter(name => name.endsWith('.png')).sort());
  const page = await browser.newPage();
  const metrics = [];
  for (const name of names) {
    const images = await Promise.all([baseline, current].map(directory => readFile(join(directory, name), 'base64')));
    const result = await page.evaluate(async ([before, after]) => {
      const decode = async value => createImageBitmap(await (await fetch('data:image/png;base64,' + value)).blob());
      const [a, b] = await Promise.all([decode(before), decode(after)]);
      if (a.width !== b.width || a.height !== b.height) throw Error('Screenshot sizes differ');
      const canvas = Object.assign(document.createElement('canvas'), { width: a.width, height: a.height });
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(a, 0, 0);
      const original = ctx.getImageData(0, 0, a.width, a.height).data;
      ctx.drawImage(b, 0, 0);
      const diff = ctx.getImageData(0, 0, b.width, b.height);
      let changed = 0;
      for (let i = 0; i < diff.data.length; i += 4) {
        const pixels = diff.data;
        if (Math.max(Math.abs(pixels[i] - original[i]), Math.abs(pixels[i + 1] - original[i + 1]), Math.abs(pixels[i + 2] - original[i + 2])) > 18) {
          changed++;
          pixels[i] = 218;
          pixels[i + 1] = 55;
          pixels[i + 2] = 76;
        } else {
          pixels.fill(232, i, i + 3);
        }
      }
      ctx.putImageData(diff, 0, 0);
      return { changed, total: a.width * a.height, png: changed ? canvas.toDataURL().split(',')[1] : null };
    }, images);
    if (result.png) await writeFile(join(diffs, name), Buffer.from(result.png, 'base64'));
    metrics.push({ screenshot: name, changedPixels: result.changed, totalPixels: result.total, percentChanged: 100 * result.changed / result.total });
  }
  await writeFile(join(output, 'comparison.json'), JSON.stringify(metrics, null, 2));
  const summary = ['| Screenshot | Pixels changed |', '| --- | ---: |', ...metrics.map(row => `| ${row.screenshot} | ${row.percentChanged.toFixed(2)}% |`)].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '\n' + summary + '\n');
  console.log(summary);
}

assert.ok(['base', 'current', 'compare'].includes(mode), 'Use base, current, or compare');
const browser = await chromium.launch();
try {
  await (mode === 'compare' ? compare(browser) : capture(browser));
} finally {
  await browser.close();
}
