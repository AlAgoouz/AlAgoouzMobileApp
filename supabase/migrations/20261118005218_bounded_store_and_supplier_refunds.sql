begin;

-- Keep request limits separate from the size of the accumulated store.
do $migration$
declare
  definition text;
  source_schema text;
  next_schema jsonb;
  patched text;
  size_check constant text := 'if octet_length(s::text)>10485760 then raise exception ''STORE_TOO_LARGE'' using errcode=''22023''; end if;';
begin
  definition := pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure);
  source_schema := split_part(definition, '$schema$', 2);
  if source_schema = '' or position(size_check in definition) = 0 then
    raise exception 'STORE_SCHEMA_PATCH_REFUSED';
  end if;
  next_schema := jsonb_set(source_schema::jsonb, '{properties,purchase_invoices,items,properties,refundReceipts}', $json$
    {"type":"array","items":{"type":"object","additionalProperties":false,
     "properties":{"id":{"type":"string","minLength":1},"amount":{"type":"number","exclusiveMinimum":0},
     "date":{"type":"string","minLength":1},"actorId":{"type":"string","minLength":1},
     "recordedAt":{"type":"string","minLength":1}},
     "required":["id","amount","date","actorId","recordedAt"]}}
  $json$::jsonb);
  execute replace(replace(definition, size_check, ''), '$schema$'||source_schema||'$schema$', '$schema$'||next_schema::text||'$schema$');

  definition := pg_get_functiondef('bon_erp_private.validate_changes(jsonb,jsonb)'::regprocedure);
  patched := replace(definition, '''cancelledAt'',''cancelledBy'',''refundDue'']',
    '''cancelledAt'',''cancelledBy'',''refundDue'',''refundReceipts'']');
  patched := replace(patched, 'and n is distinct from p then raise exception ''CLOSED_DOCUMENT_IMMUTABLE'';',
    'and (case when f=''purchase_invoices'' then n-''refundReceipts'' is distinct from p-''refundReceipts'' else n is distinct from p end) then raise exception ''CLOSED_DOCUMENT_IMMUTABLE'';');
  if patched = definition or position('n-''refundReceipts''' in patched) = 0
    or position('''refundDue'',''refundReceipts'']' in patched) = 0 then
    raise exception 'SUPPLIER_REFUND_TRANSITION_PATCH_REFUSED';
  end if;
  execute patched;

  -- Full saves from older clients omit the new field. Keep the server's
  -- receipts in that case, while still rejecting an explicit history change.
  definition := pg_get_functiondef('bon_erp_private.save_store(bigint,jsonb,uuid,uuid)'::regprocedure);
  patched := replace(definition, '  update public.bon_elagouz_store set',
    $sql$
  if coalesce(current_setting('bon_erp.restore_user',true),'') is distinct from v_actor::text
    and v_current.purchase_invoices @? '$[*].refundReceipts' then
    p_state := jsonb_set(p_state,'{purchase_invoices}',(
      select coalesce(jsonb_agg(
        case when not (incoming.value ? 'refundReceipts') and previous.value ? 'refundReceipts'
          then incoming.value || jsonb_build_object('refundReceipts',previous.value->'refundReceipts')
          else incoming.value end order by incoming.ord),'[]')
      from jsonb_array_elements(p_state->'purchase_invoices') with ordinality incoming(value,ord)
      left join jsonb_array_elements(v_current.purchase_invoices) previous on previous.value->>'id'=incoming.value->>'id'
    ));
  end if;
  update public.bon_elagouz_store set$sql$);
  if patched = definition then raise exception 'SUPPLIER_REFUND_LEGACY_SAVE_PATCH_REFUSED'; end if;
  execute patched;

  definition := pg_get_functiondef('public.bon_erp_cash_summary(text,text)'::regprocedure);
  patched := replace(definition,
    'if day<=end_date and i?''refundDue'' then claims:=claims+(i->>''refundDue'')::numeric;end if;',
    $sql$if day<=end_date and i?'refundDue' then
       claims:=claims+(i->>'refundDue')::numeric;
       for m in select value from jsonb_array_elements(coalesce(i->'refundReceipts','[]')) loop
         if m->>'date'<=end_date then
           claims:=claims-(m->>'amount')::numeric;
           moves:=moves||jsonb_build_array(jsonb_build_object('date',m->>'date','amount',m->'amount'));
         end if;
       end loop;
     end if;$sql$);
  if patched = definition then raise exception 'SUPPLIER_REFUND_CASH_PATCH_REFUSED'; end if;
  execute patched;
end $migration$;

create function bon_erp_private.check_purchase_refunds() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  purchase jsonb;
  previous jsonb;
  receipts jsonb;
  old_receipts jsonb;
  cancelled_day text;
  business_day text := to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD');
  restoring boolean := coalesce(current_setting('bon_erp.restore_user',true),'') = auth.uid()::text;
  receipt jsonb;
  amount numeric;
  total numeric;
begin
  for purchase, previous in
    select n.value, o.value
    from jsonb_array_elements(new.purchase_invoices) n
    left join jsonb_array_elements(old.purchase_invoices) o on o.value->>'id' = n.value->>'id'
    where n.value->'refundReceipts' is distinct from o.value->'refundReceipts'
  loop
    receipts := coalesce(purchase->'refundReceipts', '[]');
    old_receipts := coalesce(previous->'refundReceipts', '[]');
    if not coalesce(restoring,false) then
      if not bon_erp_private.is_master(auth.uid()) then
        perform bon_erp_private.require_access('purchases');
      end if;
      if previous->>'isCancelled' is distinct from 'true'
        or jsonb_array_length(receipts) <> jsonb_array_length(old_receipts)+1
        or exists(select 1 from jsonb_array_elements(old_receipts) with ordinality t(value, ord)
          where receipts->(ord::integer-1) is distinct from value)
        or (receipts->-1)->>'actorId' is distinct from auth.uid()::text then
        raise exception 'INVALID_SUPPLIER_REFUND_HISTORY';
      end if;
    end if;
    if receipts = '[]'::jsonb then continue; end if;
    if purchase->>'isCancelled' is distinct from 'true' or purchase->>'cancelledAt' is null
      or coalesce((purchase->>'refundDue')::numeric,0) <= 0
      or jsonb_array_length(receipts) <> (select count(distinct value->>'id') from jsonb_array_elements(receipts)) then
      raise exception 'INVALID_SUPPLIER_REFUND';
    end if;
    cancelled_day := to_char((purchase->>'cancelledAt')::timestamptz at time zone 'Africa/Cairo', 'YYYY-MM-DD');
    total := 0;
    for receipt in select value from jsonb_array_elements(receipts) loop
      amount := (receipt->>'amount')::numeric;
      if not coalesce(bon_erp_private.valid_date(receipt->>'date'),false) or receipt->>'date' not between cancelled_day and business_day
        or (receipt->>'recordedAt')::timestamptz is null or amount is null or amount <= 0 or amount <> round(amount,2) then
        raise exception 'INVALID_SUPPLIER_REFUND';
      end if;
      total := total + amount;
    end loop;
    if total > (purchase->>'refundDue')::numeric then raise exception 'INVALID_SUPPLIER_REFUND'; end if;
  end loop;
  return new;
end $$;
revoke all on function bon_erp_private.check_purchase_refunds() from public, anon, authenticated;
create trigger check_purchase_refunds before update of purchase_invoices on public.bon_elagouz_store
for each row when (old.purchase_invoices is distinct from new.purchase_invoices)
execute function bon_erp_private.check_purchase_refunds();

-- Apply deltas under the same lock, version, receipt, queue and validation as full saves.
alter table public.bon_erp_store_receipts add column changes_hash text;
create function bon_erp_private.save_store_changes(
  p_expected_version bigint, p_changes jsonb, p_operation_id uuid, p_queue_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_row public.bon_elagouz_store%rowtype;
  receipt public.bon_erp_store_receipts%rowtype;
  change_hash text;
  payload jsonb;
  field text;
  delta jsonb;
  existing_rows jsonb;
  resulting_rows jsonb;
  arranged jsonb;
  result jsonb;
begin
  if actor is null or public.bon_erp_role() is distinct from 'partner' then
    raise exception 'USER_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_operation_id is null
    or jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'INVALID_STORE_CHANGES'; end if;
  if octet_length(p_changes::text)>10485760 then raise exception 'STORE_TOO_LARGE' using errcode='22023'; end if;
  change_hash := md5(jsonb_build_array(p_expected_version,p_changes,p_queue_id)::text);
  select * into current_row from public.bon_elagouz_store where id='main_store' for update;
  if not found then raise exception 'STORE_NOT_INITIALIZED'; end if;
  select * into receipt from public.bon_erp_store_receipts where operation_id=p_operation_id;
  if found then
    if receipt.actor_id is distinct from actor or receipt.changes_hash is distinct from change_hash then
      raise exception 'OPERATION_ID_REUSED';
    end if;
    if current_row.version <> receipt.version then raise exception 'STORE_CONFLICT' using errcode='40001'; end if;
    return jsonb_build_object('version',receipt.version);
  end if;
  if current_row.version <> p_expected_version then raise exception 'STORE_CONFLICT' using errcode='40001'; end if;
  payload := to_jsonb(current_row)-array['id','version','updated_at','updated_by'];
  for field, delta in select key, value from jsonb_each(p_changes) loop
    existing_rows := payload->field;
    if jsonb_typeof(existing_rows) is distinct from 'array' or jsonb_typeof(delta) is distinct from 'object'
      or jsonb_typeof(delta->'upsert') is distinct from 'array' or jsonb_typeof(delta->'remove') is distinct from 'array'
      or (delta ? 'order' and jsonb_typeof(delta->'order') is distinct from 'array')
      or delta-array['upsert','remove','order'] <> '{}'::jsonb then raise exception 'INVALID_STORE_CHANGES'; end if;
    if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(delta->'upsert'))
      or exists(select 1 from jsonb_array_elements(delta->'remove') where jsonb_typeof(value) <> 'string')
      or exists(select 1 from jsonb_array_elements(delta->'upsert') where (delta->'remove') ? (value->>'id')) then
      raise exception 'INVALID_STORE_CHANGES';
    end if;
    with prior as (select value, ord, value->>'id' as row_id from jsonb_array_elements(existing_rows) with ordinality t(value,ord)),
    changed as (select value, ord, value->>'id' as row_id from jsonb_array_elements(delta->'upsert') with ordinality t(value,ord)),
    combined as (
      select 0 as group_order, changed.ord, changed.value from changed left join prior using (row_id) where prior.row_id is null
      union all
      select 1, prior.ord, coalesce(changed.value,prior.value) from prior left join changed using (row_id)
      where not (delta->'remove') ? prior.row_id
    )
    select coalesce(jsonb_agg(value order by group_order, ord),'[]') into resulting_rows from combined;
    if delta ? 'order' then
      select coalesce(jsonb_agg(row.value order by sequence.ord),'[]')
      into arranged
      from jsonb_array_elements_text(delta->'order') with ordinality sequence(id,ord)
      join jsonb_array_elements(resulting_rows) row on row.value->>'id'=sequence.id;
      if (select count(*) <> count(distinct value) from jsonb_array_elements(delta->'order'))
        or jsonb_array_length(arranged) <> jsonb_array_length(resulting_rows)
        or jsonb_array_length(arranged) <> jsonb_array_length(delta->'order') then
        raise exception 'INVALID_STORE_CHANGES';
      end if;
      resulting_rows := arranged;
    end if;
    payload := jsonb_set(payload,array[field],resulting_rows);
  end loop;
  result := bon_erp_private.save_store(p_expected_version,payload,p_operation_id,p_queue_id);
  update public.bon_erp_store_receipts set changes_hash=change_hash where operation_id=p_operation_id;
  return result;
end $$;

create function public.bon_erp_save_store_changes(
  p_expected_version bigint, p_changes jsonb, p_operation_id uuid, p_queue_id uuid default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select bon_erp_private.save_store_changes(p_expected_version,p_changes,p_operation_id,p_queue_id)
$$;
revoke all on function bon_erp_private.save_store_changes(bigint,jsonb,uuid,uuid),
  public.bon_erp_save_store_changes(bigint,jsonb,uuid,uuid) from public, anon, authenticated;
grant execute on function bon_erp_private.save_store_changes(bigint,jsonb,uuid,uuid),
  public.bon_erp_save_store_changes(bigint,jsonb,uuid,uuid) to authenticated;

commit;
