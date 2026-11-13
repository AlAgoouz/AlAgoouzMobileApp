begin;

-- Derive the revised cost from stored movements. Keep the approved reports and
-- cost snapshot intact so backup, restore, and cashier permissions keep working.
create function bon_erp_private.cashier_cost_projection(days jsonb,purchases jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  event record;
  shortage_item text;
  queues jsonb:='{}';
  queue jsonb;
  outstanding jsonb;
  queue_total numeric;
  debt numeric;
  new_debt numeric;
  to_close numeric;
  available numeric;
  remaining numeric;
  used numeric;
  entry jsonb;
  allocations jsonb:='[]';
  shortages jsonb:='[]';
  projection jsonb;
begin
  if not exists(select 1 from jsonb_array_elements(days) d
    where d->>'status'='approved' and jsonb_array_length(coalesce(d->'shortages','[]'))>0)
  then return '{}';end if;

  for event in
    with tracked as materialized (
      select distinct line->>'itemId' item_id from jsonb_array_elements(days) d
      cross join lateral jsonb_array_elements(coalesce(d->'shortages','[]')) line
      where d->>'status'='approved'
    ), movements as (
      select d->>'approvedAt' recorded_at,1 priority,d->>'id' document_id,d->>'date' business_day,
        line->>'itemId' item_id,line,
        coalesce((s->>'shortage')::numeric,0) stock_debt,
        null::text invoice_number
      from jsonb_array_elements(days) d
      cross join lateral jsonb_array_elements(coalesce(d->'consumption','[]')) line
      join tracked on tracked.item_id=line->>'itemId'
      left join lateral (select a s from jsonb_array_elements(coalesce(d->'shortages','[]')) a where a->>'itemId'=tracked.item_id limit 1) x on true
      where d->>'status'='approved'
      union all
      select p->>'createdAt',0,p->>'id',p->>'date',line->>'itemId',line,
        greatest(0,-(before_item->>'stock')::numeric),p->>'invoiceNumber'
      from jsonb_array_elements(purchases) p
      cross join lateral jsonb_array_elements(coalesce(p->'items','[]')) line
      join tracked on tracked.item_id=line->>'itemId'
      join lateral (select a before_item from jsonb_array_elements(coalesce(p->'inventoryBefore','[]')) a where a->>'id'=tracked.item_id limit 1) x on true
      where not coalesce((p->>'isCancelled')::boolean,false)
    )
    select * from movements
    where pg_input_is_valid(recorded_at,'timestamp with time zone')
    order by recorded_at::timestamptz,priority,document_id collate "C",item_id collate "C"
  loop
    shortage_item:=event.item_id;
    queue:=coalesce(queues->shortage_item,'[]');
    if event.priority=1 then
      new_debt:=round(least(event.stock_debt,(event.line->>'quantity')::numeric),6);
    else new_debt:=0;
    end if;
    debt:=round(event.stock_debt-new_debt,6);
    select coalesce(sum((q->>'remaining')::numeric),0) into queue_total from jsonb_array_elements(queue) q;
    to_close:=greatest(0,queue_total-debt);
    available:=case when event.priority=0 then
      greatest(0,round(least((event.line->>'quantity')::numeric,debt)-greatest(0,debt-queue_total),6))
      else 0 end;
    outstanding:='[]';
    for entry in select value from jsonb_array_elements(queue) loop
      remaining:=(entry->>'remaining')::numeric;
      used:=least(remaining,to_close);
      remaining:=remaining-used;
      to_close:=to_close-used;
      used:=least(remaining,available);
      if used>0 then
        remaining:=remaining-used;
        available:=available-used;
        if event.business_day>=entry->>'businessDay' then
          allocations:=allocations||jsonb_build_array(jsonb_build_object('dayId',entry->>'dayId','itemId',shortage_item,
            'purchaseId',event.document_id,'invoiceNumber',event.invoice_number,'purchaseDate',event.business_day,
            'quantity',used,'unitCost',(event.line->>'purchasePrice')::numeric));
        end if;
      end if;
      if remaining>0 then
        outstanding:=outstanding||jsonb_build_array(entry||jsonb_build_object('remaining',remaining));
      end if;
    end loop;
    if new_debt>0 then
      outstanding:=outstanding||jsonb_build_array(jsonb_build_object('dayId',event.document_id,'businessDay',event.business_day,'remaining',new_debt));
      shortages:=shortages||jsonb_build_array(jsonb_build_object('dayId',event.document_id,'itemId',shortage_item,
        'debt',new_debt,'line',event.line));
    end if;
    queues:=jsonb_set(queues,array[shortage_item],outstanding,true);
  end loop;

  with allocated as (
    select a->>'dayId' day_id,a->>'itemId' item_id,sum((a->>'quantity')::numeric) covered,
      sum((a->>'quantity')::numeric*(a->>'unitCost')::numeric) supplied_cost,
      jsonb_agg(a-'dayId'-'itemId' order by ord) entries
    from jsonb_array_elements(allocations) with ordinality t(a,ord) group by 1,2
  ), lines as (
    select s->>'dayId' day_id,s->>'itemId' item_id,(s#>>'{line,totalCost}')::numeric original_cost,
      coalesce(a.covered,0) covered,(s->>'debt')::numeric-coalesce(a.covered,0) uncovered,coalesce(a.entries,'[]') entries,
      case when a.covered is null then (s#>>'{line,totalCost}')::numeric
           else round(((s#>>'{line,quantity}')::numeric-a.covered)*(s#>>'{line,unitCost}')::numeric+a.supplied_cost,2)
      end corrected
    from jsonb_array_elements(shortages) s left join allocated a on a.day_id=s->>'dayId' and a.item_id=s->>'itemId'
  ), details as (
    select day_id,sum(corrected-original_cost) delta,
      jsonb_agg(jsonb_build_object('itemId',item_id,'covered',covered,'uncovered',uncovered,
        'totalCost',corrected,'allocations',entries) order by item_id) corrections
    from lines group by day_id
  )
  select coalesce(jsonb_object_agg(day_id,jsonb_build_object(
    'correctedTotalCost',(d->>'totalCost')::numeric+delta,'costCorrections',corrections)),'{}')
    into projection from details join jsonb_array_elements(days) d on d->>'id'=day_id;
  return projection;
end $$;
revoke all on function bon_erp_private.cashier_cost_projection(jsonb,jsonb) from public,anon,authenticated;
grant execute on function bon_erp_private.cashier_cost_projection(jsonb,jsonb) to authenticated;

create function bon_erp_private.check_cashier_cost_purchase_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(current_setting('bon_erp.restore_user',true),'')=auth.uid()::text then return new;end if;
  if exists(
    select 1 from jsonb_array_elements(new.purchase_invoices) p
    cross join lateral jsonb_array_elements(p->'items') line
    join jsonb_array_elements(old.items) item on item->>'id'=line->>'itemId'
    where not exists(select 1 from jsonb_array_elements(old.purchase_invoices) q where q->>'id'=p->>'id')
      and ((item->>'stock')::numeric<0 or exists(
        select 1 from jsonb_array_elements(old.cashier_days) day
        cross join lateral jsonb_array_elements(coalesce(day->'shortages','[]')) shortage
        where day->>'status'='approved' and shortage->>'itemId'=item->>'id'))
      and (
        not coalesce(pg_input_is_valid(p->>'createdAt','timestamp with time zone'),false)
        or (p->>'createdAt')::timestamptz>clock_timestamp()+interval '5 minutes'
        or (p->>'createdAt')::timestamptz<clock_timestamp()-interval '7 days'
        or (select count(*) from jsonb_array_elements(coalesce(p->'inventoryBefore','[]')) snapshot
            where snapshot->>'id'=item->>'id')<>1
        or not exists(select 1 from jsonb_array_elements(coalesce(p->'inventoryBefore','[]')) snapshot
          where snapshot->>'id'=item->>'id' and snapshot->'stock'=item->'stock')
      )
  ) then raise exception 'CASHIER_COST_PURCHASE_EVIDENCE_REQUIRED';end if;
  return new;
end $$;
revoke all on function bon_erp_private.check_cashier_cost_purchase_snapshot() from public,anon,authenticated;
create trigger check_cashier_cost_purchase_snapshot before update of purchase_invoices on public.bon_elagouz_store
for each row when(old.purchase_invoices is distinct from new.purchase_invoices)
execute function bon_erp_private.check_cashier_cost_purchase_snapshot();

-- Use the same allocation in the dashboard, bounded sale history, and file export.
do $$
declare definition text; updated text; procedure_signature text;
begin
  foreach procedure_signature in array array['public.bon_erp_dashboard(text,text)','public.bon_erp_dashboard_v2(text,text)'] loop
    definition:=pg_get_functiondef(procedure_signature::regprocedure);
    updated:=replace(definition,'with invoices as materialized (',
      'with costs as materialized (select bon_erp_private.cashier_cost_projection(s.cashier_days,s.purchase_invoices) data), invoices as materialized (');
    updated:=replace(updated,'then v->''totalCost'' else','then coalesce((select data->(v->>''id'')->''correctedTotalCost'' from costs),v->''totalCost'') else');
    updated:=replace(updated,'''totalCost'',v->''totalCost'',''netProfit''','''totalCost'',coalesce((select data->(v->>''id'')->''correctedTotalCost'' from costs),v->''totalCost''),''netProfit''');
    updated:=replace(updated,'::numeric-(v->>''totalCost'')::numeric','::numeric-coalesce((select (data->(v->>''id'')->>''correctedTotalCost'')::numeric from costs),(v->>''totalCost'')::numeric)');
    if updated=definition or position('with costs as materialized' in updated)=0 then raise exception 'CASHIER_DASHBOARD_PROJECTION_MISSING';end if;
    execute updated;
  end loop;

  definition:=pg_get_functiondef('public.bon_erp_sale_detail(text,text)'::regprocedure);
  updated:=replace(definition,'else jsonb_build_object(''itemNames''',
    'else coalesce(bon_erp_private.cashier_cost_projection(s.cashier_days,s.purchase_invoices)->(v->>''id''),''{}''::jsonb)||jsonb_build_object(''itemNames''');
  if updated=definition then raise exception 'CASHIER_DETAIL_PROJECTION_MISSING';end if;
  execute updated;

  definition:=pg_get_functiondef('public.bon_erp_sales_page(text,text,integer,integer)'::regprocedure);
  updated:=replace(definition,'with records as materialized (',
    'with costs as materialized (select case when kind=''cashier'' then bon_erp_private.cashier_cost_projection(s.cashier_days,s.purchase_invoices) else ''{}''::jsonb end data), records as materialized (');
  updated:=replace(updated,'(v-''itemsReport''-''consumption''-''shortages'')||',
    '(v-''itemsReport''-''consumption''-''shortages'')||coalesce((select (data->(v->>''id''))-''costCorrections'' from costs),''{}''::jsonb)||');
  if updated=definition or position('with costs as materialized' in updated)=0 then raise exception 'CASHIER_HISTORY_PROJECTION_MISSING';end if;
  execute updated;

  definition:=pg_get_functiondef('public.bon_erp_export_report_v2(text,text)'::regprocedure);
  updated:=replace(definition,'select jsonb_agg(v order by v->>''date'',v->>''id'')',
    'select jsonb_agg(case when field=''cashier_days'' then v||coalesce(costs->(v->>''id''),''{}''::jsonb) else v end order by v->>''date'',v->>''id'')');
  updated:=replace(updated,'summary jsonb;field text;', 'summary jsonb;field text;costs jsonb;');
  updated:=replace(updated,' result:=jsonb_build_object', ' costs:=bon_erp_private.cashier_cost_projection(s.cashier_days,s.purchase_invoices); result:=jsonb_build_object');
  if updated=definition or position('costs jsonb;' in updated)=0 then raise exception 'CASHIER_EXPORT_PROJECTION_MISSING';end if;
  execute updated;
end $$;
commit;
