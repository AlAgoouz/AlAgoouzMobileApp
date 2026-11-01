-- Apply only to the bon_elagouz_store application, after taking a verified backup.
-- Other ERP tables in the shared project are deliberately untouched.
begin;
alter table public.bon_elagouz_store add column if not exists version bigint not null default 0;
create table if not exists public.erp_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique, partner_id text,
  role text not null check(role in ('partner','cashier')),
  created_at timestamptz not null default now()
);
alter table public.erp_members enable row level security;
revoke all on public.erp_members from anon,authenticated;
grant select on public.erp_members to authenticated;
drop policy if exists "members read own row" on public.erp_members;
create policy "members read own row" on public.erp_members for select to authenticated using(user_id=(select auth.uid()));
create or replace function public.bon_erp_role() returns text language sql stable security definer set search_path='' as $$ select role from public.erp_members where user_id=auth.uid() $$;
revoke all on function public.bon_erp_role() from public,anon;
grant execute on function public.bon_erp_role() to authenticated;
alter table public.bon_elagouz_store enable row level security;
alter table public.cashier_sync_queue enable row level security;
revoke all on public.bon_elagouz_store,public.cashier_sync_queue from anon;
grant select on public.bon_elagouz_store,public.cashier_sync_queue to authenticated;
drop policy if exists "Allow full access to bon_elagouz_store" on public.bon_elagouz_store;
drop policy if exists "Allow full access to cashier_sync_queue" on public.cashier_sync_queue;
drop policy if exists "partners read store" on public.bon_elagouz_store;
create policy "partners read store" on public.bon_elagouz_store for select to authenticated using((select public.bon_erp_role())='partner');
drop policy if exists "partners read queue" on public.cashier_sync_queue;
create policy "partners read queue" on public.cashier_sync_queue for select to authenticated using((select public.bon_erp_role())='partner');
create schema if not exists bon_erp_private;
revoke all on schema bon_erp_private from public, anon;
grant usage on schema bon_erp_private to authenticated;

create table if not exists public.bon_erp_store_receipts (
  operation_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  version bigint not null,
  payload_hash text not null,
  queue_id uuid
);
alter table public.bon_erp_store_receipts enable row level security;
revoke all on public.bon_erp_store_receipts from anon, authenticated;
grant select on public.bon_erp_store_receipts to authenticated;
drop policy if exists "partners read immutable receipts" on public.bon_erp_store_receipts;
create policy "partners read immutable receipts" on public.bon_erp_store_receipts
  for select to authenticated using ((select public.bon_erp_role())='partner');

alter table public.cashier_sync_queue add column if not exists content_hash text;
update public.cashier_sync_queue set content_hash='legacy-'||id::text where content_hash is null;
alter table public.cashier_sync_queue alter column content_hash set not null;
create unique index if not exists cashier_sync_content_hash_unique on public.cashier_sync_queue(content_hash);

-- All writes go through checked functions, including queue acknowledgement.
revoke insert, update, delete on public.bon_elagouz_store from authenticated, anon;
revoke insert, update, delete on public.cashier_sync_queue from authenticated, anon;

create or replace function bon_erp_private.save_store(
  p_expected_version bigint, p_state jsonb, p_operation_id uuid, p_queue_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_current public.bon_elagouz_store%rowtype;
  v_receipt public.bon_erp_store_receipts%rowtype;
  v_key text;
  v_hash text := md5(p_state::text);
  v_queue public.cashier_sync_queue%rowtype;
begin
  if v_actor is null or not exists(select 1 from public.erp_members where user_id=v_actor and role='partner') then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version<0 or jsonb_typeof(p_state)<>'object' then
    raise exception 'INVALID_STATE';
  end if;
  select * into v_current from public.bon_elagouz_store where id='main_store' for update;
  if not found then raise exception 'STORE_NOT_INITIALIZED'; end if;
  select * into v_receipt from public.bon_erp_store_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.actor_id<>v_actor or v_receipt.payload_hash<>v_hash or v_receipt.queue_id is distinct from p_queue_id then raise exception 'OPERATION_ID_REUSED'; end if;
    if v_current.version<>v_receipt.version then raise exception 'STORE_CONFLICT'; end if;
    return jsonb_build_object('version',v_receipt.version);
  end if;
  if v_current.version<>p_expected_version then raise exception 'STORE_CONFLICT' using errcode='40001'; end if;
  foreach v_key in array array['items','production_batches','purchase_invoices','sales_invoices','suppliers','customers','expenses','partners','audit_logs','shifts','employees','employee_transactions','stocktaking_records','account_payments'] loop
    if jsonb_typeof(p_state->v_key) is distinct from 'array' then raise exception 'INVALID_STATE: %',v_key; end if;
    if exists(select 1 from jsonb_array_elements(p_state->v_key) r where jsonb_typeof(r)<>'object' or coalesce(r->>'id','')='') then raise exception 'INVALID_ROWS: %',v_key; end if;
    if (select count(*) from jsonb_array_elements(p_state->v_key))<>(select count(distinct r->>'id') from jsonb_array_elements(p_state->v_key) r) then raise exception 'DUPLICATE_IDS: %',v_key; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_state->'partners') p where p ? 'password') then raise exception 'PLAINTEXT_PASSWORD_FORBIDDEN'; end if;
  if exists(select 1 from jsonb_array_elements(p_state->'items') i where (i->>'stock')::numeric<0) then raise exception 'NEGATIVE_STOCK'; end if;
  if (select count(*) from jsonb_array_elements(p_state->'sales_invoices') i where i->>'sourceId' is not null)<>
     (select count(distinct i->>'sourceId') from jsonb_array_elements(p_state->'sales_invoices') i where i->>'sourceId' is not null) then raise exception 'DUPLICATE_CASHIER_SOURCE'; end if;
  -- No partner can accidentally remove the profile linked to a current login.
  if exists(select 1 from public.erp_members m where m.role='partner' and m.partner_id is not null and not exists(select 1 from jsonb_array_elements(p_state->'partners') p where p->>'id'=m.partner_id)) then raise exception 'PARTNER_PROFILE_REQUIRED'; end if;
  if p_queue_id is not null then
    select * into v_queue from public.cashier_sync_queue where id=p_queue_id for update;
    if not found or v_queue.processed then raise exception 'QUEUE_PROCESSED'; end if;
    if not exists(select 1 from jsonb_array_elements(p_state->'sales_invoices') i where i->>'sourceQueueId'=p_queue_id::text and i->>'date'=v_queue.sale_date and length(coalesce(i->>'sourceId',''))=64) then raise exception 'QUEUE_INVOICE_REQUIRED'; end if;
  end if;
  update public.bon_elagouz_store set
    version=version+1, updated_at=now(), updated_by=v_actor::text,
    items=p_state->'items',production_batches=p_state->'production_batches',purchase_invoices=p_state->'purchase_invoices',sales_invoices=p_state->'sales_invoices',
    suppliers=p_state->'suppliers',customers=p_state->'customers',expenses=p_state->'expenses',partners=p_state->'partners',audit_logs=p_state->'audit_logs',shifts=p_state->'shifts',
    employees=p_state->'employees',employee_transactions=p_state->'employee_transactions',stocktaking_records=p_state->'stocktaking_records',account_payments=p_state->'account_payments'
    where id='main_store';
  if p_queue_id is not null then update public.cashier_sync_queue set processed=true,processed_at=now() where id=p_queue_id; end if;
  insert into public.bon_erp_store_receipts(operation_id,actor_id,version,payload_hash,queue_id) values(p_operation_id,v_actor,v_current.version+1,v_hash,p_queue_id);
  return jsonb_build_object('version',v_current.version+1);
end $$;
revoke all on function bon_erp_private.save_store(bigint,jsonb,uuid,uuid) from public, anon;
grant execute on function bon_erp_private.save_store(bigint,jsonb,uuid,uuid) to authenticated;

create or replace function public.bon_erp_save_store(p_expected_version bigint,p_state jsonb,p_operation_id uuid,p_queue_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$ select bon_erp_private.save_store(p_expected_version,p_state,p_operation_id,p_queue_id) $$;
revoke all on function public.bon_erp_save_store(bigint,jsonb,uuid,uuid) from public, anon;
grant execute on function public.bon_erp_save_store(bigint,jsonb,uuid,uuid) to authenticated;

create or replace function bon_erp_private.enqueue_export(p_file_name text,p_sale_date text,p_raw_rows jsonb,p_content_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.erp_members where user_id=auth.uid() and role in ('partner','cashier')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if coalesce(length(p_file_name),0) not between 1 and 255 or p_sale_date!~'^\d{4}-\d{2}-\d{2}$' or to_char(p_sale_date::date,'YYYY-MM-DD')<>p_sale_date or coalesce(p_content_hash,'')!~'^[a-f0-9]{64}$' or jsonb_typeof(p_raw_rows)<>'array' then raise exception 'INVALID_EXPORT'; end if;
  if jsonb_array_length(p_raw_rows) not between 1 and 10000 or octet_length(p_raw_rows::text)>10485760 then raise exception 'INVALID_EXPORT_SIZE'; end if;
  insert into public.cashier_sync_queue(file_name,sale_date,raw_rows,content_hash) values(p_file_name,p_sale_date,p_raw_rows,p_content_hash)
    on conflict(content_hash) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.cashier_sync_queue where content_hash=p_content_hash;
  end if;
  return v_id;
end $$;
revoke all on function bon_erp_private.enqueue_export(text,text,jsonb,text) from public,anon;
grant execute on function bon_erp_private.enqueue_export(text,text,jsonb,text) to authenticated;
create or replace function public.bon_erp_enqueue_export(p_file_name text,p_sale_date text,p_raw_rows jsonb,p_content_hash text)
returns uuid language sql security invoker set search_path='' as $$ select bon_erp_private.enqueue_export(p_file_name,p_sale_date,p_raw_rows,p_content_hash) $$;
revoke all on function public.bon_erp_enqueue_export(text,text,jsonb,text) from public,anon;
grant execute on function public.bon_erp_enqueue_export(text,text,jsonb,text) to authenticated;
commit;
