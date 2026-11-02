begin;
create table public.bon_erp_store_versions(
  id text primary key references public.bon_elagouz_store(id) on delete cascade,
  version bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.bon_erp_store_versions enable row level security;
revoke all on public.bon_erp_store_versions from public,anon,authenticated;
grant select on public.bon_erp_store_versions to authenticated;
create policy partner_reads_store_versions on public.bon_erp_store_versions
for select to authenticated using ((select public.bon_erp_role())='partner');
insert into public.bon_erp_store_versions(id,version) select id,version from public.bon_elagouz_store;
create function bon_erp_private.track_store_version() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into public.bon_erp_store_versions(id,version,updated_at) values(new.id,new.version,now())
  on conflict(id) do update set version=excluded.version,updated_at=excluded.updated_at;
  return new;
end $$;
revoke all on function bon_erp_private.track_store_version() from public,anon,authenticated;
create trigger bon_erp_track_store_version after insert or update on public.bon_elagouz_store
for each row execute function bon_erp_private.track_store_version();
do $$begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bon_erp_store_versions'
  ) then alter publication supabase_realtime add table public.bon_erp_store_versions;end if;
end $$;
commit;
