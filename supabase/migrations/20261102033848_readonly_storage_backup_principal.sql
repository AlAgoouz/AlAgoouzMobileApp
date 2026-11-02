begin;
create table bon_erp_private.storage_backup_principal(
  id boolean primary key default true check(id),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table bon_erp_private.storage_backup_principal enable row level security;
revoke all on bon_erp_private.storage_backup_principal from public,anon,authenticated;
create function bon_erp_private.is_storage_backup_reader() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from bon_erp_private.storage_backup_principal where user_id=auth.uid())
$$;
revoke all on function bon_erp_private.is_storage_backup_reader() from public,anon;
grant usage on schema bon_erp_private to authenticated;
grant execute on function bon_erp_private.is_storage_backup_reader() to authenticated;
create policy agouz_backup_reads_storage on storage.objects for select to authenticated
using ((select bon_erp_private.is_storage_backup_reader()));
create policy agouz_backup_reads_buckets on storage.buckets for select to authenticated
using ((select bon_erp_private.is_storage_backup_reader()));
grant select on storage.objects,storage.buckets to authenticated;
commit;
