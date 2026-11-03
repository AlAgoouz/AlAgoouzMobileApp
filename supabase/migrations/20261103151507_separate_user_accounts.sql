begin;
alter table bon_erp_private.owner_config add column if not exists owner_user_id uuid;
update bon_erp_private.owner_config c set owner_user_id=u.id from auth.users u where c.owner_user_id is null and lower(c.email)=lower(u.email) and u.email_confirmed_at is not null;
alter table public.erp_members add column if not exists display_name text not null default '';
alter table public.erp_members add column if not exists access_permissions jsonb not null default '{"view":true,"catalog":true,"purchases":true,"sales":true,"cashier":true,"production":true,"stocktaking":true,"contacts":true,"collections":true,"staff":true,"expenses":true,"partners":true}'::jsonb;
alter table public.erp_members add column if not exists disabled_at timestamptz;
alter table public.erp_members add column if not exists deleted_at timestamptz;
update public.erp_members m set display_name=coalesce((select p->>'name' from public.bon_elagouz_store s cross join lateral jsonb_array_elements(s.partners) p where s.id='main_store' and p->>'id'=m.partner_id limit 1),m.username) where display_name='';
-- Cashier accounts remain upload-only and never inherit shop-data access.
update public.erp_members set access_permissions='{}'::jsonb where role='cashier';
alter table public.erp_members alter column access_permissions set default '{}'::jsonb;

create or replace function bon_erp_private.is_master(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user_id is not null and exists(select 1 from bon_erp_private.owner_config c join auth.users u on u.id=p_user_id where u.email_confirmed_at is not null and (c.owner_user_id=p_user_id or c.owner_user_id is null and lower(c.email)=lower(u.email)))
$$;
revoke all on function bon_erp_private.is_master(uuid) from public,anon,authenticated;
create or replace function bon_erp_private.assert_owner() returns void language plpgsql security definer set search_path='' as $$
begin if not bon_erp_private.is_master(auth.uid()) then raise exception 'OWNER_REQUIRED' using errcode='42501';end if;end $$;

create or replace function bon_erp_private.member_role() returns text language sql stable security definer set search_path='' as $$
 select case when role='cashier' then 'cashier' when bon_erp_private.is_master(user_id) or coalesce((access_permissions->>'view')::boolean,false) then 'partner' end from public.erp_members where user_id=auth.uid() and disabled_at is null and deleted_at is null
$$;
revoke all on function bon_erp_private.member_role() from public,anon;
grant execute on function bon_erp_private.member_role() to authenticated;
create or replace function public.bon_erp_role() returns text language sql stable security invoker set search_path='' as $$select bon_erp_private.member_role()$$;
create or replace function public.erp_role() returns text language sql stable security invoker set search_path='' as $$ select public.bon_erp_role() $$;

create table if not exists bon_erp_private.user_access_events (
 id uuid primary key default gen_random_uuid(),actor_id uuid,target_id uuid not null,action text not null,occurred_at timestamptz not null default now(),before_access jsonb,after_access jsonb
);
alter table bon_erp_private.user_access_events enable row level security;
revoke all on bon_erp_private.user_access_events from public,anon,authenticated;

create or replace function bon_erp_private.protect_master_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if bon_erp_private.is_master(old.user_id) then
  if tg_op='DELETE' then raise exception 'MASTER_ACCOUNT_PROTECTED' using errcode='42501';end if;
  if new.user_id<>old.user_id or new.role<>'partner' or new.disabled_at is not null or new.deleted_at is not null or new.access_permissions<>'{"view":true,"catalog":true,"purchases":true,"sales":true,"cashier":true,"production":true,"stocktaking":true,"contacts":true,"collections":true,"staff":true,"expenses":true,"partners":true}'::jsonb then raise exception 'MASTER_ACCOUNT_PROTECTED' using errcode='42501';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists protect_master_membership on public.erp_members;
create trigger protect_master_membership before update or delete on public.erp_members for each row execute function bon_erp_private.protect_master_membership();
create or replace function bon_erp_private.protect_master_auth() returns trigger language plpgsql security definer set search_path='' as $$
begin if bon_erp_private.is_master(old.id) then raise exception 'MASTER_ACCOUNT_PROTECTED' using errcode='42501';end if;return old;end $$;
drop trigger if exists protect_master_auth on auth.users;
create trigger protect_master_auth before delete on auth.users for each row execute function bon_erp_private.protect_master_auth();
create or replace function bon_erp_private.audit_user_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return coalesce(new,old);end if;
 insert into bon_erp_private.user_access_events(actor_id,target_id,action,before_access,after_access) values(auth.uid(),coalesce(new.user_id,old.user_id),tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
drop trigger if exists audit_user_access on public.erp_members;
create trigger audit_user_access after insert or update or delete on public.erp_members for each row execute function bon_erp_private.audit_user_access();

create or replace function bon_erp_private.my_access() returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.erp_members%rowtype; master boolean;
begin
 if auth.uid() is null then return null;end if;
 select * into m from public.erp_members where user_id=auth.uid() and disabled_at is null and deleted_at is null;
 if not found then return null;end if;
 master:=bon_erp_private.is_master(m.user_id);
 if master then
  update bon_erp_private.owner_config set owner_user_id=m.user_id where owner_user_id is null;
  if m.access_permissions<>'{"view":true,"catalog":true,"purchases":true,"sales":true,"cashier":true,"production":true,"stocktaking":true,"contacts":true,"collections":true,"staff":true,"expenses":true,"partners":true}'::jsonb then
   update public.erp_members set access_permissions='{"view":true,"catalog":true,"purchases":true,"sales":true,"cashier":true,"production":true,"stocktaking":true,"contacts":true,"collections":true,"staff":true,"expenses":true,"partners":true}'::jsonb where user_id=m.user_id returning * into m;
  end if;
 end if;
 return jsonb_build_object('user_id',m.user_id,'partner_id',m.partner_id,'username',m.username,'display_name',m.display_name,'role',m.role,'is_owner',master,'permissions',m.access_permissions);
end $$;
create or replace function bon_erp_private.list_users() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform bon_erp_private.assert_owner();
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'partner_id',m.partner_id,'username',m.username,'display_name',m.display_name,'role',m.role,'is_owner',bon_erp_private.is_master(m.user_id),'permissions',m.access_permissions,'email',u.email,'disabled',m.disabled_at is not null,'deleted',m.deleted_at is not null,'created_at',m.created_at) order by m.created_at),'[]'::jsonb) from public.erp_members m join auth.users u on u.id=m.user_id);
end $$;
create or replace function bon_erp_private.set_user_access(p_user_id uuid,p_username text,p_display_name text,p_role text,p_partner_id text,p_permissions jsonb,p_disabled boolean,p_deleted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare master boolean;
begin
 perform bon_erp_private.assert_owner();perform pg_advisory_xact_lock(72938103);
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) or p_username!~'^[A-Za-z0-9_.-]{3,40}$' or length(trim(p_display_name)) not between 1 and 80 or p_role not in ('partner','cashier') or p_disabled is null or p_deleted is null then raise exception 'INVALID_USER_ACCESS';end if;
 if p_permissions is null or jsonb_typeof(p_permissions)<>'object' then raise exception 'INVALID_USER_PERMISSIONS';end if;
 if exists(select 1 from jsonb_each(p_permissions) p where p.key<>all(array['view','catalog','purchases','sales','cashier','production','stocktaking','contacts','collections','staff','expenses','partners']) or jsonb_typeof(p.value)<>'boolean') then raise exception 'INVALID_USER_PERMISSIONS';end if;
 if exists(select 1 from jsonb_each(p_permissions) p where p.key<>'view' and p.value='true'::jsonb) and not coalesce((p_permissions->>'view')::boolean,false) then raise exception 'VIEW_PERMISSION_REQUIRED';end if;
 if p_role='cashier' and exists(select 1 from jsonb_each(p_permissions) p where p.value='true'::jsonb) then raise exception 'CASHIER_UPLOAD_ONLY';end if;
 if p_partner_id is not null and not exists(select 1 from public.bon_elagouz_store s cross join lateral jsonb_array_elements(s.partners) p where s.id='main_store' and p->>'id'=p_partner_id) then raise exception 'FINANCIAL_PARTNER_NOT_FOUND';end if;
 master:=bon_erp_private.is_master(p_user_id);
 if master and (p_disabled or p_deleted or p_role<>'partner' or p_permissions<>'{"view":true,"catalog":true,"purchases":true,"sales":true,"cashier":true,"production":true,"stocktaking":true,"contacts":true,"collections":true,"staff":true,"expenses":true,"partners":true}'::jsonb) then raise exception 'MASTER_ACCOUNT_PROTECTED' using errcode='42501';end if;
 insert into public.erp_members(user_id,username,display_name,role,partner_id,access_permissions,disabled_at,deleted_at)
 values(p_user_id,p_username,trim(p_display_name),p_role,p_partner_id,p_permissions,case when p_disabled or p_deleted then now() end,case when p_deleted then now() end)
 on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,role=excluded.role,partner_id=excluded.partner_id,access_permissions=excluded.access_permissions,disabled_at=excluded.disabled_at,deleted_at=excluded.deleted_at;
 return jsonb_build_object('ok',true,'user_id',p_user_id);
end $$;

create or replace function public.bon_erp_my_access() returns jsonb language sql security invoker set search_path='' as $$select bon_erp_private.my_access()$$;
create or replace function public.bon_erp_list_users() returns jsonb language sql security invoker set search_path='' as $$select bon_erp_private.list_users()$$;
create or replace function public.bon_erp_set_user_access(p_user_id uuid,p_username text,p_display_name text,p_role text,p_partner_id text,p_permissions jsonb,p_disabled boolean,p_deleted boolean) returns jsonb language sql security invoker set search_path='' as $$select bon_erp_private.set_user_access(p_user_id,p_username,p_display_name,p_role,p_partner_id,p_permissions,p_disabled,p_deleted)$$;
revoke all on function public.bon_erp_my_access(),public.bon_erp_list_users(),public.bon_erp_set_user_access(uuid,text,text,text,text,jsonb,boolean,boolean),bon_erp_private.my_access(),bon_erp_private.list_users(),bon_erp_private.set_user_access(uuid,text,text,text,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.bon_erp_my_access(),public.bon_erp_list_users(),public.bon_erp_set_user_access(uuid,text,text,text,text,jsonb,boolean,boolean),bon_erp_private.my_access(),bon_erp_private.list_users(),bon_erp_private.set_user_access(uuid,text,text,text,text,jsonb,boolean,boolean) to authenticated;

create or replace function bon_erp_private.access_can(p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.erp_members m where m.user_id=auth.uid() and m.role='partner' and m.disabled_at is null and m.deleted_at is null and coalesce((m.access_permissions->>'view')::boolean,false) and coalesce((m.access_permissions->>p_key)::boolean,false))
$$;
create or replace function bon_erp_private.require_access(p_key text) returns void language plpgsql set search_path='' as $$
begin if not bon_erp_private.access_can(p_key) then raise exception 'USER_PERMISSION_DENIED: %',p_key using errcode='42501';end if;end $$;
create or replace function bon_erp_private.access_metadata_changed(o jsonb,n jsonb,fields text[]) returns boolean language sql immutable set search_path='' as $$
 select jsonb_array_length(o)<>jsonb_array_length(n) or exists(select 1 from jsonb_array_elements(n) current_row left join jsonb_array_elements(o) previous_row on previous_row->>'id'=current_row->>'id' where previous_row is null or (previous_row-fields) is distinct from (current_row-fields))
$$;
create or replace function bon_erp_private.check_user_store_access() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb:=to_jsonb(new);o jsonb:=to_jsonb(old);mapping record;item_fields text[]:=array['stock','lastSoldDate','costPrice','lastPurchasePrice','costHistory','costingVersion','supplierPrices'];e jsonb;
begin
 if auth.uid() is null or bon_erp_private.is_master(auth.uid()) then return new;end if;
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if not exists(select 1 from unnest(array['catalog','purchases','sales','cashier','production','stocktaking','contacts','collections','staff','expenses','partners']) k where bon_erp_private.access_can(k)) then raise exception 'USER_PERMISSION_DENIED: read_only' using errcode='42501';end if;
 for mapping in select * from (values('purchase_invoices','purchases'),('sales_invoices','sales'),('cashier_days','cashier'),('production_batches','production'),('stocktaking_records','stocktaking'),('account_payments','collections'),('employees','staff'),('employee_transactions','staff')) as permissions(field,capability) loop
  if s->mapping.field is distinct from o->mapping.field then perform bon_erp_private.require_access(mapping.capability);end if;
 end loop;
 if s->'items' is distinct from o->'items' then
  if s->'purchase_invoices' is distinct from o->'purchase_invoices' then item_fields:=item_fields||array['retailPrice','wholesalePrice'];end if;
  if bon_erp_private.access_metadata_changed(o->'items',s->'items',item_fields) or (s->'purchase_invoices'=o->'purchase_invoices' and s->'sales_invoices'=o->'sales_invoices' and s->'cashier_days'=o->'cashier_days' and s->'production_batches'=o->'production_batches' and s->'stocktaking_records'=o->'stocktaking_records') then perform bon_erp_private.require_access('catalog');end if;
 end if;
 if s->'suppliers' is distinct from o->'suppliers' and (bon_erp_private.access_metadata_changed(o->'suppliers',s->'suppliers',array['balance','totalPurchases','invoicesCount']) or s->'purchase_invoices'=o->'purchase_invoices' and s->'account_payments'=o->'account_payments') then perform bon_erp_private.require_access('contacts');end if;
 if s->'customers' is distinct from o->'customers' and (bon_erp_private.access_metadata_changed(o->'customers',s->'customers',array['balance','totalSales','invoicesCount','lastPurchaseDate']) or s->'sales_invoices'=o->'sales_invoices' and s->'account_payments'=o->'account_payments') then perform bon_erp_private.require_access('contacts');end if;
 if s->'expenses' is distinct from o->'expenses' and not bon_erp_private.access_can('expenses') then
  if jsonb_array_length(s->'expenses')<jsonb_array_length(o->'expenses') then raise exception 'USER_PERMISSION_DENIED: expenses' using errcode='42501';end if;
  for e in select current_row from jsonb_array_elements(s->'expenses') current_row where not exists(select 1 from jsonb_array_elements(o->'expenses') previous_row where previous_row=current_row) loop
   if not ((e?'sourceEmployeeTransactionId' and bon_erp_private.access_can('staff') and s->'employee_transactions' is distinct from o->'employee_transactions') or (e?'sourceInvoiceId' and e->>'paidFrom'='تسوية مخزون (بدون نقدية)' and bon_erp_private.access_can('sales') and s->'sales_invoices' is distinct from o->'sales_invoices')) then raise exception 'USER_PERMISSION_DENIED: expenses' using errcode='42501';end if;
  end loop;
 end if;
 if s->'partners' is distinct from o->'partners' and (bon_erp_private.access_metadata_changed(o->'partners',s->'partners',array['totalPaidFromPocket','totalWithdrawals']) or s->'expenses'=o->'expenses') then perform bon_erp_private.require_access('partners');end if;
 if s->'shifts' is distinct from o->'shifts' then raise exception 'USER_PERMISSION_DENIED: legacy_data' using errcode='42501';end if;
 return new;
end $$;
drop trigger if exists a_check_user_store_access on public.bon_elagouz_store;
create trigger a_check_user_store_access before update on public.bon_elagouz_store for each row execute function bon_erp_private.check_user_store_access();
create or replace function bon_erp_private.check_user_queue_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or bon_erp_private.is_master(auth.uid()) then return new;end if;
 if public.bon_erp_role()='cashier' then return new;end if;
 perform bon_erp_private.require_access('cashier');return new;
end $$;
drop trigger if exists a_check_user_queue_access on public.cashier_sync_queue;
create trigger a_check_user_queue_access before insert or update on public.cashier_sync_queue for each row execute function bon_erp_private.check_user_queue_access();
revoke all on function bon_erp_private.protect_master_membership(),bon_erp_private.protect_master_auth(),bon_erp_private.audit_user_access(),bon_erp_private.access_can(text),bon_erp_private.require_access(text),bon_erp_private.access_metadata_changed(jsonb,jsonb,text[]),bon_erp_private.check_user_store_access(),bon_erp_private.check_user_queue_access() from public,anon,authenticated;
commit;
