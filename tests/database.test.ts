import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { emptyStore, toCloud } from "../src/lib/storeState";
const partner = "11111111-1111-4111-8111-111111111111",
  cashier = "22222222-2222-4222-8222-222222222222",
  outsider = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
const cloud = toCloud({
  ...emptyStore,
  partners: [
    {
      id: "p1",
      username: "owner",
      name: "Owner",
      role: "مدير",
      avatarLetter: "O",
      phone: "",
      sharePercent: 100,
      totalPaidFromPocket: 0,
      totalWithdrawals: 0,
    },
  ],
});
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function save(
  version: number,
  state = cloud,
  op = crypto.randomUUID(),
  queue: string | null = null,
) {
  return db.query<{ result: { version: number } }>(
    "select public.bon_erp_save_store($1,$2::jsonb,$3::uuid,$4::uuid) as result",
    [version, JSON.stringify(state), op, queue],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${partner}'),('${cashier}'),('${outsider}');create publication supabase_realtime;`,
  );
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  // Reproduce the actual legacy cloud shape: neither version nor members existed.
  await db.exec(
    "drop function public.erp_role() cascade; drop table public.erp_members; alter table public.bon_elagouz_store drop column version;",
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261031225701_secure_store_transactions.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101034938_durable_audit_events.sql",
      "utf8",
    ),
  );
  await db.query(
    `insert into public.erp_members(user_id,username,partner_id,role) values($1,'owner','p1','partner'),($2,'cashier',null,'cashier')`,
    [partner, cashier],
  );
  await db.query(
    "insert into public.bon_elagouz_store(id,partners) values('main_store',$1::jsonb)",
    [JSON.stringify(cloud.partners)],
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("blocks anonymous and nonmember access", async () => {
  await db.exec("set role anon");
  await expect(
    db.query("select * from public.bon_elagouz_store"),
  ).rejects.toThrow("permission denied");
  await asUser(outsider);
  expect(
    (await db.query("select * from public.bon_elagouz_store")).rows,
  ).toHaveLength(0);
  await expect(save(0)).rejects.toThrow("FORBIDDEN");
});
it("prevents bypassing the versioned API through direct writes", async () => {
  await asUser(partner);
  await expect(
    db.query(
      "update public.bon_elagouz_store set version=999 where id='main_store'",
    ),
  ).rejects.toThrow("permission denied");
});
it("commits once and replays identical requests without duplicate writes", async () => {
  await asUser(partner);
  const op = crypto.randomUUID();
  expect((await save(0, cloud, op)).rows[0].result.version).toBe(1);
  expect((await save(0, cloud, op)).rows[0].result.version).toBe(1);
  expect(
    (await db.query("select * from public.bon_erp_store_receipts")).rows,
  ).toHaveLength(1);
});
it("rejects a stale second device instead of overwriting changes", async () => {
  await asUser(partner);
  await expect(save(0)).rejects.toThrow("STORE_CONFLICT");
  expect(
    (
      await db.query<{ version: number }>(
        "select version from public.bon_elagouz_store",
      )
    ).rows[0].version,
  ).toBe(1);
});
it("rejects reusing a receipt with different content", async () => {
  await asUser(partner);
  const op = crypto.randomUUID();
  await save(1, cloud, op);
  await expect(
    save(1, { ...cloud, expenses: [{ id: "different" }] }, op),
  ).rejects.toThrow("OPERATION_ID_REUSED");
});
it("keeps receipts immutable for application users", async () => {
  await asUser(partner);
  await expect(
    db.query("delete from public.bon_erp_store_receipts"),
  ).rejects.toThrow("permission denied");
});
it("rejects passwords and incomplete payloads atomically", async () => {
  await asUser(partner);
  await expect(
    save(2, {
      ...cloud,
      partners: [{ ...(cloud.partners as object[])[0], password: "secret" }],
    }),
  ).rejects.toThrow("PLAINTEXT_PASSWORD");
  await expect(save(2, { items: [] })).rejects.toThrow("INVALID_STATE");
  expect(
    (
      await db.query<{ version: number }>(
        "select version from public.bon_elagouz_store",
      )
    ).rows[0].version,
  ).toBe(2);
});
it("permits cashier enqueue once but prevents reading or changing store data", async () => {
  await asUser(cashier);
  const args = [
    "file-2026-11-01.csv",
    "2026-11-01",
    JSON.stringify([{ Name: "Coffee", Quantity: 1 }]),
    "a".repeat(64),
  ];
  const one = await db.query<{ id: string }>(
    "select public.bon_erp_enqueue_export($1,$2,$3::jsonb,$4) as id",
    args,
  );
  const two = await db.query<{ id: string }>(
    "select public.bon_erp_enqueue_export($1,$2,$3::jsonb,$4) as id",
    args,
  );
  expect(one.rows[0].id).toBe(two.rows[0].id);
  expect(
    (await db.query("select * from public.bon_elagouz_store")).rows,
  ).toHaveLength(0);
  await expect(save(2)).rejects.toThrow("FORBIDDEN");
  await expect(
    db.query("update public.cashier_sync_queue set processed=true"),
  ).rejects.toThrow("permission denied");
});
it("acknowledges queue only in the same transaction as a corresponding invoice", async () => {
  await asUser(partner);
  const queue = (
    await db.query<{ id: string }>("select id from public.cashier_sync_queue")
  ).rows[0].id;
  await expect(save(2, cloud, crypto.randomUUID(), queue)).rejects.toThrow(
    "QUEUE_INVOICE_REQUIRED",
  );
  expect(
    (
      await db.query<{ processed: boolean }>(
        "select processed from public.cashier_sync_queue",
      )
    ).rows[0].processed,
  ).toBe(false);
  const next = {
    ...cloud,
    sales_invoices: [
      {
        id: "sale1",
        date: "2026-11-01",
        sourceId: "b".repeat(64),
        sourceQueueId: queue,
      },
    ],
  };
  await save(2, next, crypto.randomUUID(), queue);
  expect(
    (
      await db.query<{ processed: boolean }>(
        "select processed from public.cashier_sync_queue",
      )
    ).rows[0].processed,
  ).toBe(true);
  await expect(save(3, next, crypto.randomUUID(), queue)).rejects.toThrow(
    "QUEUE_PROCESSED",
  );
});

it("preserves independent server audit evidence through history edits and deletion", async () => {
  await asUser(partner);
  const current = (
    await db.query<{ version: number }>(
      "select version from public.bon_elagouz_store",
    )
  ).rows[0].version;
  const log = {
    id: "durable-test",
    timestamp: "client-time",
    actorId: "forged-client-id",
    partnerName: "Owner",
    actionType: "شراء",
    description: "Original purchase",
  };
  await save(Number(current), { ...cloud, audit_logs: [log] });
  await save(Number(current) + 1, {
    ...cloud,
    audit_logs: [{ ...log, description: "Changed" }],
  });
  await save(Number(current) + 2, { ...cloud, audit_logs: [] });
  const rows = (
    await db.query<{
      actor_id: string;
      change_kind: string;
      event_data: typeof log;
      recorded_at: string;
    }>(
      "select * from public.bon_erp_audit_events where log_id='durable-test' order by store_version",
    )
  ).rows;
  expect(rows.map((r) => r.change_kind)).toEqual([
    "added",
    "changed",
    "removed",
  ]);
  expect(rows[0].event_data.description).toBe("Original purchase");
  expect(rows.every((r) => r.actor_id === partner && !!r.recorded_at)).toBe(
    true,
  );
  await expect(
    db.exec("delete from public.bon_erp_audit_events"),
  ).rejects.toThrow("permission denied");
  await expect(
    db.exec("update public.bon_erp_audit_events set event_data='{}'"),
  ).rejects.toThrow("permission denied");
  await asUser(outsider);
  expect(
    (await db.query("select * from public.bon_erp_audit_events")).rows,
  ).toHaveLength(0);
});
