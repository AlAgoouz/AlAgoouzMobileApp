begin;
-- Only the dedicated read-only backup role can export portable Vault values.
-- No generic decryption permission or Vault write permission is granted.
create function bon_erp_private.export_vault_secrets() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'description',description,
    'created_at',created_at,'updated_at',updated_at,'decrypted_secret',decrypted_secret
  ) order by id),'[]'::jsonb) into result from vault.decrypted_secrets;
  return result;
end $$;
revoke all on function bon_erp_private.export_vault_secrets() from public,anon,authenticated;
do $$begin
  if exists(select 1 from pg_roles where rolname='agouz_backup') then
    grant usage on schema bon_erp_private to agouz_backup;
    grant execute on function bon_erp_private.export_vault_secrets() to agouz_backup;
  end if;
end $$;
commit;
