begin;
-- Printed item summaries carry immutable source units and a single report day.
create function bon_erp_private.check_uws_queue() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if new.report_kind is distinct from 'items' or not exists(select 1 from jsonb_array_elements(new.raw_rows) x where x->>'sourceFormat'='uws-items-v1') then return new;end if;
 for r in select value from jsonb_array_elements(new.raw_rows) loop
  if r->>'sourceFormat' is distinct from 'uws-items-v1' or r->>'businessDate' is distinct from new.sale_date then raise exception 'UWS_REPORT_DATE_MISMATCH';end if;
  if coalesce(r->>'code','')!~'^[0-9]{4,20}$' or coalesce(r->>'unit','') not in ('kg','count') or coalesce(r->>'quantity','')!~'^[0-9]+(\.[0-9]+)?$' or coalesce(r->>'saleCount','')!~'^[0-9]+$' or coalesce(r->>'sourceRow','')!~'^[0-9]+$' then raise exception 'CASHIER_UWS_SOURCE_INVALID';end if;
  if (r->>'quantity')::numeric<=0 or (r->>'quantity')::numeric>1000000000000 or (r->>'saleCount')::numeric<=0 or (r->>'saleCount')::numeric>1000000000000 or (r->>'sourceRow')::numeric<=0 then raise exception 'CASHIER_UWS_SOURCE_INVALID';end if;
  if r->>'unit'='count' and (r->>'quantity')::numeric<>(r->>'saleCount')::numeric then raise exception 'CASHIER_UWS_SOURCE_INVALID';end if;
  if r?'sourceIssue' and r->>'sourceIssue' not in ('UWS_VARIANT_WEIGHTS_REQUIRED','UWS_SEASONING_WEIGHT_REQUIRED') then raise exception 'CASHIER_UWS_SOURCE_INVALID';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(new.raw_rows))<>(select count(distinct x->>'code') from jsonb_array_elements(new.raw_rows) x) then raise exception 'UWS_DUPLICATE_ITEM_CODE';end if;
 return new;
end $$;
revoke all on function bon_erp_private.check_uws_queue() from public,anon,authenticated;
create trigger cashier_uws_source before insert or update of raw_rows,sale_date,report_kind on public.cashier_sync_queue for each row execute function bon_erp_private.check_uws_queue();

create function bon_erp_private.check_store_uws_items() returns trigger
language plpgsql security invoker set search_path='' as $$
declare d jsonb;r jsonb;previous jsonb;q public.cashier_sync_queue%rowtype;source jsonb;line jsonb;item jsonb;source_index bigint;unit text;
begin
 for d in select value from jsonb_array_elements(new.cashier_days) loop
  r:=d->'itemsReport';if r is null then continue;end if;
  if tg_op='UPDATE' then
   select value->'itemsReport' into previous from jsonb_array_elements(old.cashier_days) where value->>'id'=d->>'id';
   if previous is not distinct from r then continue;end if;
  end if;
  select * into q from public.cashier_sync_queue where id::text=r->>'sourceQueueId' or content_hash=r->>'sha256' order by (content_hash=r->>'sha256') desc nulls last limit 1;
  if not found or not exists(select 1 from jsonb_array_elements(q.raw_rows) x where x->>'sourceFormat'='uws-items-v1') then continue;end if;
  if q.report_kind is distinct from 'items' or q.sale_date is distinct from d->>'date' or q.id::text is distinct from r->>'sourceQueueId' or q.content_hash is distinct from r->>'sha256' then raise exception 'CASHIER_UWS_SOURCE_MISMATCH';end if;
  if jsonb_array_length(r->'lines')<>jsonb_array_length(q.raw_rows) then raise exception 'CASHIER_UWS_LINES_MISMATCH';end if;
  for source,source_index in select value,ordinality from jsonb_array_elements(q.raw_rows) with ordinality loop
   if source?'sourceIssue' or source->>'code'='300014' and source->>'unit'<>'kg' then raise exception 'CASHIER_UWS_DETAILS_REQUIRED';end if;
   line:=r->'lines'->(source_index::integer-1);
   select value into item from jsonb_array_elements(new.items) where value->>'id'=line->>'itemId';
   if item is null or not(coalesce(trim(item->>'code'),'')=source->>'code' or coalesce(item->>'barcode','')=source->>'code') then raise exception 'CASHIER_UWS_CODE_MISMATCH';end if;
   if (select count(*) from jsonb_array_elements(new.items) x where trim(x->>'code')=source->>'code' or x->>'barcode'=source->>'code')<>1 then raise exception 'CASHIER_UWS_CODE_MISMATCH';end if;
   unit:=line->>'unitLabel';
   if unit is distinct from source->>'unit' and not(unit='piece' and source->>'unit'='count') then raise exception 'CASHIER_UWS_QUANTITY_MISMATCH';end if;
   if (line->>'quantity')::numeric is distinct from (source->>'quantity')::numeric or (line->>'normalizedQtyInBaseUnit')::numeric is distinct from bon_erp_private.base_quantity((source->>'quantity')::numeric,source->>'unit',item->>'baseUnit') then raise exception 'CASHIER_UWS_QUANTITY_MISMATCH';end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function bon_erp_private.check_store_uws_items() from public,anon,authenticated;
create trigger cashier_store_uws_items before insert or update of cashier_days on public.bon_elagouz_store for each row execute function bon_erp_private.check_store_uws_items();
commit;
