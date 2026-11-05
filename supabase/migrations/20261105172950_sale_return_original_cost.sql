-- Return physical goods at the immutable invoice cost. Prepared recipes stay consumed.
begin;
create or replace function bon_erp_private.validate_sale_return_costs(s jsonb,o jsonb)
returns void language plpgsql set search_path='' as $$
declare i jsonb;p jsonb;h jsonb;r jsonb;old_count int;return_count int;
  qty numeric;original_cost numeric;balance_qty numeric;average_cost numeric;expected_average numeric;
  seen text[];candidate jsonb;
begin
  -- A return is a transition of an existing invoice, never a new, already-returned sale.
  for r in select value from jsonb_array_elements(s->'sales_invoices') loop
    if coalesce((r->>'isReturned')::boolean,false) and not exists(
      select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=r->>'id'
    ) then raise exception 'RETURN_EXISTING_INVOICE_REQUIRED';end if;
    if coalesce((r->>'isReturned')::boolean,false) and exists(
      select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=r->>'id' and not coalesce((x->>'isReturned')::boolean,false)
    ) and exists(
      select 1 from jsonb_array_elements(r->'items') l where l->>'category' not in ('drink_recipe','seasoning_recipe')
      and not exists(select 1 from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId')
    ) then raise exception 'RETURN_ITEM_REQUIRED';end if;
  end loop;
  for i in select value from jsonb_array_elements(s->'items') loop
    select x into p from jsonb_array_elements(o->'items') x where x->>'id'=i->>'id';
    old_count:=jsonb_array_length(coalesce(p->'costHistory','[]'));
    select count(*) into return_count from jsonb_array_elements(s->'sales_invoices') n
      join jsonb_array_elements(o->'sales_invoices') previous on previous->>'id'=n->>'id'
      where coalesce((n->>'isReturned')::boolean,false) and not coalesce((previous->>'isReturned')::boolean,false)
      and exists(select 1 from jsonb_array_elements(previous->'items') l where l->>'itemId'=i->>'id' and l->>'category' not in ('drink_recipe','seasoning_recipe'));
    if return_count=0 then
      if exists(select 1 from jsonb_array_elements(coalesce(i->'costHistory','[]')) with ordinality t(record,position)
        where position>old_count and record->>'sourceType'='sale_return') then raise exception 'RETURN_RECEIPT_WITHOUT_DOCUMENT';end if;
      continue;
    end if;
    -- Financial returns are saved independently of purchase/production receipts.
    if p is null or i->>'costingVersion' is distinct from '2'
      or jsonb_array_length(coalesce(i->'costHistory','[]'))<>old_count+return_count
      then raise exception 'RETURN_COST_HISTORY_REQUIRED';end if;
    balance_qty:=(p->>'stock')::numeric;average_cost:=(p->>'costPrice')::numeric;seen:=array[]::text[];
    for h in select record from jsonb_array_elements(i->'costHistory') with ordinality t(record,position)
      where position>old_count order by position loop
      select previous into r from jsonb_array_elements(o->'sales_invoices') previous
        join jsonb_array_elements(s->'sales_invoices') n on n->>'id'=previous->>'id'
        where previous->>'id'=h->>'sourceId' and not coalesce((previous->>'isReturned')::boolean,false)
        and coalesce((n->>'isReturned')::boolean,false);
      select n into candidate from jsonb_array_elements(s->'sales_invoices') n where n->>'id'=h->>'sourceId';
      if r is null or h->>'sourceType' is distinct from 'sale_return' or h->>'sourceId'=any(seen)
        or h->>'postedAt' is distinct from candidate->>'returnedAt'
        or h->>'date' is distinct from (((candidate->>'returnedAt')::timestamptz at time zone 'Africa/Cairo')::date)::text
        then raise exception 'RETURN_COST_RECEIPT_INVALID';end if;
      seen:=array_append(seen,h->>'sourceId');
      select sum((l->>'normalizedQtyInBaseUnit')::numeric),sum((l->>'totalCost')::numeric)
        into qty,original_cost from jsonb_array_elements(r->'items') l
        where l->>'itemId'=i->>'id' and l->>'category' not in ('drink_recipe','seasoning_recipe');
      if qty is null or qty<=0 or abs((h->>'quantity')::numeric-qty)>0.000001
        or abs((h->>'unitCost')::numeric-original_cost/qty)>0.00000001
        then raise exception 'RETURN_ORIGINAL_COST_REQUIRED';end if;
      expected_average:=round((greatest(0,balance_qty)*average_cost+original_cost)/(greatest(0,balance_qty)+qty),2);
      if abs((h->>'averageCost')::numeric-expected_average)>0.001 then raise exception 'RETURN_AVERAGE_COST_MISMATCH';end if;
      balance_qty:=round(balance_qty+qty,6);average_cost:=expected_average;
    end loop;
    if abs((i->>'costPrice')::numeric-average_cost)>0.001 or abs((i->>'stock')::numeric-balance_qty)>0.000001
      then raise exception 'RETURN_AVERAGE_COST_MISMATCH';end if;
  end loop;
end $$;
revoke all on function bon_erp_private.validate_sale_return_costs(jsonb,jsonb) from public,anon,authenticated;

do $patch$
declare definition text;patched text;old_schema text;next_schema jsonb;path text[];path_json jsonb;
begin
  select pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure) into definition;
  old_schema:=split_part(definition,'$schema$',2);next_schema:=old_schema::jsonb;
  for path_json in select value from jsonb_array_elements('[
    ["properties","items","items","properties","costHistory","items","properties","sourceType","enum"],
    ["properties","purchase_invoices","items","properties","inventoryBefore","items","properties","costHistory","items","properties","sourceType","enum"],
    ["properties","purchase_invoices","items","properties","inventoryAfter","items","properties","costHistory","items","properties","sourceType","enum"]
  ]'::jsonb) loop
    select array_agg(value order by position) into path from jsonb_array_elements_text(path_json) with ordinality t(value,position);
    if next_schema#>path is distinct from '["opening","purchase","production"]'::jsonb then raise exception 'RETURN_SCHEMA_PATCH_MISMATCH';end if;
    next_schema:=jsonb_set(next_schema,path,'["opening","purchase","production","sale_return"]'::jsonb);
  end loop;
  execute replace(definition,old_schema,next_schema::text);

  select pg_get_functiondef('bon_erp_private.validate_section_changes(jsonb,jsonb)'::regprocedure) into definition;
  patched:=replace(definition,'then raise exception ''COST_FROM_DOCUMENT_REQUIRED'';end if;',
    'and not exists(select 1 from jsonb_array_elements(s->''sales_invoices'') returned_doc
      join jsonb_array_elements(o->''sales_invoices'') previous on previous->>''id''=returned_doc->>''id''
      where coalesce((returned_doc->>''isReturned'')::boolean,false) and not coalesce((previous->>''isReturned'')::boolean,false)
      and exists(select 1 from jsonb_array_elements(previous->''items'') line where line->>''itemId''=i->>''id'' and line->>''category'' not in (''drink_recipe'',''seasoning_recipe'')))
     then raise exception ''COST_FROM_DOCUMENT_REQUIRED'';end if;');
  if patched=definition then raise exception 'RETURN_COST_GUARD_PATCH_MISMATCH';end if;
  execute patched;

  select pg_get_functiondef('bon_erp_private.validate_changes(jsonb,jsonb)'::regprocedure) into definition;
  patched:=replace(definition,'where l->>''category''=''drink_recipe'';', 'where l->>''category'' in (''drink_recipe'',''seasoning_recipe'');');
  if patched=definition then raise exception 'RETURN_CONSUMPTION_PATCH_MISMATCH';end if;
  execute patched;
  select pg_get_functiondef('bon_erp_private.validate_financial_details(jsonb,jsonb)'::regprocedure) into definition;
  patched:=replace(definition,'where line->>''category''=''drink_recipe'';', 'where line->>''category'' in (''drink_recipe'',''seasoning_recipe'');');
  if patched=definition then raise exception 'RETURN_EXPENSE_PATCH_MISMATCH';end if;
  execute patched;

  select pg_get_functiondef('bon_erp_private.check_store_write()'::regprocedure) into definition;
  patched:=replace(definition,'perform bon_erp_private.validate_section_changes(s,o);',
    'perform bon_erp_private.validate_section_changes(s,o);perform bon_erp_private.validate_sale_return_costs(s,o);');
  if patched=definition then raise exception 'RETURN_TRIGGER_PATCH_MISMATCH';end if;
  execute patched;
end $patch$;
commit;
