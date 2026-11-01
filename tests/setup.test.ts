import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
it('generates setup that rolls back missing accounts and never replaces existing store data', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'bon-erp-setup-'));
  const db = new PGlite();
  try {
    const mapping = {
      partners: [1, 2, 3, 4].map((i) => ({
        id: `p${i}`,
        email: `owner${i}@local.test`,
        name: `Partner ${i}`,
        sharePercent: 25,
      })),
      cashierEmail: 'cashier@local.test',
    };
    const input = path.join(directory, 'mapping.json'),
      output = path.join(directory, 'setup.sql');
    writeFileSync(input, JSON.stringify(mapping));
    execFileSync(
      process.execPath,
      ['supabase/generate-member-setup.mjs', input, output],
      { windowsHide: true },
    );
    const sql = readFileSync(output, 'utf8');
    await db.exec(
      'create schema auth;create table auth.users(id uuid primary key,email text);create table public.bon_elagouz_store(id text primary key,partners jsonb);create table public.erp_members(user_id uuid primary key,username text,partner_id text,role text);',
    );
    await expect(db.exec(sql)).rejects.toThrow('Missing or ambiguous');
    await db.exec('rollback');
    expect(
      (await db.query('select * from public.bon_elagouz_store')).rows,
    ).toHaveLength(0);
    for (const [index, member] of [
      ...mapping.partners,
      { email: mapping.cashierEmail },
    ].entries())
      await db.query('insert into auth.users values($1,$2)', [
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        member.email,
      ]);
    await db.exec(sql);
    expect(
      (await db.query('select * from public.erp_members')).rows,
    ).toHaveLength(5);
    const original = (
      await db.query('select partners from public.bon_elagouz_store')
    ).rows[0];
    await db.exec(sql);
    expect(
      (await db.query('select partners from public.bon_elagouz_store')).rows[0],
    ).toEqual(original);
    await db.query(
      'update public.bon_elagouz_store set partners=\'[{"id":"different"}]\'::jsonb',
    );
    await expect(db.exec(sql)).rejects.toThrow('profiles must be reviewed');
    await db.exec('rollback');
    expect(
      (
        await db.query<{ partners: unknown }>(
          'select partners from public.bon_elagouz_store',
        )
      ).rows[0].partners,
    ).toEqual([{ id: 'different' }]);
  } finally {
    await db.close();
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('bon-erp-setup-'))
      throw new Error('Refusing to remove an unexpected test directory');
    rmSync(directory, { recursive: true, force: true });
  }
});
