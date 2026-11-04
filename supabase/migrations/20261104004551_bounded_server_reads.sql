-- Read-only, caller-authorized projections of the canonical transactional store.
-- No partial projection is accepted by the write path.
create or replace function public.bon_erp_dashboard(p_from text,p_to text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.bon_elagouz_store%rowtype; result jsonb;
begin
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from !~ '^\d{4}-\d{2}-\d{2}$' or p_to !~ '^\d{4}-\d{2}-\d{2}$' or p_from>p_to or to_char(p_from::date,'YYYY-MM-DD')<>p_from or to_char(p_to::date,'YYYY-MM-DD')<>p_to then raise exception 'INVALID_REPORT_RANGE';end if;
 select * into strict s from public.bon_elagouz_store where id='main_store';
 with invoices as materialized (
  select v,ord from jsonb_array_elements(s.sales_invoices) with ordinality t(v,ord)
  union all select jsonb_build_object('id',v->>'id','invoiceNumber','DAY-'||(v->>'date'),'date',v->>'date','saleType','cashier_sync','totalAmount',v#>'{financialReport,totalRevenue}','totalCost',v->'totalCost','netProfit',(v#>>'{financialReport,totalRevenue}')::numeric-(v->>'totalCost')::numeric,'items','[]'::jsonb),1000000000+ord from jsonb_array_elements(s.cashier_days) with ordinality t(v,ord) where v->>'status'='approved'
 ), active as materialized (select * from invoices where v->>'date' between p_from and p_to and not coalesce((v->>'isReturned')::boolean,false)),
 expenses as materialized (select v from jsonb_array_elements(s.expenses) v where v->>'date' between p_from and p_to and not coalesce((v->>'isCancelled')::boolean,false) and v->>'category'<>'مسحوبات شركاء'),
 totals as (select coalesce(sum((v->>'totalAmount')::numeric),0) revenue,coalesce(sum((v->>'totalCost')::numeric),0) cost,coalesce(sum((v->>'netProfit')::numeric),0) gross,count(*) count from active),
 spending as (select coalesce(sum((v->>'amount')::numeric),0) spent from expenses),
 daily as materialized (select date,sum(sales) sales,sum(profit) profit from (
  select v->>'date' date,(v->>'totalAmount')::numeric sales,(v->>'netProfit')::numeric profit from active
  union all select v->>'date',0,-(v->>'amount')::numeric from expenses) t group by date),
 bounds as (select min(date) first_date,max(date) last_date from daily),
 resolution as (select case when (case when p_to='9999-12-31' then last_date else p_to end)::date-(case when p_from='0001-01-01' then first_date else p_from end)::date<=62 then 10 when (case when p_to='9999-12-31' then last_date else p_to end)::date-(case when p_from='0001-01-01' then first_date else p_from end)::date>730 then 4 else 7 end length from bounds),
 buckets as (select left(date,(select length from resolution)) date,sum(sales) sales,sum(profit) profit from daily group by 1),
 products as (select line->>'itemId' id,(array_agg(line->>'itemName' order by a.ord,l.ord))[1] name,sum((line->>'totalPrice')::numeric) revenue from active a cross join lateral jsonb_array_elements(a.v->'items') with ordinality l(line,ord) group by 1 order by revenue desc,id limit 5)
 select jsonb_build_object(
 'version',s.version,'report',jsonb_build_object('revenue',t.revenue,'cost',t.cost,'gross',t.gross,'spent',e.spent,'net',t.gross-e.spent,'margin',case when t.revenue<>0 then (t.gross-e.spent)/t.revenue*100 else 0 end,'count',t.count,'entries',coalesce((select jsonb_agg(jsonb_build_object('date',date,'sales',sales,'profit',profit) order by date) from buckets),'[]'::jsonb),'firstDate',b.first_date,'lastDate',b.last_date),
 'balances',jsonb_build_object('inventory',coalesce((select sum((v->>'stock')::numeric*(v->>'costPrice')::numeric) from jsonb_array_elements(s.items) v where v->>'category' not in ('drink_recipe','seasoning_recipe')),0),'debts',coalesce((select sum((v->>'balance')::numeric) from jsonb_array_elements(s.customers) v),0),'shortages',(select count(*) from jsonb_array_elements(s.items) v where v->>'category' not in ('drink_recipe','seasoning_recipe') and (v->>'stock')::numeric<=(v->>'minStock')::numeric)),
 'pending',(select count(*) from jsonb_array_elements(s.cashier_days) v where v->>'status'='pending'),
 'approved',(select count(*) from active where v->>'saleType'='cashier_sync'),
 'queued',(select count(*) from public.cashier_sync_queue where not processed),
 'channels',coalesce((select jsonb_agg(jsonb_build_object('id',kind,'label',label,'value',coalesce((select sum((v->>'totalAmount')::numeric) from active where v->>'saleType'=kind),0))) from (values('wholesale','الجملة'),('cashier_sync','يوم الكاشير'),('retail','بيع المحل السابق')) c(kind,label)),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(p)) from products p),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(v order by ord) from jsonb_array_elements(s.audit_logs) with ordinality t(v,ord) where ord<=4),'[]'::jsonb),
 'counts',jsonb_build_object('products',jsonb_array_length(s.items),'inventory',jsonb_array_length(s.items),'purchase',jsonb_array_length(s.purchase_invoices),'cashier_sync',(select count(*) from public.cashier_sync_queue where not processed)+(select count(*) from jsonb_array_elements(s.cashier_days) v where v->>'status'='pending'),'sales_invoices',jsonb_array_length(s.sales_invoices)+(select count(*) from jsonb_array_elements(s.cashier_days) v where v->>'status'='approved'),'customers',jsonb_array_length(s.customers),'suppliers',jsonb_array_length(s.suppliers),'staff_payroll',jsonb_array_length(s.employees),'shortages',(select count(*) from jsonb_array_elements(s.items) v where v->>'category' not in ('drink_recipe','seasoning_recipe') and (v->>'stock')::numeric<=(v->>'minStock')::numeric))
 ) into result from totals t cross join spending e cross join bounds b;
 return result;
end $$;

create or replace function public.bon_erp_sales_page(p_kind text default null,p_query text default '',p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.bon_elagouz_store%rowtype; kind text:=p_kind; result jsonb;
begin
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>10000000 or p_limit not between 1 and 50 or length(p_query)>150 then raise exception 'INVALID_PAGE';end if;
 select * into strict s from public.bon_elagouz_store where id='main_store';
 if kind is null then kind:=case when jsonb_array_length(s.cashier_days)>0 then 'cashier' when exists(select 1 from jsonb_array_elements(s.sales_invoices) v where v->>'saleType'<>'wholesale') then 'legacy' else 'wholesale' end;end if;
 if kind not in ('wholesale','cashier','legacy') then raise exception 'INVALID_HISTORY_KIND';end if;
 with records as materialized (
  select v,ord from jsonb_array_elements(case when kind='cashier' then s.cashier_days else s.sales_invoices end) with ordinality t(v,ord)
  where (kind='cashier' or (kind='wholesale' and v->>'saleType'='wholesale') or (kind='legacy' and v->>'saleType'<>'wholesale'))
  and (coalesce(p_query,'')='' or position(lower(p_query) in lower(concat_ws(' ',v->>'invoiceNumber',v->>'customerName',v->>'date',(select string_agg(line->>'itemName',' ') from jsonb_array_elements(case when kind='cashier' then '[]'::jsonb else coalesce(v->'items','[]'::jsonb) end) line))))>0)
 ), page as (select v,ord from records order by v->>'date' desc,v->>'id' offset p_offset limit p_limit)
 select jsonb_build_object('kind',kind,'version',s.version,'total',(select count(*) from records),'rows',coalesce((select jsonb_agg(case when kind='cashier' then (v-'itemsReport'-'consumption'-'shortages')||jsonb_build_object('itemsCount',jsonb_array_length(coalesce(v#>'{itemsReport,lines}','[]'::jsonb))) else (v-'items')||jsonb_build_object('itemsCount',jsonb_array_length(v->'items')) end order by v->>'date' desc,v->>'id') from page),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.bon_erp_sale_detail(p_id text,p_kind text default 'invoice')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_id is null or p_kind is null or length(p_id)>160 or p_kind not in ('invoice','cashier') then raise exception 'INVALID_DETAIL';end if;
 select v||(case when p_kind='invoice' then jsonb_build_object('customerPhone',coalesce((select c->>'phone' from jsonb_array_elements(s.customers)c where c->>'id'=v->>'customerId' limit 1),'')) else jsonb_build_object('itemNames',coalesce((select jsonb_object_agg(i->>'id',i->>'name') from jsonb_array_elements(s.items)i where exists(select 1 from jsonb_array_elements(coalesce(v#>'{itemsReport,lines}','[]'::jsonb)||coalesce(v->'consumption','[]'::jsonb))l where l->>'itemId'=i->>'id')),'{}'::jsonb)) end) into result from public.bon_elagouz_store s cross join lateral jsonb_array_elements(case when p_kind='cashier' then s.cashier_days else s.sales_invoices end) v where s.id='main_store' and v->>'id'=p_id;
 return result;
end $$;

create or replace function public.bon_erp_item_search(p_query text,p_limit integer default 5)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_query is null or p_limit is null or length(p_query)>150 or p_limit not between 1 and 20 then raise exception 'INVALID_SEARCH';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','name',v->>'name','code',v->>'code','stock',v->'stock','baseUnit',v->>'baseUnit')),'[]'::jsonb) into result from (select v from public.bon_elagouz_store s cross join lateral jsonb_array_elements(s.items) v where s.id='main_store' and length(trim(p_query))>0 and (position(lower(trim(p_query)) in lower(v->>'name'))>0 or position(lower(trim(p_query)) in lower(v->>'code'))>0) order by v->>'name',v->>'id' limit p_limit) t;
 return result;
end $$;
revoke all on function public.bon_erp_dashboard(text,text),public.bon_erp_sales_page(text,text,integer,integer),public.bon_erp_sale_detail(text,text),public.bon_erp_item_search(text,integer) from public,anon;
grant execute on function public.bon_erp_dashboard(text,text),public.bon_erp_sales_page(text,text,integer,integer),public.bon_erp_sale_detail(text,text),public.bon_erp_item_search(text,integer) to authenticated;
