begin;
set local lock_timeout = '5s';

create table bon_erp_private.erp_documents (
  store_id text not null references public.bon_elagouz_store(id) on delete cascade,
  section text not null,
  document_id text not null,
  position bigint not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = document_id),
  primary key (store_id, section, document_id)
) partition by list (section);

alter table bon_erp_private.erp_documents enable row level security;
revoke all on bon_erp_private.erp_documents from public, anon, authenticated;
grant select on bon_erp_private.erp_documents to authenticated;
create policy erp_documents_store_read on bon_erp_private.erp_documents
for select to authenticated
using (exists (select 1 from public.bon_elagouz_store store where store.id=erp_documents.store_id));

create index erp_document_order on bon_erp_private.erp_documents(store_id,section,position);

do $$
declare name text;
begin
  foreach name in array array[
    'items','production_batches','purchase_invoices','sales_invoices','suppliers',
    'customers','expenses','partners','audit_logs','shifts','employees','employee_transactions',
    'stocktaking_records','account_payments','cashier_days','financial_openings','catalog_name_drafts'
  ] loop
    execute format('create table bon_erp_private.%I partition of bon_erp_private.erp_documents for values in (%L)',
      'erp_doc_'||name,name);
    execute format('alter table bon_erp_private.%I enable row level security', 'erp_doc_'||name);
    execute format('revoke all on bon_erp_private.%I from public, anon, authenticated','erp_doc_'||name);
  end loop;
end
$$;

create table bon_erp_private.erp_history_archive (
  sequence bigint generated always as identity primary key,
  store_id text not null,
  kind text not null check(kind in ('audit','cost')),
  source_id text not null,
  fingerprint bytea not null,
  entry jsonb not null,
  archived_at timestamptz not null default now(),
  unique(store_id,kind,source_id,fingerprint)
);
alter table bon_erp_private.erp_history_archive enable row level security;
revoke all on bon_erp_private.erp_history_archive from public, anon, authenticated;
create index erp_archive_page on bon_erp_private.erp_history_archive(store_id,kind,sequence desc);

create function bon_erp_private.store_document_sections(p_document jsonb)
returns table(section text, payload jsonb) language sql immutable set search_path = '' as $$
  select key,value from jsonb_each(p_document)
  where key in ('items','production_batches','purchase_invoices','sales_invoices','suppliers',
    'customers','expenses','partners','audit_logs','shifts','employees','employee_transactions',
    'stocktaking_records','account_payments','cashier_days','financial_openings','catalog_name_drafts');
$$;

create function bon_erp_private.sync_erp_documents(p_store_id text,p_previous jsonb,p_next jsonb)
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
    insert into bon_erp_private.erp_documents as target(store_id,section,document_id,position,payload)
    select p_store_id,part.section,row.id,
      case when prepend_only then coalesce(previous.position,first_position-added+row.ordinality-1)
        else row.ordinality end,
      case when part.section='items' then row.value-'costHistory' else row.value end
    from desired row
    left join bon_erp_private.erp_documents previous
      on previous.store_id=p_store_id and previous.section=part.section and previous.document_id=row.id
    on conflict(store_id,section,document_id) do update set position=excluded.position,payload=excluded.payload
    where (target.position,target.payload) is distinct from (excluded.position,excluded.payload);
  end loop;
end
$$;

create function bon_erp_private.archive_stock_costs(p_store_id text,p_items jsonb,p_previous jsonb)
returns void language sql set search_path = '' as $$
  insert into bon_erp_private.erp_history_archive(store_id,kind,source_id,fingerprint,entry)
  select p_store_id,'cost',item->>'id'||':'||(receipt->>'id'),
    sha256(convert_to(receipt::text,'UTF8')),
    jsonb_build_object('itemId',item->>'id','itemName',item->>'name')||receipt
  from jsonb_array_elements(p_items) item
  left join jsonb_array_elements(p_previous) previous on previous->>'id'=item->>'id'
  cross join lateral jsonb_array_elements(coalesce(item->'costHistory','[]'::jsonb)) receipt
  where item->'costHistory' is distinct from previous->'costHistory'
  on conflict(store_id,kind,source_id,fingerprint) do nothing;
$$;

create function bon_erp_private.project_erp_documents()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform bon_erp_private.sync_erp_documents(new.id,case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end,to_jsonb(new));
  if tg_op='INSERT' or new.items is distinct from old.items then
    perform bon_erp_private.archive_stock_costs(new.id,new.items,case when tg_op='UPDATE' then old.items else '[]'::jsonb end);
  end if;
  return new;
end
$$;

create function bon_erp_private.archive_overflow_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_array_length(new.audit_logs)<=250 then return new; end if;
  insert into bon_erp_private.erp_history_archive(store_id,kind,source_id,fingerprint,entry)
  select new.id,'audit',value->>'id',sha256(convert_to(value::text,'UTF8')),value
  from jsonb_array_elements(new.audit_logs) with ordinality logs(value,position)
  where position>250
  on conflict(store_id,kind,source_id,fingerprint) do nothing;
  select coalesce(jsonb_agg(value order by position),'[]'::jsonb) into new.audit_logs
  from jsonb_array_elements(new.audit_logs) with ordinality logs(value,position) where position<=250;
  return new;
end
$$;

-- Acquire the write lock before backfill so no committed version can be missed.
lock table public.bon_elagouz_store in share row exclusive mode;
select bon_erp_private.sync_erp_documents(s.id,'{}'::jsonb,to_jsonb(s)) from public.bon_elagouz_store s;
select bon_erp_private.archive_stock_costs(s.id,s.items,'[]'::jsonb) from public.bon_elagouz_store s;
insert into bon_erp_private.erp_history_archive(store_id,kind,source_id,fingerprint,entry)
select s.id,'audit',v->>'id',sha256(convert_to(v::text,'UTF8')),v
from public.bon_elagouz_store s
cross join lateral jsonb_array_elements(s.audit_logs) with ordinality logs(v,position)
where position>250
on conflict(store_id,kind,source_id,fingerprint) do nothing;

-- The established access, movement and accounting checks run before truncating the active audit slice.
create trigger zz_agouz_archive_audit before insert or update of audit_logs on public.bon_elagouz_store
for each row execute function bon_erp_private.archive_overflow_audit();
create trigger zz_agouz_project_documents after insert or update on public.bon_elagouz_store
for each row execute function bon_erp_private.project_erp_documents();

-- Keep the established roles, record shapes, ordering and cashier corrections on indexed reads.
do $$
declare body text; patched text;
begin
  body:=pg_get_functiondef('public.bon_erp_sales_page(text,text,integer,integer)'::regprocedure);
  patched:=replace(body,
    'jsonb_array_elements(case when kind=''cashier'' then s.cashier_days else s.sales_invoices end) with ordinality t(v,ord)',
    '(select payload as v, position as ord from bon_erp_private.erp_documents where store_id=s.id and section=case when kind=''cashier'' then ''cashier_days'' else ''sales_invoices'' end) t');
  if patched=body then raise exception 'ERP_DOCUMENT_HISTORY_PATCH_REFUSED'; end if;
  execute patched;

  body:=pg_get_functiondef('public.bon_erp_sale_detail(text,text)'::regprocedure);
  patched:=replace(body,
    'cross join lateral jsonb_array_elements(case when p_kind=''cashier'' then s.cashier_days else s.sales_invoices end) v',
    'cross join lateral (select payload as v from bon_erp_private.erp_documents where store_id=s.id and section=case when p_kind=''cashier'' then ''cashier_days'' else ''sales_invoices'' end and document_id=p_id) records');
  if patched=body then raise exception 'ERP_DOCUMENT_DETAIL_PATCH_REFUSED'; end if;
  execute patched;

  body:=pg_get_functiondef('public.bon_erp_item_search(text,integer)'::regprocedure);
  patched:=replace(body,'public.bon_elagouz_store s cross join lateral jsonb_array_elements(s.items) v where s.id=''main_store''',
    '(select payload as v from bon_erp_private.erp_documents where store_id=''main_store'' and section=''items'') records where true');
  if patched=body then raise exception 'ERP_DOCUMENT_SEARCH_PATCH_REFUSED'; end if;
  execute patched;
end
$$;

create function public.bon_erp_history_archive(p_kind text,p_before bigint default null,p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not bon_erp_private.is_master(auth.uid()) then
    raise exception 'USER_PERMISSION_DENIED' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('audit','cost') or p_limit is null or p_limit<1 or p_limit>100
     or (p_before is not null and p_before<1) then
    raise exception 'INVALID_ARCHIVE_FILTER';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'sequence',row.sequence,'archivedAt',row.archived_at,'entry',row.entry
    ) order by row.sequence desc)
    from (
      select data.sequence,data.archived_at,data.entry from bon_erp_private.erp_history_archive data
      where data.store_id='main_store' and data.kind=p_kind and (p_before is null or data.sequence<p_before)
      order by data.sequence desc limit p_limit
    ) row
  ),'[]'::jsonb);
end
$$;

revoke all on function
  bon_erp_private.store_document_sections(jsonb),
  bon_erp_private.sync_erp_documents(text,jsonb,jsonb),
  bon_erp_private.archive_stock_costs(text,jsonb,jsonb),
  bon_erp_private.project_erp_documents(),
  bon_erp_private.archive_overflow_audit(),
  public.bon_erp_history_archive(text,bigint,integer)
from public, anon, authenticated;
grant execute on function public.bon_erp_history_archive(text,bigint,integer) to authenticated;
commit;
