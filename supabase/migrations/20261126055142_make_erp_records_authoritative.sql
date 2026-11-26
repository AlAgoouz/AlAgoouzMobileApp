begin;
set local lock_timeout = '5s';

lock table public.bon_elagouz_store in access exclusive mode;

-- Preserve the existing header OID, foreign keys, RLS and lightweight version feed.
alter table public.bon_elagouz_store rename to erp_store_header;
alter table public.erp_store_header set schema bon_erp_private;

-- A missing cost history is distinct from an empty history in older invoices.
alter table bon_erp_private.erp_documents add column cost_history jsonb
  check (cost_history is null or (section='items' and jsonb_typeof(cost_history)='array'));

create or replace function bon_erp_private.sync_erp_documents(p_store_id text,p_previous jsonb,p_next jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  part record;
  was jsonb;
  prepend_only boolean;
  added bigint;
  first_position bigint;
begin
  for part in select s.section,s.payload from bon_erp_private.store_document_sections(p_next) s
    where s.payload is distinct from p_previous->s.section
  loop
    if exists(select 1 from jsonb_array_elements(part.payload) row where nullif(row->>'id','') is null)
      then raise exception 'DOCUMENT_ID_REQUIRED: %',part.section; end if;
    was:=coalesce(p_previous -> part.section,'[]'::jsonb);
    with desired as materialized (
      select value->>'id' as id,ordinality from jsonb_array_elements(part.payload) with ordinality
    ), prior as materialized (
      select value->>'id' as id,ordinality from jsonb_array_elements(was) with ordinality
    )
    select count(*) filter (where prior.id is null),
      count(prior.id)>0
        and (array_agg(desired.id order by desired.ordinality) filter (where prior.id is not null))
          is not distinct from (array_agg(prior.id order by prior.ordinality) filter (where prior.id is not null))
        and coalesce(max(desired.ordinality) filter (where prior.id is null),0)
          < coalesce(min(desired.ordinality) filter (where prior.id is not null),9223372036854775807)
    into added,prepend_only from desired left join prior using(id);
    select coalesce(min(position),1) into first_position from bon_erp_private.erp_documents
      where store_id=p_store_id and section=part.section;

    with desired as materialized (
      select value->>'id' as id,value,ordinality from jsonb_array_elements(part.payload) with ordinality
    ), removed as (
      delete from bon_erp_private.erp_documents target
      where target.store_id=p_store_id and target.section=part.section
        and not exists(select 1 from desired row where row.id=target.document_id)
    )
    insert into bon_erp_private.erp_documents as target(store_id,section,document_id,position,payload,cost_history)
    select p_store_id,part.section,row.id,
      case when prepend_only then coalesce(previous.position,first_position-added+row.ordinality-1)
        else row.ordinality end,
      case when part.section='items' then row.value-'costHistory' else row.value end,
      case when part.section='items' then row.value->'costHistory' end
    from desired row
    left join bon_erp_private.erp_documents previous
      on previous.store_id=p_store_id and previous.section=part.section and previous.document_id=row.id
    on conflict(store_id,section,document_id) do update set position=excluded.position,payload=excluded.payload,cost_history=excluded.cost_history
    where (target.position,target.payload,target.cost_history) is distinct from (excluded.position,excluded.payload,excluded.cost_history);
  end loop;
end
$$;


-- Reconcile the partitions from the last legacy snapshot under the write lock.
select bon_erp_private.sync_erp_documents(id,'{}'::jsonb,to_jsonb(header))
from bon_erp_private.erp_store_header header;

create function bon_erp_private.erp_store_section(p_store_id text,p_section text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(
    case when document.cost_history is null then document.payload
         else document.payload||jsonb_build_object('costHistory',document.cost_history) end
    order by document.position,document.document_id
  ),'[]'::jsonb)
  from bon_erp_private.erp_documents document
  where document.store_id=p_store_id and document.section=p_section
$$;
revoke all on function bon_erp_private.erp_store_section(text,text) from public, anon, authenticated;
grant execute on function bon_erp_private.erp_store_section(text,text) to authenticated;

-- Scalar section lookups allow a read of one column to skip the other partitions.
create view public.bon_elagouz_store with (security_invoker=true) as
select header.id, header.updated_at, header.updated_by,
  bon_erp_private.erp_store_section(header.id,'items') as items,
  bon_erp_private.erp_store_section(header.id,'production_batches') as production_batches,
  bon_erp_private.erp_store_section(header.id,'purchase_invoices') as purchase_invoices,
  bon_erp_private.erp_store_section(header.id,'sales_invoices') as sales_invoices,
  bon_erp_private.erp_store_section(header.id,'suppliers') as suppliers,
  bon_erp_private.erp_store_section(header.id,'customers') as customers,
  bon_erp_private.erp_store_section(header.id,'expenses') as expenses,
  bon_erp_private.erp_store_section(header.id,'partners') as partners,
  bon_erp_private.erp_store_section(header.id,'audit_logs') as audit_logs,
  bon_erp_private.erp_store_section(header.id,'shifts') as shifts,
  bon_erp_private.erp_store_section(header.id,'employees') as employees,
  bon_erp_private.erp_store_section(header.id,'employee_transactions') as employee_transactions,
  bon_erp_private.erp_store_section(header.id,'stocktaking_records') as stocktaking_records,
  bon_erp_private.erp_store_section(header.id,'account_payments') as account_payments,
  header.version,
  bon_erp_private.erp_store_section(header.id,'cashier_days') as cashier_days,
  bon_erp_private.erp_store_section(header.id,'financial_openings') as financial_openings,
  bon_erp_private.erp_store_section(header.id,'catalog_name_drafts') as catalog_name_drafts
from bon_erp_private.erp_store_header header;

revoke all on public.bon_elagouz_store from public, anon, authenticated;
grant select on public.bon_elagouz_store to authenticated;

do $migration$
declare
  rule text;
  column_name text;
  definition text;
  source text;
  guard_name text;
  guards constant text[] := array[
    'check_user_store_access','check_store_write','check_store_begun','check_store_uws_items',
    'check_cashier_cost_purchase_snapshot','check_catalog_name_drafts','check_financial_opening',
    'check_purchase_refunds','check_sale_return_payment','protect_audit_log',
    'validate_purchase_snapshots','archive_overflow_audit','capture_audit_events'
  ];
begin
  if exists (
    select 1 from bon_erp_private.erp_store_header header
    left join public.bon_elagouz_store restored using(id)
    where to_jsonb(header) is distinct from to_jsonb(restored)
  ) then raise exception 'ERP_RECORD_MIGRATION_DIVERGED'; end if;

  -- These checks are reused as row functions before the changed records are written.
  foreach rule in array guards loop
    definition := pg_get_functiondef(format('bon_erp_private.%I()',rule)::regprocedure);
    source := split_part(definition,'$function$',2);
    if source='' or position('RETURNS trigger' in definition)=0
      then raise exception 'ERP_STORAGE_GUARD_MISSING: %',rule; end if;
    source := regexp_replace(source,'^[[:space:]]*declare[[:space:]]+','','i');
    guard_name := 'erp_row_'||rule;
    execute format(
      'create function bon_erp_private.%I(public.bon_elagouz_store,public.bon_elagouz_store,text)
       returns public.bon_elagouz_store language plpgsql set search_path='''' as %L',
      guard_name,
      'declare old alias for $1; new alias for $2; tg_op alias for $3; '||source
    );
    execute format(
      'revoke all on function bon_erp_private.%I(public.bon_elagouz_store,public.bon_elagouz_store,text)
       from public, anon, authenticated',guard_name
    );
  end loop;

  -- Preserve defaults for the owner bootstrap and existing administrative SQL.
  for column_name in select attname from pg_attribute
    where attrelid='bon_erp_private.erp_store_header'::regclass and attnum>0 and not attisdropped
      and atttypid='jsonb'::regtype
  loop
    execute format('alter view public.bon_elagouz_store alter column %I set default ''[]''::jsonb',column_name);
  end loop;
end
$migration$;

alter view public.bon_elagouz_store alter column id set default 'main_store';
alter view public.bon_elagouz_store alter column updated_at set default now();
alter view public.bon_elagouz_store alter column version set default 0;

create function bon_erp_private.apply_erp_records(
  p_old public.bon_elagouz_store,p_new public.bon_elagouz_store,p_operation text
) returns public.bon_elagouz_store language plpgsql set search_path='' as $$
declare
  previous jsonb;
  next jsonb;
  purchase_changed boolean;
begin
  if p_new.id is null or p_new.version is null or p_new.updated_at is null
    or (p_operation='UPDATE' and p_new.id is distinct from p_old.id)
    or exists(select 1 from bon_erp_private.store_document_sections(to_jsonb(p_new)) section
      where jsonb_typeof(section.payload) is distinct from 'array')
  then raise exception 'INVALID_STATE'; end if;

  purchase_changed := p_old.purchase_invoices is distinct from p_new.purchase_invoices;
  if p_operation='UPDATE' then
    p_new := bon_erp_private.erp_row_check_user_store_access(p_old,p_new,p_operation);
    p_new := bon_erp_private.erp_row_check_store_write(p_old,p_new,p_operation);
  end if;
  p_new := bon_erp_private.erp_row_check_store_begun(p_old,p_new,p_operation);
  p_new := bon_erp_private.erp_row_check_store_uws_items(p_old,p_new,p_operation);
  if p_operation='UPDATE' and purchase_changed then
    p_new := bon_erp_private.erp_row_check_cashier_cost_purchase_snapshot(p_old,p_new,p_operation);
  end if;
  p_new := bon_erp_private.erp_row_check_catalog_name_drafts(p_old,p_new,p_operation);
  p_new := bon_erp_private.erp_row_check_financial_opening(p_old,p_new,p_operation);
  if p_operation='UPDATE' then
    if purchase_changed then
      p_new := bon_erp_private.erp_row_check_purchase_refunds(p_old,p_new,p_operation);
    end if;
    if p_old.sales_invoices is distinct from p_new.sales_invoices then
      p_new := bon_erp_private.erp_row_check_sale_return_payment(p_old,p_new,p_operation);
    end if;
    if p_old.audit_logs is distinct from p_new.audit_logs then
      p_new := bon_erp_private.erp_row_protect_audit_log(p_old,p_new,p_operation);
    end if;
    if purchase_changed then
      p_new := bon_erp_private.erp_row_validate_purchase_snapshots(p_old,p_new,p_operation);
    end if;
  end if;
  p_new := bon_erp_private.erp_row_archive_overflow_audit(p_old,p_new,p_operation);

  if p_operation='INSERT' then
    insert into bon_erp_private.erp_store_header(id,updated_at,updated_by,version)
    values(p_new.id,p_new.updated_at,p_new.updated_by,p_new.version);
  end if;

  previous := coalesce(to_jsonb(p_old),'{}'::jsonb);
  next := to_jsonb(p_new);
  perform bon_erp_private.sync_erp_documents(p_new.id,previous,next);

  if p_operation='INSERT' or p_new.items is distinct from p_old.items then
    perform bon_erp_private.archive_stock_costs(p_new.id,p_new.items,coalesce(p_old.items,'[]'::jsonb));
  end if;
  if p_operation='UPDATE' then
    update bon_erp_private.erp_store_header
    set version=p_new.version,updated_at=p_new.updated_at,updated_by=p_new.updated_by
    where id=p_new.id;
    perform bon_erp_private.erp_row_capture_audit_events(p_old,p_new,p_operation);
  end if;
  return p_new;
end
$$;

create function bon_erp_private.write_erp_store_view()
returns trigger language plpgsql security definer set search_path='' as $$
declare current_row public.bon_elagouz_store;
begin
  if tg_op <> 'INSERT' then
    perform 1 from bon_erp_private.erp_store_header header where header.id=old.id for update;
    if not found then raise exception 'STORE_CONFLICT' using errcode='40001'; end if;
    select * into current_row from public.bon_elagouz_store where id=old.id;
    if current_row is distinct from old then raise exception 'STORE_CONFLICT' using errcode='40001'; end if;
  end if;
  if tg_op='DELETE' then
    delete from bon_erp_private.erp_store_header where id=old.id;
    return old;
  end if;
  return bon_erp_private.apply_erp_records(old,new,tg_op);
end
$$;

revoke all on function
  bon_erp_private.apply_erp_records(public.bon_elagouz_store,public.bon_elagouz_store,text),
  bon_erp_private.write_erp_store_view()
from public, anon, authenticated;

create trigger apply_erp_store_view instead of insert or update or delete on public.bon_elagouz_store
for each row execute function bon_erp_private.write_erp_store_view();

-- Only the version feed still belongs on the physical header table.
do $migration$
declare
  rule text;
  expected constant text[] := array[
    'a_check_user_store_access','bon_erp_capture_audit','bon_erp_track_store_version','bon_erp_validate_store',
    'cashier_store_begun','cashier_store_uws_items','check_cashier_cost_purchase_snapshot',
    'check_catalog_name_drafts','check_financial_opening','check_purchase_refunds','check_sale_return_payment',
    'protect_audit_log','verify_purchase_snapshot_history','zz_agouz_archive_audit','zz_agouz_project_documents'
  ];
begin
  if (select array_agg(tgname::text order by tgname::text collate "C") from pg_trigger
      where tgrelid='bon_erp_private.erp_store_header'::regclass and not tgisinternal)
    is distinct from expected then raise exception 'ERP_STORAGE_TRIGGER_SET_CHANGED'; end if;
  foreach rule in array expected loop
    if rule<>'bon_erp_track_store_version' then
      execute format('drop trigger %I on bon_erp_private.erp_store_header',rule);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select, insert, update, delete on public.bon_elagouz_store to service_role;
    grant usage on schema bon_erp_private to service_role;
    grant select on bon_erp_private.erp_documents to service_role;
    grant execute on function bon_erp_private.erp_store_section(text,text) to service_role;
    revoke insert,update,delete,truncate on bon_erp_private.erp_store_header from service_role;
  end if;
end
$migration$;

-- Full saves and sparse saves share one commit routine. Only the small header is
-- locked, and duplicate operations can be acknowledged without loading sections.
do $migration$
declare
  definition text;
  patched text;
  start_at integer;
  finish_at integer;
  full_lock constant text := '  select * into v_current from public.bon_elagouz_store where id=''main_store'' for update;';
  delta_lock constant text := '  select * into current_row from public.bon_elagouz_store where id=''main_store'' for update;';
  state_load constant text := '  payload := to_jsonb(current_row)';
  save_call constant text := 'bon_erp_private.save_store(p_expected_version,payload,p_operation_id,p_queue_id)';
  bootstrap_insert constant text := 'insert into public.bon_elagouz_store(id,partners) values(''main_store'',jsonb_build_array(v_profile)) on conflict(id) do nothing;';
  discard_lock constant text := 'from public.bon_elagouz_store where id = ''main_store'' for update';
begin
  definition := pg_get_functiondef('bon_erp_private.save_store(bigint,jsonb,uuid,uuid)'::regprocedure);
  start_at := position('  update public.bon_elagouz_store set' in definition);
  finish_at := position('  if p_queue_id is not null then update public.cashier_sync_queue' in definition);
  if start_at=0 or finish_at<=start_at or position(full_lock in definition)=0
    or position('v_current public.bon_elagouz_store%rowtype;' in definition)=0
    or position('if not found then raise exception ''STORE_NOT_INITIALIZED'';' in definition)=0
  then raise exception 'ERP_FULL_SAVE_PATCH_REFUSED'; end if;
  patched := left(definition,start_at-1)||$sql$
  perform bon_erp_private.apply_erp_records(v_current,
    jsonb_populate_record(v_current,p_state||jsonb_build_object(
      'id',v_current.id,'version',v_current.version+1,'updated_at',now(),'updated_by',v_actor::text)),
    'UPDATE');
$sql$||substr(definition,finish_at);
  patched := replace(patched,'FUNCTION bon_erp_private.save_store(','FUNCTION bon_erp_private.commit_erp_records(');
  patched := replace(patched,'p_queue_id uuid DEFAULT NULL::uuid)','p_queue_id uuid, p_previous public.bon_elagouz_store)');
  patched := replace(patched,'v_current public.bon_elagouz_store%rowtype;','v_current public.bon_elagouz_store := p_previous;');
  patched := replace(patched,full_lock,'');
  patched := replace(patched,'if not found then raise exception ''STORE_NOT_INITIALIZED'';',
    'if v_current.id is null then raise exception ''STORE_NOT_INITIALIZED'';');
  if position('p_previous public.bon_elagouz_store)' in patched)=0
    then raise exception 'ERP_FULL_SAVE_SIGNATURE_CHANGED'; end if;
  execute patched;

  definition := pg_get_functiondef('bon_erp_private.save_store_changes(bigint,jsonb,uuid,uuid)'::regprocedure);
  if position(delta_lock in definition)=0 or position(state_load in definition)=0 or position(save_call in definition)=0
    then raise exception 'ERP_DELTA_SAVE_PATCH_REFUSED'; end if;
  patched := replace(definition,'  current_row public.bon_elagouz_store%rowtype;',
    E'  current_row public.bon_elagouz_store%rowtype;\n  current_version bigint;');
  patched := replace(patched,delta_lock,
    '  select version into current_version from bon_erp_private.erp_store_header where id=''main_store'' for update;');
  patched := replace(patched,'current_row.version','current_version');
  patched := replace(patched,state_load,
    '  select * into strict current_row from public.bon_elagouz_store where id=''main_store'';'||chr(10)||state_load);
  patched := replace(patched,save_call,
    'bon_erp_private.commit_erp_records(p_expected_version,payload,p_operation_id,p_queue_id,current_row)');
  execute patched;

  definition := pg_get_functiondef('bon_erp_private.bootstrap_owner()'::regprocedure);
  if position(bootstrap_insert in definition)=0 then raise exception 'ERP_BOOTSTRAP_PATCH_REFUSED'; end if;
  execute replace(definition,bootstrap_insert,$sql$
  insert into public.bon_elagouz_store(id,partners)
  select 'main_store',jsonb_build_array(v_profile)
  where not exists(select 1 from bon_erp_private.erp_store_header where id='main_store');
$sql$);

  definition := pg_get_functiondef('bon_erp_private.discard_cashier_save(uuid)'::regprocedure);
  if position(discard_lock in definition)=0 then raise exception 'ERP_DISCARD_LOCK_PATCH_REFUSED'; end if;
  execute replace(definition,discard_lock,'from bon_erp_private.erp_store_header where id = ''main_store'' for update');
end
$migration$;

create or replace function bon_erp_private.save_store(
  p_expected_version bigint,p_state jsonb,p_operation_id uuid,p_queue_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  previous public.bon_elagouz_store;
  actor uuid := auth.uid();
begin
  if actor is null or not exists(select 1 from public.erp_members where user_id=actor and role='partner') then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version<0
    or jsonb_typeof(p_state) is distinct from 'object' then raise exception 'INVALID_STATE'; end if;
  perform 1 from bon_erp_private.erp_store_header where id='main_store' for update;
  if not found then raise exception 'STORE_NOT_INITIALIZED'; end if;
  select * into strict previous from public.bon_elagouz_store where id='main_store';
  return bon_erp_private.commit_erp_records(p_expected_version,p_state,p_operation_id,p_queue_id,previous);
end
$$;
revoke all on function bon_erp_private.commit_erp_records(bigint,jsonb,uuid,uuid,public.bon_elagouz_store)
  from public, anon, authenticated;

-- All stored records were compared with a reconstructed snapshot above.
alter table bon_erp_private.erp_store_header
  drop column items, drop column production_batches, drop column purchase_invoices, drop column sales_invoices,
  drop column suppliers, drop column customers, drop column expenses, drop column partners, drop column audit_logs,
  drop column shifts, drop column employees, drop column employee_transactions, drop column stocktaking_records,
  drop column account_payments, drop column cashier_days, drop column financial_openings, drop column catalog_name_drafts;

notify pgrst, 'reload schema';
commit;
