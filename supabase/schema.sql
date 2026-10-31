-- =====================================================================
-- قاعدة بيانات (بُن العجوز - أصل المزاج) على Supabase
-- انسخ هذا الكود بالكامل وضعه في (SQL Editor) داخل لوحة تحكم Supabase ثم اضغط Run
-- =====================================================================

-- 1. جدول حالة المتجر الموحدة للمزامنة اللحظية (Realtime State Store)
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
  shifts jsonb not null default '[]'::jsonb
);

-- 2. جدول استقبال شيتات الكاشير التلقائية (Cashier Watcher Queue)
create table if not exists public.cashier_sync_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text not null,
  sale_date text not null,
  raw_rows jsonb not null default '[]'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz
);

-- تفعيل الصلاحيات العامة للتطبيق وأداة الكاشير (يمكن تقييدها لاحقاً بـ Auth)
alter table public.bon_elagouz_store enable row level security;
alter table public.cashier_sync_queue enable row level security;

drop policy if exists "Allow full access to bon_elagouz_store" on public.bon_elagouz_store;
create policy "Allow full access to bon_elagouz_store"
  on public.bon_elagouz_store
  for all
  using (true)
  with check (true);

drop policy if exists "Allow full access to cashier_sync_queue" on public.cashier_sync_queue;
create policy "Allow full access to cashier_sync_queue"
  on public.cashier_sync_queue
  for all
  using (true)
  with check (true);

-- تفعيل المزامنة اللحظية (Realtime) ليظهر أي تحديث فوراً عند الشركاء الأربعة
alter publication supabase_realtime add table public.bon_elagouz_store;
alter publication supabase_realtime add table public.cashier_sync_queue;
