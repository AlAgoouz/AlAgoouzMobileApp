-- Read-only cash projection. Financial reports are receipts; inventory approval
-- completes cost and never creates a second receipt.
begin;
create or replace function public.bon_erp_cash_summary(p_from text,p_to text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.bon_elagouz_store%rowtype;opening_doc jsonb;r jsonb;i jsonb;m jsonb;
  start_date text;end_date text;day text;target text;direction numeric;allocated numeric;initial_paid numeric;cash_amount numeric;
  brought numeric;inflow numeric:=0;outflow numeric:=0;claims numeric:=0;moves jsonb:='[]';issues text[]:=array[]::text[];
begin
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to or to_char(p_from::date,'YYYY-MM-DD')<>p_from or to_char(p_to::date,'YYYY-MM-DD')<>p_to then raise exception 'INVALID_REPORT_RANGE';end if;
 select * into strict s from public.bon_elagouz_store where id='main_store';
 opening_doc:=s.financial_openings->0;
 end_date:=least(p_to,to_char(current_timestamp at time zone 'Africa/Cairo','YYYY-MM-DD'));
 if opening_doc is null or end_date<opening_doc->>'date' then return null;end if;
 start_date:=greatest(p_from,opening_doc->>'date');if start_date>end_date then return null;end if;
 brought:=(opening_doc->>'amount')::numeric;
 for r in select jsonb_build_object('doc',v,'target','customer','direction',1) from jsonb_array_elements(s.sales_invoices) v
   union all select jsonb_build_object('doc',v,'target','supplier','direction',-1) from jsonb_array_elements(s.purchase_invoices) v loop
   i:=r->'doc';target:=r->>'target';direction:=(r->>'direction')::numeric;
   begin
     select coalesce(sum((a->>'amount')::numeric),0) into allocated from jsonb_array_elements(s.account_payments) p
       cross join lateral jsonb_array_elements(coalesce(p->'allocations','[]')) a
       where not(p?'reversedAt') and p->>'targetType'=target and a->>'invoiceId'=i->>'id';
     initial_paid:=(i->>'paidAmount')::numeric-allocated;
     if initial_paid<0 then raise exception 'INVALID_ALLOCATION';end if;
     if i->>'date' between opening_doc->>'date' and end_date and (i->>'paidAmount')::numeric>0 and exists(
       select 1 from jsonb_array_elements(s.account_payments) p where not(p?'allocations') and p->>'targetType'=target
       and p->>'targetId'=case when target='customer' then i->>'customerId' else i->>'supplierId' end
     ) then issues:=array_append(issues,'دفعة قديمة بلا توزيع واضح على الفواتير');end if;
     moves:=moves||jsonb_build_array(jsonb_build_object('date',i->>'date','amount',initial_paid*direction));
     if coalesce((i->>'isReturned')::boolean,false) then
       if coalesce(i->>'returnedAt','')='' then raise exception 'MISSING_RETURN_DATE';end if;
       day:=to_char((i->>'returnedAt')::timestamptz at time zone 'Africa/Cairo','YYYY-MM-DD');
       if day between opening_doc->>'date' and end_date then
         if not(i?'returnRefundAmount') then issues:=array_append(issues,'مرتجع قديم بلا مبلغ رد مؤكد');
         else moves:=moves||jsonb_build_array(jsonb_build_object('date',day,'amount',-(i->>'returnRefundAmount')::numeric));end if;
       end if;
     end if;
     if coalesce((i->>'isCancelled')::boolean,false) then
       if coalesce(i->>'cancelledAt','')='' then raise exception 'MISSING_CANCEL_DATE';end if;
       day:=to_char((i->>'cancelledAt')::timestamptz at time zone 'Africa/Cairo','YYYY-MM-DD');
       if day<=end_date and i?'refundDue' then claims:=claims+(i->>'refundDue')::numeric;end if;
     end if;
   exception when others then issues:=array_append(issues,'بيانات سداد فاتورة تحتاج مراجعة');end;
 end loop;
 for r in select value from jsonb_array_elements(s.account_payments) loop
   begin
     cash_amount:=(r->>'amount')::numeric*case when r->>'targetType'='customer' then 1 else -1 end;
     moves:=moves||jsonb_build_array(jsonb_build_object('date',r->>'date','amount',cash_amount));
     if r?'reversedAt' then
       if coalesce(r->>'reversedAt','')='' then raise exception 'MISSING_REVERSE_DATE';end if;
       day:=to_char((r->>'reversedAt')::timestamptz at time zone 'Africa/Cairo','YYYY-MM-DD');
       moves:=moves||jsonb_build_array(jsonb_build_object('date',day,'amount',-cash_amount));
     end if;
   exception when others then issues:=array_append(issues,'قيمة دفعة تحتاج مراجعة');end;
 end loop;
 for r in select value from jsonb_array_elements(s.cashier_days) where value?'financialReport' loop
   moves:=moves||jsonb_build_array(jsonb_build_object('date',r->>'date','amount',r#>'{financialReport,totalRevenue}'));
 end loop;
 for r in select value from jsonb_array_elements(s.expenses) where value->>'paidFrom' in ('درج المحل','خزنة الشركة') loop
   begin
     moves:=moves||jsonb_build_array(jsonb_build_object('date',r->>'date','amount',-(r->>'amount')::numeric));
     if coalesce((r->>'isCancelled')::boolean,false) then
       if coalesce(r->>'cancelledAt','')='' then raise exception 'MISSING_CANCEL_DATE';end if;
       day:=to_char((r->>'cancelledAt')::timestamptz at time zone 'Africa/Cairo','YYYY-MM-DD');
       moves:=moves||jsonb_build_array(jsonb_build_object('date',day,'amount',(r->>'amount')::numeric));
     end if;
   exception when others then issues:=array_append(issues,'مصروف يحتاج مراجعة');end;
 end loop;
 for m in select value from jsonb_array_elements(moves) loop
   begin
     day:=m->>'date';cash_amount:=(m->>'amount')::numeric;
     if day is null or day!~'^\d{4}-\d{2}-\d{2}$' or to_char(day::date,'YYYY-MM-DD')<>day or cash_amount is null
       or cash_amount<>round(cash_amount,2) or abs(cash_amount)>90071992547409.91 then raise exception 'INVALID_CASH_MOVEMENT';end if;
     if day<opening_doc->>'date' or day>end_date then continue;end if;
     if day<start_date then brought:=brought+cash_amount;elsif cash_amount>=0 then inflow:=inflow+cash_amount;else outflow:=outflow-cash_amount;end if;
   exception when others then issues:=array_append(issues,'حركة مالية تحتاج مراجعة');end;
 end loop;
 if greatest(abs(brought),inflow,outflow,abs(brought+inflow),abs(brought+inflow-outflow),claims)>90071992547409.91 then issues:=array_append(issues,'تجاوز حد دقة الرصيد');end if;
 return jsonb_build_object('start',start_date,'to',end_date,'opening',case when cardinality(issues)=0 then brought end,
   'inflow',inflow,'outflow',outflow,'resources',case when cardinality(issues)=0 then brought+inflow end,
   'closing',case when cardinality(issues)=0 then brought+inflow-outflow end,'pendingRefunds',claims,
   'issues',(select coalesce(jsonb_agg(distinct v),'[]') from unnest(issues) v));
end $$;
revoke all on function public.bon_erp_cash_summary(text,text) from public,anon;
grant execute on function public.bon_erp_cash_summary(text,text) to authenticated;

-- The complete dashboard definition below is generated from the previous
-- projection with nullable unknown costs, and leaves the write path unchanged.
-- BEGIN FINANCIAL DASHBOARD
create or replace function public.bon_erp_dashboard(p_from text,p_to text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.bon_elagouz_store%rowtype; result jsonb;
begin
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from !~ '^\d{4}-\d{2}-\d{2}$' or p_to !~ '^\d{4}-\d{2}-\d{2}$' or p_from>p_to or to_char(p_from::date,'YYYY-MM-DD')<>p_from or to_char(p_to::date,'YYYY-MM-DD')<>p_to then raise exception 'INVALID_REPORT_RANGE';end if;
 select * into strict s from public.bon_elagouz_store where id='main_store';
 with invoices as materialized (
  select v,ord from jsonb_array_elements(s.sales_invoices) with ordinality t(v,ord)
  union all select jsonb_build_object('id',v->>'id','invoiceNumber','DAY-'||(v->>'date'),'date',v->>'date','saleType','cashier_sync','totalAmount',v#>'{financialReport,totalRevenue}','totalCost',case when v->>'status'='approved' then v->'totalCost' else 'null'::jsonb end,'netProfit',case when v->>'status'='approved' then (v#>>'{financialReport,totalRevenue}')::numeric-(v->>'totalCost')::numeric end,'costPending',v->>'status'<>'approved','items','[]'::jsonb),1000000000+ord from jsonb_array_elements(s.cashier_days) with ordinality t(v,ord) where v?'financialReport'
 ), active as materialized (select * from invoices where v->>'date' between p_from and p_to and not coalesce((v->>'isReturned')::boolean,false)),
 expenses as materialized (select v from jsonb_array_elements(s.expenses) v where v->>'date' between p_from and p_to and not coalesce((v->>'isCancelled')::boolean,false) and v->>'category'<>'مسحوبات شركاء'),
 totals as (select coalesce(sum((v->>'totalAmount')::numeric),0) revenue,case when bool_or(coalesce((v->>'costPending')::boolean,false)) then null else coalesce(sum((v->>'totalCost')::numeric),0) end cost,case when bool_or(coalesce((v->>'costPending')::boolean,false)) then null else coalesce(sum((v->>'netProfit')::numeric),0) end gross,count(*) count,count(*) filter(where coalesce((v->>'costPending')::boolean,false)) pending_cost_days from active),
 spending as (select coalesce(sum((v->>'amount')::numeric),0) spent from expenses),
 daily as materialized (select date,sum(sales) sales,case when bool_or(profit is null) then null else sum(profit) end profit from (
  select v->>'date' date,(v->>'totalAmount')::numeric sales,(v->>'netProfit')::numeric profit from active
  union all select v->>'date',0,-(v->>'amount')::numeric from expenses) t group by date),
 bounds as (select min(date) first_date,max(date) last_date from daily),
 resolution as (select case when (case when p_to='9999-12-31' then last_date else p_to end)::date-(case when p_from='0001-01-01' then first_date else p_from end)::date<=62 then 10 when (case when p_to='9999-12-31' then last_date else p_to end)::date-(case when p_from='0001-01-01' then first_date else p_from end)::date>730 then 4 else 7 end length from bounds),
 buckets as (select left(date,(select length from resolution)) date,sum(sales) sales,case when bool_or(profit is null) then null else sum(profit) end profit from daily group by 1),
 products as (select line->>'itemId' id,(array_agg(line->>'itemName' order by a.ord,l.ord))[1] name,sum((line->>'totalPrice')::numeric) revenue from active a cross join lateral jsonb_array_elements(a.v->'items') with ordinality l(line,ord) group by 1 order by revenue desc,id limit 5)
 select jsonb_build_object(
 'version',s.version,'report',jsonb_build_object('revenue',t.revenue,'cost',t.cost,'gross',t.gross,'spent',e.spent,'net',t.gross-e.spent,'margin',case when t.gross is null then null when t.revenue<>0 then (t.gross-e.spent)/t.revenue*100 else 0 end,'count',t.count,'pendingCostDays',t.pending_cost_days,'entries',coalesce((select jsonb_agg(jsonb_build_object('date',date,'sales',sales,'profit',profit) order by date) from buckets),'[]'::jsonb),'firstDate',b.first_date,'lastDate',b.last_date),
 'cash',public.bon_erp_cash_summary(p_from,p_to),
 'balances',jsonb_build_object('inventory',coalesce((select sum((v->>'stock')::numeric*(v->>'costPrice')::numeric) from jsonb_array_elements(s.items) v where v->>'category' not in ('drink_recipe','seasoning_recipe')),0),'debts',coalesce((select sum((v->>'balance')::numeric) from jsonb_array_elements(s.customers) v),0),'shortages',(select count(*) from jsonb_array_elements(s.items) v where v->>'category' not in ('drink_recipe','seasoning_recipe') and (v->>'stock')::numeric<=(v->>'minStock')::numeric)),
 'pending',(select count(*) from jsonb_array_elements(s.cashier_days) v where v->>'status'='pending'),
 'approved',(select count(*) from active where v->>'saleType'='cashier_sync' and not coalesce((v->>'costPending')::boolean,false)),
 'queued',(select count(*) from public.cashier_sync_queue where not processed),
 'channels',coalesce((select jsonb_agg(jsonb_build_object('id',kind,'label',label,'value',coalesce((select sum((v->>'totalAmount')::numeric) from active where v->>'saleType'=kind),0))) from (values('wholesale','الجملة'),('cashier_sync','يوم الكاشير'),('retail','بيع المحل السابق')) c(kind,label)),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(p)) from products p),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(v order by ord) from jsonb_array_elements(s.audit_logs) with ordinality t(v,ord) where ord<=4),'[]'::jsonb),
 'counts',jsonb_build_object('products',jsonb_array_length(s.items),'inventory',jsonb_array_length(s.items),'purchase',jsonb_array_length(s.purchase_invoices),'cashier_sync',(select count(*) from public.cashier_sync_queue where not processed)+(select count(*) from jsonb_array_elements(s.cashier_days) v where v->>'status'='pending'),'sales_invoices',jsonb_array_length(s.sales_invoices)+(select count(*) from jsonb_array_elements(s.cashier_days) v where v?'financialReport'),'customers',jsonb_array_length(s.customers),'suppliers',jsonb_array_length(s.suppliers),'staff_payroll',jsonb_array_length(s.employees),'shortages',(select count(*) from jsonb_array_elements(s.items) v where v->>'category' not in ('drink_recipe','seasoning_recipe') and (v->>'stock')::numeric<=(v->>'minStock')::numeric))
 ) into result from totals t cross join spending e cross join bounds b;
 return result;
end $$;
commit;
