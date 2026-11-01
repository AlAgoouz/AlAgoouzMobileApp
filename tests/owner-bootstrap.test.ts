import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
it('allows only the configured verified owner to initialize an empty store', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`,
    );
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
    for (const file of [
      '20261031225701_secure_store_transactions.sql',
      '20261101001820_owner_bootstrap.sql',
    ])
      await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
    await db.query(
      "insert into bon_erp_private.owner_config(email) values('owner@local.test')",
    );
    const owner = '11111111-1111-4111-8111-111111111111',
      other = '22222222-2222-4222-8222-222222222222';
    await db.query(
      "insert into auth.users values($1,'owner@local.test',null),($2,'other@local.test',now())",
      [owner, other],
    );
    async function user(id: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec('set role authenticated');
    }
    await user(other);
    await expect(
      db.query('select public.bon_erp_bootstrap_owner()'),
    ).rejects.toThrow('FORBIDDEN');
    await user(owner);
    await expect(
      db.query('select public.bon_erp_bootstrap_owner()'),
    ).rejects.toThrow('FORBIDDEN');
    await db.exec('reset role');
    await db.query(
      'update auth.users set email_confirmed_at=now() where id=$1',
      [owner],
    );
    await user(owner);
    expect(
      (
        await db.query<{ id: string }>(
          'select public.bon_erp_bootstrap_owner() as id',
        )
      ).rows[0].id,
    ).toBe('p1');
    await db.query('select public.bon_erp_bootstrap_owner()');
    expect(
      (await db.query('select * from public.erp_members')).rows,
    ).toHaveLength(1);
    const store = (
      await db.query<{ partners: any[]; items: any[] }>(
        'select partners,items from public.bon_elagouz_store',
      )
    ).rows[0];
    expect(store.partners[0].sharePercent).toBe(100);
    expect(store.items).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 60000);
