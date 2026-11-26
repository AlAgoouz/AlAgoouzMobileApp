begin;
set local lock_timeout = '5s';

-- Keep only the current receipt with each purchase snapshot. Earlier receipts stay on the item.
create function bon_erp_private.compact_purchase_item(p_item jsonb, p_keep_receipt boolean)
returns jsonb language sql immutable strict set search_path = '' as $$
  select case when p_keep_receipt then
    p_item || jsonb_build_object(
      'costHistory',jsonb_build_array(p_item->'costHistory'->(-1)),
      'supplierPrices',jsonb_build_array(p_item->'supplierPrices'->0))
  else jsonb_set(p_item - 'costHistory', '{supplierPrices}', '[]'::jsonb) end
$$;

create function bon_erp_private.check_purchase_snapshot_cancellation(
  p_invoice jsonb, p_after jsonb, p_current jsonb, p_items jsonb
) returns void language plpgsql set search_path = '' as $$
declare
  checkpoint jsonb;
  previous jsonb;
  restored jsonb;
  next_item jsonb;
  cost_count int;
  supplier_count int;
begin
  select value into checkpoint from jsonb_array_elements(p_invoice->'inventoryHistory')
    where value->>'itemId'=p_after->>'id';
  select value into previous from jsonb_array_elements(p_invoice->'inventoryBefore')
    where value->>'id'=p_after->>'id';
  select value into next_item from jsonb_array_elements(p_items)
    where value->>'id'=p_after->>'id';
  cost_count := (checkpoint->>'costEntries')::int;
  supplier_count := (checkpoint->>'supplierEntries')::int;

  if checkpoint is null or previous is null
    or bon_erp_private.compact_purchase_item(p_current,true) is distinct from p_after
    or jsonb_array_length(p_current->'costHistory') is distinct from coalesce(cost_count,0)+1
    or p_current->'costHistory'->(-1)->>'sourceId' is distinct from p_invoice->>'id'
    or p_current->'costHistory'->(-1)->>'sourceType' is distinct from 'purchase'
    or jsonb_array_length(p_current->'supplierPrices') is distinct from supplier_count+1
    or p_current->'supplierPrices'->0->>'invoiceId' is distinct from p_invoice->>'invoiceNumber'
  then raise exception 'PURCHASE_HAS_LATER_MOVEMENTS'; end if;

  restored := jsonb_set(previous, '{supplierPrices}', (p_current->'supplierPrices')-0);
  if cost_count is not null then
    restored := jsonb_set(restored, '{costHistory}', (p_current->'costHistory')-(-1));
  end if;
  if restored is distinct from next_item then
    raise exception 'PURCHASE_CANCELLED_STOCK_MISMATCH';
  end if;
end
$$;

create function bon_erp_private.validate_purchase_snapshots()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  invoice jsonb;
  earlier_invoice jsonb;
  after_snapshot jsonb;
  line jsonb;
  previous jsonb;
  current_item jsonb;
  checkpoint jsonb;
  item_count int;
begin
  if coalesce(current_setting('bon_erp.restore_user',true),'')=auth.uid()::text then
    return new;
  end if;

  for invoice in
    select value from jsonb_array_elements(new.purchase_invoices) next
    where value ? 'inventoryHistory'
      and not exists (
        select 1 from jsonb_array_elements(old.purchase_invoices) prior
        where prior->>'id'=next.value->>'id'
      )
  loop
    item_count := jsonb_array_length(invoice->'items');
    if jsonb_array_length(invoice->'inventoryHistory') is distinct from item_count
      or jsonb_array_length(invoice->'inventoryBefore') is distinct from item_count
      or jsonb_array_length(invoice->'inventoryAfter') is distinct from item_count
      or item_count <> (select count(distinct value->>'itemId') from jsonb_array_elements(invoice->'items'))
      or item_count <> (select count(distinct value->>'itemId') from jsonb_array_elements(invoice->'inventoryHistory'))
      or item_count <> (select count(distinct value->>'id') from jsonb_array_elements(invoice->'inventoryBefore'))
      or item_count <> (select count(distinct value->>'id') from jsonb_array_elements(invoice->'inventoryAfter'))
    then raise exception 'PURCHASE_SNAPSHOT_MISMATCH'; end if;

    for line in select value from jsonb_array_elements(invoice->'items') loop
      select value into previous from jsonb_array_elements(old.items) where value->>'id'=line->>'itemId';
      select value into current_item from jsonb_array_elements(new.items) where value->>'id'=line->>'itemId';
      select value into checkpoint from jsonb_array_elements(invoice->'inventoryHistory')
        where value->>'itemId'=line->>'itemId';
      if previous is null or current_item is null
        or checkpoint is distinct from jsonb_build_object(
          'itemId',line->>'itemId',
          'costEntries',jsonb_array_length(previous->'costHistory'),
          'supplierEntries',jsonb_array_length(previous->'supplierPrices'))
        or not exists (select 1 from jsonb_array_elements(invoice->'inventoryBefore') snap
          where snap=bon_erp_private.compact_purchase_item(previous,false))
        or not exists (select 1 from jsonb_array_elements(invoice->'inventoryAfter') snap
          where snap=bon_erp_private.compact_purchase_item(current_item,true))
        or ((current_item->'costHistory')-(-1)) is distinct from coalesce(previous->'costHistory','[]')
        or current_item->'costHistory'->(-1)->>'sourceId' is distinct from invoice->>'id'
        or current_item->'costHistory'->(-1)->>'sourceType' is distinct from 'purchase'
        or ((current_item->'supplierPrices')-0) is distinct from previous->'supplierPrices'
        or current_item->'supplierPrices'->0 is distinct from jsonb_build_object(
          'supplierId',invoice->'supplierId', 'supplierName',invoice->'supplierName',
          'date',invoice->'date','price',line->'purchasePrice','invoiceId',invoice->'invoiceNumber')
      then raise exception 'PURCHASE_SNAPSHOT_MISMATCH'; end if;
    end loop;
  end loop;

  for earlier_invoice in
    select value from jsonb_array_elements(old.purchase_invoices) prior
    where value ? 'inventoryHistory' and not coalesce((value->>'isCancelled')::boolean,false)
  loop
    select value into invoice from jsonb_array_elements(new.purchase_invoices)
      where value->>'id'=earlier_invoice->>'id';
    if invoice is null then continue; end if;
    if (invoice->'inventoryHistory') is distinct from (earlier_invoice->'inventoryHistory')
      or (invoice->'inventoryBefore') is distinct from (earlier_invoice->'inventoryBefore')
      or (invoice->'inventoryAfter') is distinct from (earlier_invoice->'inventoryAfter')
    then raise exception 'PURCHASE_SNAPSHOT_MISMATCH'; end if;
    if not coalesce((invoice->>'isCancelled')::boolean,false) then continue; end if;

    for after_snapshot in select value from jsonb_array_elements(earlier_invoice->'inventoryAfter') loop
      select value into current_item from jsonb_array_elements(old.items)
        where value->>'id'=after_snapshot->>'id';
      perform bon_erp_private.check_purchase_snapshot_cancellation(
        earlier_invoice,after_snapshot,current_item,new.items);
    end loop;
  end loop;
  return new;
end
$$;

create trigger verify_purchase_snapshot_history before update of purchase_invoices on public.bon_elagouz_store
for each row when (old.purchase_invoices is distinct from new.purchase_invoices)
execute function bon_erp_private.validate_purchase_snapshots();

do $migration$
declare
  definition text;
  source_schema text;
  next_schema jsonb;
  old_check constant text :=
    'if r is distinct from i then raise exception ''PURCHASE_HAS_LATER_MOVEMENTS'';end if;';
begin
  definition := pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure);
  source_schema := split_part(definition, '$schema$', 2);
  if source_schema = '' then raise exception 'PURCHASE_SNAPSHOT_SCHEMA_PATCH_REFUSED'; end if;
  next_schema := jsonb_set(source_schema::jsonb,
    '{properties,purchase_invoices,items,properties,inventoryHistory}',
    '{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,
       "required":["itemId","costEntries","supplierEntries"],
       "properties":{"itemId":{"type":"string","minLength":1},
         "costEntries":{"anyOf":[{"type":"integer","minimum":0,"maximum":2147483646},{"type":"null"}]},
         "supplierEntries":{"type":"integer","minimum":0,"maximum":2147483646}
       }}}'::jsonb);
  execute replace(definition,'$schema$'||source_schema||'$schema$','$schema$'||next_schema::text||'$schema$');

  definition := pg_get_functiondef('bon_erp_private.validate_financial_details(jsonb,jsonb)'::regprocedure);
  if position(old_check in definition)=0 then raise exception 'PURCHASE_SNAPSHOT_TRANSITION_PATCH_REFUSED'; end if;
  execute replace(definition,old_check,$sql$
    if not (n ? 'inventoryHistory') and r is distinct from i then
      raise exception 'PURCHASE_HAS_LATER_MOVEMENTS';
    end if;
  $sql$);

  -- Older screens preserve the compact snapshots but their schema omits the checkpoint.
  -- Keep the accepted checkpoint unless a newer client explicitly supplies one.
  definition := pg_get_functiondef('bon_erp_private.save_store(bigint,jsonb,uuid,uuid)'::regprocedure);
  if position('  update public.bon_elagouz_store set' in definition)=0 then
    raise exception 'PURCHASE_SNAPSHOT_LEGACY_PATCH_REFUSED';
  end if;
  execute replace(definition,'  update public.bon_elagouz_store set',$sql$
  if coalesce(current_setting('bon_erp.restore_user',true),'') is distinct from v_actor::text
    and v_current.purchase_invoices @? '$[*].inventoryHistory' then
    p_state := jsonb_set(p_state,'{purchase_invoices}',(
      select coalesce(jsonb_agg(
        case when previous.value ? 'inventoryHistory' and not (incoming.value ? 'inventoryHistory')
          then incoming.value || jsonb_build_object('inventoryHistory',previous.value->'inventoryHistory')
          else incoming.value end order by incoming.ord),'[]')
      from jsonb_array_elements(p_state->'purchase_invoices') with ordinality incoming(value,ord)
      left join jsonb_array_elements(v_current.purchase_invoices) previous on previous.value->>'id'=incoming.value->>'id'
    ));
  end if;
  update public.bon_elagouz_store set$sql$);
end
$migration$;

revoke all on function bon_erp_private.compact_purchase_item(jsonb,boolean),
  bon_erp_private.check_purchase_snapshot_cancellation(jsonb,jsonb,jsonb,jsonb),
  bon_erp_private.validate_purchase_snapshots()
from public, anon, authenticated;

commit;
