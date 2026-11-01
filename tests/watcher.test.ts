import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// @ts-expect-error watcher is a standalone Node module
import { processCashierFile, exportDate } from '../cashier-watcher/watcher.mjs';
async function fixture(run: (file: string, archive: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mobile-erp-test-'));
  const file = path.join(dir, 'sales-2026-11-01.csv');
  await writeFile(file, 'Name,Quantity,Total\nCoffee,1,200\n');
  try {
    await run(file, path.join(dir, 'Archive'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
it('does not archive without an authenticated client', () =>
  fixture(async (file, archive) => {
    await expect(
      processCashierFile(file, {
        archiveFolder: archive,
        waitForStable: false,
      }),
    ).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toContain('Coffee');
  }));
it('retains original file on enqueue failure', () =>
  fixture(async (file, archive) => {
    await expect(
      processCashierFile(file, {
        client: { rpc: async () => ({ error: { message: 'offline' } }) },
        archiveFolder: archive,
        waitForStable: false,
      }),
    ).rejects.toThrow('offline');
    expect(await readFile(file, 'utf8')).toContain('Coffee');
  }));
it('archives only after confirmed upload and sends a stable hash and date', () =>
  fixture(async (file, archive) => {
    let input: Record<string, unknown> = {};
    const client = {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        input = args;
        return { data: 'queue-id', error: null };
      },
    };
    const result = await processCashierFile(file, {
      client,
      archiveFolder: archive,
      waitForStable: false,
    });
    expect(result.queueId).toBe('queue-id');
    expect(input.p_sale_date).toBe('2026-11-01');
    expect(input.p_content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await readdir(archive)).toHaveLength(1);
  }));
it('requires source business date instead of silently using upload day', () => {
  expect(() => exportDate('sales.csv')).toThrow();
  expect(() => exportDate('sales-2026-02-30.csv')).toThrow();
  expect(exportDate('sales.csv', '2026-11-01')).toBe('2026-11-01');
});
