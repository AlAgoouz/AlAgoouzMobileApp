begin;

create table bon_erp_private.discarded_cashier_saves (
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  primary key (actor_id, operation_id)
);
alter table bon_erp_private.discarded_cashier_saves enable row level security;
revoke all on bon_erp_private.discarded_cashier_saves from public, anon, authenticated;

create function bon_erp_private.discard_cashier_save(p_operation_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not bon_erp_private.import_allowed(actor, true) then
    raise exception 'USER_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_operation_id is null then raise exception 'INVALID_OPERATION_ID' using errcode = '22023'; end if;
  -- Serialize with save_store, including a save whose response was lost.
  perform 1 from public.bon_elagouz_store where id = 'main_store' for update;
  if not found then raise exception 'STORE_NOT_INITIALIZED'; end if;
  if exists (select 1 from public.bon_erp_store_receipts where actor_id = actor and operation_id = p_operation_id)
    then return 'saved';
  end if;
  insert into bon_erp_private.discarded_cashier_saves values (actor, p_operation_id) on conflict do nothing;
  return 'discarded';
end $$;
create function public.bon_erp_discard_cashier_save(p_operation_id uuid) returns text
language sql security invoker set search_path = '' as $$
  select bon_erp_private.discard_cashier_save(p_operation_id)
$$;
revoke all on function bon_erp_private.discard_cashier_save(uuid), public.bon_erp_discard_cashier_save(uuid) from public, anon, authenticated;
grant execute on function bon_erp_private.discard_cashier_save(uuid), public.bon_erp_discard_cashier_save(uuid) to authenticated;

create function bon_erp_private.reject_discarded_cashier_save() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The receipt and all of the save's changes commit in the same transaction.
  if exists (select 1 from bon_erp_private.discarded_cashier_saves
    where actor_id = new.actor_id and operation_id = new.operation_id) then
    raise exception 'CASHIER_SAVE_DISCARDED' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function bon_erp_private.reject_discarded_cashier_save() from public, anon, authenticated;
create trigger reject_discarded_cashier_save before insert on public.bon_erp_store_receipts
for each row execute function bon_erp_private.reject_discarded_cashier_save();

create function bon_erp_private.protect_audit_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or bon_erp_private.is_master(actor) then return new; end if;
  if exists (
    select 1 from jsonb_array_elements(old.audit_logs) previous
    left join jsonb_array_elements(new.audit_logs) next on next->>'id' = previous->>'id'
    where next is distinct from previous
  ) then
    raise exception 'AUDIT_LOG_IMMUTABLE' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.audit_logs) next
    left join jsonb_array_elements(old.audit_logs) previous on previous->>'id' = next->>'id'
    where previous is null and next->>'actorId' is not null and next->>'actorId' <> actor::text
  ) then
    raise exception 'AUDIT_ACTOR_MISMATCH' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function bon_erp_private.protect_audit_log() from public, anon, authenticated;
create trigger protect_audit_log before update of audit_logs on public.bon_elagouz_store
for each row when (old.audit_logs is distinct from new.audit_logs)
execute function bon_erp_private.protect_audit_log();

create or replace function bon_erp_private.operational_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare imports jsonb; backup jsonb;
begin
  if public.bon_erp_role() is distinct from 'partner' then
    raise exception 'USER_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if bon_erp_private.import_allowed(auth.uid(), true) then
    select jsonb_build_object(
      'failed', count(*) filter (where j.status = 'failed'),
      'working', count(*) filter (where j.status in ('uploading','queued','processing')),
      'delayed', count(*) filter (where j.status in ('uploading','queued','processing') and j.updated_at < now() - interval '10 minutes'),
      'awaitingReview', count(*) filter (where j.status = 'ready' and not coalesce(q.processed,false))
    ) into imports from bon_erp_private.import_jobs j left join public.cashier_sync_queue q on q.id = j.queue_id
    where j.status <> 'cancelled';
  end if;
  if bon_erp_private.is_master(auth.uid()) then
    select to_jsonb(r)-'id'-'generation' into backup from bon_erp_private.recovery_health r where id;
  end if;
  return jsonb_build_object('imports', imports, 'backup', backup, 'checkedAt', now());
end $$;

create table bon_erp_private.export_limits (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests smallint not null check (requests between 1 and 10)
);
alter table bon_erp_private.export_limits enable row level security;
revoke all on bon_erp_private.export_limits from public, anon, authenticated;
create function bon_erp_private.reserve_export() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_window timestamptz := date_bin(interval '5 minutes', statement_timestamp(), timestamptz '2000-01-01 00:00:00+00');
begin
  if actor is null or public.bon_erp_role() is distinct from 'partner' then
    raise exception 'USER_PERMISSION_DENIED' using errcode = '42501';
  end if;
  insert into bon_erp_private.export_limits as limits values (actor, current_window, 1)
  on conflict (actor_id) do update
  set window_start = excluded.window_start,
      requests = case when limits.window_start < excluded.window_start then 1 else limits.requests + 1 end
  where limits.window_start < excluded.window_start or
    (limits.window_start = excluded.window_start and limits.requests < 10);
  return found;
end $$;
create function public.bon_erp_reserve_export() returns boolean
language sql security invoker set search_path = '' as $$ select bon_erp_private.reserve_export() $$;
revoke all on function bon_erp_private.reserve_export(), public.bon_erp_reserve_export() from public, anon, authenticated;
grant execute on function bon_erp_private.reserve_export(), public.bon_erp_reserve_export() to authenticated;

commit;
