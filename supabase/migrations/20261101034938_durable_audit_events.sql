begin;
create table if not exists public.bon_erp_audit_events (
  store_version bigint not null,
  log_id text not null,
  change_kind text not null check (change_kind in ('added', 'changed', 'removed')),
  actor_id uuid,
  recorded_at timestamptz not null default now(),
  event_data jsonb not null,
  primary key (store_version, log_id)
);
alter table public.bon_erp_audit_events enable row level security;
revoke all on public.bon_erp_audit_events from public, anon, authenticated;
grant select on public.bon_erp_audit_events to authenticated;
create policy "partners read durable audit" on public.bon_erp_audit_events
  for select to authenticated using ((select public.bon_erp_role()) = 'partner');

create or replace function bon_erp_private.capture_audit_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  with previous_logs as (
    select distinct on (value->>'id') value->>'id' as id, value
    from jsonb_array_elements(coalesce(old.audit_logs, '[]'::jsonb))
    where coalesce(value->>'id', '') <> ''
  ), next_logs as (
    select distinct on (value->>'id') value->>'id' as id, value
    from jsonb_array_elements(coalesce(new.audit_logs, '[]'::jsonb))
    where coalesce(value->>'id', '') <> ''
  )
  insert into public.bon_erp_audit_events(store_version, log_id, change_kind, actor_id, event_data)
  select new.version, coalesce(n.id, p.id),
    case when n.id is null then 'removed' when p.id is null then 'added' else 'changed' end,
    auth.uid(), coalesce(n.value, p.value)
  from previous_logs p full join next_logs n on n.id = p.id
  where p.value is distinct from n.value;
  return new;
end $$;
revoke all on function bon_erp_private.capture_audit_events() from public, anon, authenticated;
drop trigger if exists bon_erp_capture_audit on public.bon_elagouz_store;
create trigger bon_erp_capture_audit after update on public.bon_elagouz_store
  for each row execute function bon_erp_private.capture_audit_events();
commit;
