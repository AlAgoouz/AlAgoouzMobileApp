-- =====================================================================
-- قاعدة بيانات (بُن العجوز - أصل المزاج) على Supabase — نسخة مؤمنة
-- الملف قابل لإعادة التشغيل بأمان (idempotent)
-- =====================================================================

-- 1. جدول حالة المتجر الموحدة (صف واحد) مع رقم إصدار لمنع مسح تعديلات الشركاء لبعض
create table if not exists public.bon_elagouz_store (
  id text primary key default 'main_store',
  updated_at timestamptz not null default now(),
  updated_by text,
  items jsonb not null default '[]'::jsonb,
  production_batches jsonb not null default '[]'::jsonb,
  purchase_invoices jsonb not null default '[]'::jsonb,
  sales_invoices jsonb not null default '[]'::jsonb,
  suppliers jsonb not null default '[]'::jsonb,
  customers jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  partners jsonb not null default '[]'::jsonb,
  audit_logs jsonb not null default '[]'::jsonb,
  shifts jsonb not null default '[]'::jsonb,
  employees jsonb not null default '[]'::jsonb,
  employee_transactions jsonb not null default '[]'::jsonb,
  stocktaking_records jsonb not null default '[]'::jsonb,
  account_payments jsonb not null default '[]'::jsonb
);
alter table public.bon_elagouz_store add column if not exists version bigint not null default 0;

-- 2. جدول استقبال شيتات الكاشير التلقائية
create table if not exists public.cashier_sync_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text not null,
  sale_date text not null,
  raw_rows jsonb not null default '[]'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz
);

-- 3. قائمة الحسابات المسموح لها (الشركاء الأربعة + حساب جهاز الكاشير)
create table if not exists public.erp_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  partner_id text,
  role text not null check (role in ('partner', 'cashier')),
  created_at timestamptz not null default now()
);

create or replace function public.erp_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.erp_members where user_id = auth.uid()
$$;
revoke all on function public.erp_role() from public, anon;
grant execute on function public.erp_role() to authenticated;

-- 4. إلغاء أي وصول عام (anon) نهائياً
alter table public.bon_elagouz_store enable row level security;
alter table public.cashier_sync_queue enable row level security;
alter table public.erp_members enable row level security;

revoke all on public.bon_elagouz_store from anon;
revoke all on public.cashier_sync_queue from anon;
revoke all on public.erp_members from anon;

grant select on public.bon_elagouz_store to authenticated;
grant select on public.cashier_sync_queue to authenticated;
grant select on public.erp_members to authenticated;

drop policy if exists "Allow full access to bon_elagouz_store" on public.bon_elagouz_store;
drop policy if exists "Allow full access to cashier_sync_queue" on public.cashier_sync_queue;

-- الشركاء فقط يقرؤون ويعدلون بيانات المحل
drop policy if exists "partners read store" on public.bon_elagouz_store;
create policy "partners read store" on public.bon_elagouz_store
  for select to authenticated using ((select public.erp_role()) = 'partner');

drop policy if exists "partners insert store" on public.bon_elagouz_store;
create policy "partners insert store" on public.bon_elagouz_store
  for insert to authenticated with check ((select public.erp_role()) = 'partner');

drop policy if exists "partners update store" on public.bon_elagouz_store;
create policy "partners update store" on public.bon_elagouz_store
  for update to authenticated
  using ((select public.erp_role()) = 'partner')
  with check ((select public.erp_role()) = 'partner');

-- جهاز الكاشير يضيف شيتات فقط، والشركاء يقرؤونها ويعلّمونها كمعالجة
drop policy if exists "partners read queue" on public.cashier_sync_queue;
create policy "partners read queue" on public.cashier_sync_queue
  for select to authenticated using ((select public.erp_role()) = 'partner');

drop policy if exists "members insert queue" on public.cashier_sync_queue;
create policy "members insert queue" on public.cashier_sync_queue
  for insert to authenticated
  with check ((select public.erp_role()) in ('partner', 'cashier'));

drop policy if exists "partners update queue" on public.cashier_sync_queue;
create policy "partners update queue" on public.cashier_sync_queue
  for update to authenticated
  using ((select public.erp_role()) = 'partner')
  with check ((select public.erp_role()) = 'partner');

-- كل حساب يرى صفه فقط في قائمة الأعضاء
drop policy if exists "members read own row" on public.erp_members;
create policy "members read own row" on public.erp_members
  for select to authenticated using (user_id = (select auth.uid()));

-- 5. المزامنة اللحظية بين الشركاء
do $$
begin
  alter publication supabase_realtime add table public.bon_elagouz_store;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cashier_sync_queue;
exception when duplicate_object then null;
end $$;
