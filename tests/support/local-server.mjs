// Disposable Supabase-compatible test gateway backed by real embedded PostgreSQL.
// Bound to loopback only. Test users and tokens have no access to any real service.
import http from "node:http";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const costs = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/lib/itemCosts.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  costs,
);
const context = { exports: {}, require: () => costs.exports };
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/data/initialData.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
const fixture = context.exports;
const fields = {
  items: "ITEMS",
  production_batches: "PRODUCTION_BATCHES",
  purchase_invoices: "PURCHASE_INVOICES",
  sales_invoices: "SALES_INVOICES",
  suppliers: "SUPPLIERS",
  customers: "CUSTOMERS",
  expenses: "EXPENSES",
  partners: "PARTNERS",
  audit_logs: "AUDIT_LOGS",
  shifts: "SHIFTS",
  employees: "EMPLOYEES",
  employee_transactions: "EMPLOYEE_TRANSACTIONS",
  stocktaking_records: "STOCKTAKING_RECORDS",
  account_payments: "ACCOUNT_PAYMENTS",
};
await db.exec(
  `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`,
);
await db.exec(readFileSync("supabase/schema.sql", "utf8"));
await db.exec(
  readFileSync(
    "supabase/migrations/20261031225701_secure_store_transactions.sql",
    "utf8",
  ),
);
const ids = [1, 2, 3, 4].map(
  (i) =>
    `${String(i).repeat(8)}-${String(i).repeat(4)}-4${String(i).repeat(3)}-8${String(i).repeat(3)}-${String(i).repeat(12)}`,
);
for (const [index, id] of ids.entries()) {
  await db.query("insert into auth.users(id) values($1)", [id]);
  await db.query(
    "insert into public.erp_members(user_id,username,partner_id,role)values($1,$2,$3,'partner')",
    [id, `owner${index + 1}`, `p${index + 1}`],
  );
}
const state = Object.fromEntries(
  Object.entries(fields).map(([key, suffix]) => [
    key,
    fixture["INITIAL_" + suffix],
  ]),
);
const keys = Object.keys(state);
await db.query(
  `insert into public.bon_elagouz_store(id,${keys.join(",")})values('main_store',${keys.map((_, i) => `$${i + 1}::jsonb`).join(",")})`,
  Object.values(state).map((value) => JSON.stringify(value)),
);
const tokens = new Map(),
  refreshTokens = new Map();
function issue(index) {
  const user = {
    id: ids[index],
    aud: "authenticated",
    role: "authenticated",
    email: `owner${index + 1}@local.test`,
    created_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: {},
  };
  const encode = (data) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" }),
    body = encode({
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  const token =
    head +
    "." +
    body +
    "." +
    crypto
      .createHmac("sha256", "local-disposable-test-secret")
      .update(head + "." + body)
      .digest("base64url");
  const refresh = crypto.randomUUID();
  tokens.set(token, user);
  refreshTokens.set(refresh, index);
  return {
    access_token: token,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}
let tail = Promise.resolve();
const server = http.createServer((request, response) => {
  const origin = request.headers.origin;
  if (origin === "http://127.0.0.1:5280" || origin === "http://localhost:5280")
    response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader(
    "Access-Control-Allow-Headers",
    request.headers["access-control-request-headers"] ||
      "authorization,apikey,content-type,x-client-info,prefer,accept,x-supabase-api-version",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const send = (status, data) => {
    console.log(
      request.method,
      request.url?.split("?")[0],
      status,
      status >= 400 ? (data.message ?? "request failed") : "",
    );
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
  };
  const run = async () => {
    try {
      const url = new URL(request.url, "http://127.0.0.1:5281");
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {};
      if (url.pathname === "/auth/v1/token") {
        const index =
          url.searchParams.get("grant_type") === "refresh_token"
            ? refreshTokens.get(body.refresh_token)
            : /^owner([1-4])@local\.test$/.exec(body.email ?? "")?.[1];
        if (
          index === undefined ||
          (url.searchParams.get("grant_type") !== "refresh_token" &&
            body.password !== "Local-Test-Only-123!")
        )
          return send(400, {
            error: "invalid_grant",
            error_description: "Invalid test credentials",
          });
        return send(
          200,
          issue(
            url.searchParams.get("grant_type") === "refresh_token"
              ? index
              : Number(index) - 1,
          ),
        );
      }
      const bearer = (request.headers.authorization ?? "").replace(
        /^Bearer /,
        "",
      );
      const user = tokens.get(bearer);
      if (url.pathname === "/auth/v1/user")
        return send(user ? 200 : 401, user ?? { message: "not authenticated" });
      if (url.pathname === "/auth/v1/logout") {
        tokens.delete(bearer);
        return send(200, {});
      }
      if (url.pathname === "/test/summary") {
        await db.exec("reset role");
        const { rows } = await db.query(
          "select version,jsonb_array_length(sales_invoices) as sales,jsonb_array_length(purchase_invoices) as purchases,jsonb_array_length(audit_logs) as logs from public.bon_elagouz_store where id='main_store'",
        );
        return send(200, rows[0]);
      }
      if (!user)
        return send(401, { code: "42501", message: "not authenticated" });
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user.id,
      ]);
      await db.exec("set role authenticated");
      if (url.pathname === "/rest/v1/erp_members") {
        const result = await db.query(
          "select partner_id,role from public.erp_members where user_id=$1",
          [user.id],
        );
        return send(200, result.rows[0]);
      }
      if (url.pathname === "/rest/v1/bon_elagouz_store") {
        const result = await db.query(
          "select * from public.bon_elagouz_store where id='main_store'",
        );
        return send(200, result.rows[0]);
      }
      if (url.pathname === "/rest/v1/cashier_sync_queue") {
        const result = await db.query(
          "select id,file_name,sale_date,raw_rows from public.cashier_sync_queue where not processed order by created_at limit 1",
        );
        return send(200, result.rows);
      }
      if (url.pathname === "/rest/v1/rpc/bon_erp_save_store") {
        const result = await db.query(
          "select public.bon_erp_save_store($1,$2::jsonb,$3::uuid,$4::uuid) as result",
          [
            body.p_expected_version,
            JSON.stringify(body.p_state),
            body.p_operation_id,
            body.p_queue_id,
          ],
        );
        return send(200, result.rows[0].result);
      }
      return send(404, { message: "Unknown local test route" });
    } catch (error) {
      return send(400, {
        code: error.code ?? "TEST_ERROR",
        message: error.message,
      });
    }
  };
  tail = tail.then(run, run);
});
server.listen(5281, "127.0.0.1", () =>
  console.log(
    "Disposable local test API: http://127.0.0.1:5281; owner1@local.test; password: Local-Test-Only-123!",
  ),
);
process.on("SIGINT", () => {
  server.close();
  void db.close().then(() => process.exit());
});
