begin;
create table if not exists bon_erp_private.owner_config (id boolean primary key default true check(id), email text not null);
revoke all on bon_erp_private.owner_config from public,anon,authenticated;
create or replace function bon_erp_private.bootstrap_owner()
returns text language plpgsql security definer set search_path='' as $$
declare v_user auth.users%rowtype; v_profile jsonb; v_partner text;
begin
  select * into v_user from auth.users where id=auth.uid();
  if v_user.id is null or v_user.email_confirmed_at is null or not exists(select 1 from bon_erp_private.owner_config where id and lower(email)=lower(v_user.email)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(72938101);
  select partner_id into v_partner from public.erp_members where user_id=v_user.id and role='partner';
  if found then return v_partner; end if;
  if exists(select 1 from public.erp_members where role='partner') then raise exception 'OWNER_ALREADY_CONFIGURED'; end if;
  v_profile=jsonb_build_object('id','p1','username','owner','name','المالك','role','مالك','avatarLetter','م','phone','','sharePercent',100,'totalPaidFromPocket',0,'totalWithdrawals',0);
  insert into public.bon_elagouz_store(id,partners) values('main_store',jsonb_build_array(v_profile)) on conflict(id) do nothing;
  if not exists(select 1 from public.bon_elagouz_store where id='main_store' and partners @> '[{"id":"p1"}]'::jsonb) then raise exception 'STORE_PROFILE_REVIEW_REQUIRED'; end if;
  insert into public.erp_members(user_id,username,partner_id,role) values(v_user.id,'owner','p1','partner');
  return 'p1';
end $$;
revoke all on function bon_erp_private.bootstrap_owner() from public,anon;
grant execute on function bon_erp_private.bootstrap_owner() to authenticated;
create or replace function public.bon_erp_bootstrap_owner() returns text language sql security invoker set search_path='' as $$ select bon_erp_private.bootstrap_owner() $$;
revoke all on function public.bon_erp_bootstrap_owner() from public,anon;
grant execute on function public.bon_erp_bootstrap_owner() to authenticated;
commit;
