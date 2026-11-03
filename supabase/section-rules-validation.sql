-- Included in the section-business-rules migration. Private functions are not API endpoints.
create or replace function bon_erp_private.consume_item(catalog jsonb, target text, qty numeric, path text[] default array[]::text[])
returns table(item_id text,quantity numeric) language plpgsql set search_path='' as $$
declare i jsonb;l jsonb;r jsonb;
begin
  select x into i from jsonb_array_elements(catalog) x where x->>'id'=target;
  if i is null or qty<=0 or target=any(path) or cardinality(path)>50 then raise exception 'INVALID_CONSUMPTION_RECIPE';end if;
  if i->>'category'='drink_recipe' and cardinality(path)>0 then raise exception 'DRINK_NOT_INGREDIENT';end if;
  if i->>'category' in ('drink_recipe','seasoning_recipe') then
    if not coalesce((i->>'hasRecipe')::boolean,false) or jsonb_array_length(coalesce(i->'recipe','[]'))=0 then raise exception 'EMPTY_RECIPE';end if;
    for l in select value from jsonb_array_elements(i->'recipe') loop
      select x into r from jsonb_array_elements(catalog) x where x->>'id'=l->>'ingredientId';
      return query select * from bon_erp_private.consume_item(catalog,r->>'id',qty*bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unit',r->>'baseUnit'),path||target);
    end loop;
  else return query select target,qty;end if;
end $$;

create or replace function bon_erp_private.validate_section_changes(s jsonb,o jsonb) returns void
language plpgsql set search_path='' as $$
declare d jsonb;p jsonb;r jsonb;i jsonb;l jsonb;raw jsonb;old_raw jsonb;f text;expected numeric;costs numeric;before_qty numeric;previous_cost numeric;incoming numeric;expected_cost numeric;consumed jsonb;day_moves jsonb;reports text[]:=array[]::text[];
begin
  if not(s?'cashier_days') then raise exception 'CLIENT_UPGRADE_REQUIRED';end if;
  if (select count(*) from jsonb_array_elements(s->'cashier_days'))<>(select count(distinct x->>'date') from jsonb_array_elements(s->'cashier_days') x) then raise exception 'DUPLICATE_CASHIER_DAY';end if;
  for p in select value from jsonb_array_elements(o->'cashier_days') loop
    select x into d from jsonb_array_elements(s->'cashier_days') x where x->>'id'=p->>'id';
    if d is null or d->>'date' is distinct from p->>'date' or (p->>'status'='approved' and d is distinct from p) or (p?'financialReport' and d->'financialReport' is distinct from p->'financialReport') or (p?'itemsReport' and d->'itemsReport' is distinct from p->'itemsReport') then raise exception 'CASHIER_REPORT_IMMUTABLE';end if;
  end loop;
  for d in select value from jsonb_array_elements(s->'cashier_days') loop
    if not bon_erp_private.valid_date(d->>'date') or not(d?'financialReport' or d?'itemsReport') then raise exception 'INVALID_CASHIER_DAY';end if;
    if exists(select 1 from jsonb_array_elements(s->'sales_invoices') x where x->>'saleType'='cashier_sync' and x->>'date'=d->>'date') then raise exception 'LEGACY_CASHIER_DAY_EXISTS';end if;
    if d?'itemsReport' then
      for l in select value from jsonb_array_elements(d->'itemsReport'->'lines') loop
        select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId';
        if raw is null or bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unitLabel',raw->>'baseUnit') is null or abs(bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unitLabel',raw->>'baseUnit')-(l->>'normalizedQtyInBaseUnit')::numeric)>0.000001 then raise exception 'CASHIER_QUANTITY_UNIT_MISMATCH';end if;
      end loop;
    end if;
    foreach f in array array['financialReport','itemsReport'] loop
      if d?f then
        if d->f->>'sha256'=any(reports) then raise exception 'DUPLICATE_CASHIER_FILE';end if;
        reports:=array_append(reports,d->f->>'sha256');
      end if;
    end loop;
    if d->>'status'='pending' then
      if d?'totalCost' or d?'consumption' or d?'approvedAt' or d?'shortages' then raise exception 'PENDING_DAY_NOT_POSTED';end if;
      continue;
    end if;
    if not(d?'financialReport' and d?'itemsReport' and d?'totalCost' and d?'consumption' and d?'approvedAt' and d?'partnerName' and d?'shortages') or jsonb_array_length(d->'consumption')=0 then raise exception 'CASHIER_REPORT_PAIR_REQUIRED';end if;
    if exists(select 1 from jsonb_array_elements(o->'cashier_days') x where x->>'id'=d->>'id' and x->>'status'='approved') then continue;end if;
    if exists(
      with expected as (
        select c.item_id,sum(c.quantity) q from jsonb_array_elements(d->'itemsReport'->'lines') l cross join lateral bon_erp_private.consume_item(o->'items',l->>'itemId',(l->>'normalizedQtyInBaseUnit')::numeric) c group by c.item_id
      ), actual as (select l->>'itemId' item_id,sum((l->>'quantity')::numeric) q from jsonb_array_elements(d->'consumption') l group by l->>'itemId')
      select 1 from expected full join actual using(item_id) where expected.q is null or actual.q is null or abs(expected.q-actual.q)>0.000011
    )then raise exception 'CASHIER_CONSUMPTION_MISMATCH';end if;
    if (select count(*) from jsonb_array_elements(d->'consumption'))<>(select count(distinct x->>'itemId') from jsonb_array_elements(d->'consumption') x) then raise exception 'DUPLICATE_CONSUMPTION';end if;
    costs:=0;
    for l in select value from jsonb_array_elements(d->'consumption') loop
      select x into raw from jsonb_array_elements(o->'items') x where x->>'id'=l->>'itemId';
      if raw is null or abs((l->>'unitCost')::numeric-(raw->>'costPrice')::numeric)>0.001 or abs((l->>'totalCost')::numeric-round((l->>'quantity')::numeric*(raw->>'costPrice')::numeric,2))>0.011 then raise exception 'CASHIER_COST_MISMATCH';end if;
      costs:=costs+(l->>'totalCost')::numeric;
    end loop;
    if abs(costs-(d->>'totalCost')::numeric)>0.011 then raise exception 'CASHIER_TOTAL_COST_MISMATCH';end if;
    if exists(
      with expected as (select i->>'id' item_id,-(i->>'stock')::numeric q from jsonb_array_elements(s->'items') i where (i->>'stock')::numeric<0 and exists(select 1 from jsonb_array_elements(d->'consumption') l where l->>'itemId'=i->>'id')),
      actual as (select l->>'itemId' item_id,(l->>'shortage')::numeric q from jsonb_array_elements(d->'shortages') l)
      select 1 from expected full join actual using(item_id) where expected.q is null or actual.q is null or abs(expected.q-actual.q)>0.000011
    ) then raise exception 'CASHIER_SHORTAGE_MISMATCH';end if;
  end loop;
  foreach f in array array['customers','suppliers'] loop
    for r in select value from jsonb_array_elements(s->f) loop
      select x into p from jsonb_array_elements(o->f) x where x->>'id'=r->>'id';
      if p is null or r-array['balance','totalSales','totalPurchases','invoicesCount','lastPurchaseDate'] is distinct from p-array['balance','totalSales','totalPurchases','invoicesCount','lastPurchaseDate'] then
        if btrim(r->>'name')='' or regexp_replace(regexp_replace(translate(r->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[\s()+.\-]','','g'),'^00','')!~'^[0-9]{7,15}$' or (f='customers' and coalesce(btrim(r->>'area'),'')='') or (f='suppliers' and (coalesce(btrim(r->>'address'),'')='' or coalesce(btrim(r->>'representativeName'),'')='')) then raise exception 'CONTACT_DETAILS_REQUIRED';end if;
      end if;
    end loop;
  end loop;
  for i in select value from jsonb_array_elements(s->'items') loop
    select x into p from jsonb_array_elements(o->'items') x where x->>'id'=i->>'id';
    if p is null and (i->>'stock')::numeric<0 then raise exception 'NEGATIVE_OPENING_STOCK';end if;
    if (p is null or p->>'category' is distinct from i->>'category' or p->'recipe' is distinct from i->'recipe') and i->>'category' in ('manufactured_blend','drink_recipe','seasoning_recipe') and (not (i->>'hasRecipe')::boolean or jsonb_array_length(coalesce(i->'recipe','[]'))=0) then raise exception 'RECIPE_REQUIRED_ON_CREATION';end if;
    if i->>'category'='seasoning_recipe' and (i->>'stock')::numeric<>0 then raise exception 'SEASONING_HAS_NO_READY_STOCK';end if;
    if p is not null and exists(select 1 from jsonb_array_elements(o->'cashier_days') d cross join lateral jsonb_array_elements(coalesce(d->'itemsReport'->'lines','[]')) l where l->>'itemId'=i->>'id') and (p->>'category' is distinct from i->>'category' or p->>'baseUnit' is distinct from i->>'baseUnit') then raise exception 'HISTORICAL_ITEM_UNIT_IMMUTABLE';end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'purchase_invoices') loop
    if exists(select 1 from jsonb_array_elements(o->'purchase_invoices') x where x->>'id'=r->>'id') then continue;end if;
    if r->>'accountingVersion' is distinct from '2' or r->>'paymentMethod'<>'نقدي' or (r->>'remainingAmount')::numeric<>0 or abs((r->>'paidAmount')::numeric-(r->>'totalAmount')::numeric)>0.001 or not(r?'netAmount' and r?'taxAmount') then raise exception 'NEW_PURCHASE_FULL_PAYMENT_REQUIRED';end if;
    select x into raw from jsonb_array_elements(s->'suppliers') x where x->>'id'=r->>'supplierId';
    if coalesce(btrim(raw->>'address'),'')='' or coalesce(btrim(raw->>'representativeName'),'')='' or regexp_replace(regexp_replace(translate(raw->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[\s()+.\-]','','g'),'^00','')!~'^[0-9]{7,15}$' then raise exception 'CONTACT_DETAILS_REQUIRED';end if;
    if (select count(*) from jsonb_array_elements(r->'items'))<>(select count(distinct x->>'itemId') from jsonb_array_elements(r->'items') x) then raise exception 'DUPLICATE_PURCHASE_LINE';end if;
    for l in select value from jsonb_array_elements(r->'items') loop
      select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId';
      select x into old_raw from jsonb_array_elements(o->'items') x where x->>'id'=l->>'itemId';
      if old_raw is null then raise exception 'DEFINE_ITEM_BEFORE_PURCHASE';end if;
      before_qty:=greatest(0,(old_raw->>'stock')::numeric);incoming:=(l->>'quantity')::numeric;
      expected_cost:=round((before_qty*(old_raw->>'costPrice')::numeric+incoming*(l->>'purchasePrice')::numeric)/(before_qty+incoming),2);
      if abs((raw->>'costPrice')::numeric-expected_cost)>0.001 or raw->>'costingVersion' is distinct from '2' then raise exception 'PURCHASE_AVERAGE_COST_MISMATCH';end if;
      if not exists(select 1 from jsonb_array_elements(coalesce(raw->'costHistory','[]')) h where h->>'sourceId'=r->>'id' and h->>'date'=r->>'date' and h->>'sourceType'='purchase' and (h->>'quantity')::numeric=incoming and (h->>'unitCost')::numeric=(l->>'purchasePrice')::numeric and (h->>'averageCost')::numeric=expected_cost) then raise exception 'PURCHASE_COST_HISTORY_REQUIRED';end if;
    end loop;
  end loop;
  for r in select value from jsonb_array_elements(s->'sales_invoices') loop
    if exists(select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=r->>'id') then continue;end if;
    if r->>'saleType'<>'wholesale' or not exists(select 1 from jsonb_array_elements(s->'customers') x where x->>'id'=r->>'customerId') then raise exception 'NEW_SALE_WHOLESALE_CUSTOMER_REQUIRED';end if;
    select x into raw from jsonb_array_elements(s->'customers') x where x->>'id'=r->>'customerId';
    if coalesce(btrim(raw->>'area'),'')='' or regexp_replace(regexp_replace(translate(raw->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[\s()+.\-]','','g'),'^00','')!~'^[0-9]{7,15}$' then raise exception 'CONTACT_DETAILS_REQUIRED';end if;
    for l in select value from jsonb_array_elements(r->'items') loop
      select x into raw from jsonb_array_elements(o->'items') x where x->>'id'=l->>'itemId';
      if raw is null or raw->>'category'<>'manufactured_blend' then raise exception 'WHOLESALE_BLENDS_ONLY';end if;
      if abs((l->>'unitCost')::numeric-(raw->>'costPrice')::numeric)>0.001 or abs((l->>'quantity')::numeric-(l->>'normalizedQtyInBaseUnit')::numeric)>0.000001 then raise exception 'WHOLESALE_COST_OR_QUANTITY_MISMATCH';end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(r->'items') l join jsonb_array_elements(o->'items') raw on raw->>'id'=l->>'itemId' where raw->>'category'<>'manufactured_blend') then raise exception 'WHOLESALE_BLENDS_ONLY';end if;
    if exists(select 1 from jsonb_array_elements(r->'items') l join jsonb_array_elements(o->'items') raw on raw->>'id'=l->>'itemId' group by raw->>'id',raw->>'stock' having sum((l->>'normalizedQtyInBaseUnit')::numeric)>(raw->>'stock')::numeric+0.000001) then raise exception 'WHOLESALE_INSUFFICIENT_STOCK';end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'production_batches') loop
    if exists(select 1 from jsonb_array_elements(o->'production_batches') x where x->>'id'=r->>'id') then continue;end if;
    if exists(select 1 from jsonb_array_elements(r->'ingredientsConsumed') l join jsonb_array_elements(o->'items') raw on raw->>'id'=l->>'ingredientId' group by raw->>'id',raw->>'stock' having sum((l->>'quantityUsed')::numeric)>(raw->>'stock')::numeric+0.000001) then raise exception 'PRODUCTION_INSUFFICIENT_STOCK';end if;
    select x into old_raw from jsonb_array_elements(o->'items') x where x->>'id'=r->>'blendId';
    select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=r->>'blendId';
    if old_raw is null then raise exception 'DEFINE_BLEND_BEFORE_PRODUCTION';end if;
    before_qty:=greatest(0,(old_raw->>'stock')::numeric);incoming:=(r->>'quantityProducedKg')::numeric;
    expected_cost:=round((before_qty*(old_raw->>'costPrice')::numeric+incoming*(r->>'unitCostPerKg')::numeric)/(before_qty+incoming),2);
    if raw->>'costingVersion' is distinct from '2' or abs((raw->>'costPrice')::numeric-expected_cost)>0.001 then raise exception 'PRODUCTION_AVERAGE_COST_MISMATCH';end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(raw->'costHistory','[]')) h where h->>'sourceId'=r->>'id' and h->>'date'=r->>'date' and h->>'sourceType'='production' and (h->>'quantity')::numeric=incoming and (h->>'unitCost')::numeric=(r->>'unitCostPerKg')::numeric and (h->>'averageCost')::numeric=expected_cost) then raise exception 'PRODUCTION_COST_HISTORY_REQUIRED';end if;
  end loop;
  if exists(
    with strict_needs as (
      select l->>'itemId' item_id,(l->>'normalizedQtyInBaseUnit')::numeric q from jsonb_array_elements(s->'sales_invoices') r cross join lateral jsonb_array_elements(r->'items') l where not exists(select 1 from jsonb_array_elements(o->'sales_invoices') p where p->>'id'=r->>'id')
      union all select l->>'ingredientId',(l->>'quantityUsed')::numeric from jsonb_array_elements(s->'production_batches') r cross join lateral jsonb_array_elements(r->'ingredientsConsumed') l where not exists(select 1 from jsonb_array_elements(o->'production_batches') p where p->>'id'=r->>'id')
    ) select 1 from strict_needs n left join jsonb_array_elements(o->'items') raw on raw->>'id'=n.item_id group by n.item_id,raw->>'stock' having raw->>'stock' is null or sum(n.q)>(raw->>'stock')::numeric+0.000001
  ) then raise exception 'INSUFFICIENT_STOCK_FOR_WHOLESALE_OR_PRODUCTION';end if;
end $$;
revoke all on function bon_erp_private.consume_item(jsonb,text,numeric,text[]),bon_erp_private.validate_section_changes(jsonb,jsonb) from public,anon,authenticated;
