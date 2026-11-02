begin;
create or replace function bon_erp_private.assert_owner() returns void
language plpgsql set search_path='' as $$
begin
  if auth.uid() is null or not exists(
    select 1 from auth.users u join bon_erp_private.owner_config c on c.id and lower(c.email)=lower(u.email)
    where u.id=auth.uid() and u.email_confirmed_at is not null
  ) then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
end $$;

create or replace function bon_erp_private.inventory_changes(s jsonb,o jsonb)
returns table(item_id text,quantity numeric) language sql set search_path='' as $$
with new_sales as (
  select n from jsonb_array_elements(s->'sales_invoices') n where not exists(select 1 from jsonb_array_elements(o->'sales_invoices') p where p->>'id'=n->>'id')
), returned_sales as (
  select n from jsonb_array_elements(s->'sales_invoices') n where coalesce((n->>'isReturned')::boolean,false)
  and not exists(select 1 from jsonb_array_elements(o->'sales_invoices') p where p->>'id'=n->>'id' and coalesce((p->>'isReturned')::boolean,false))
), new_batches as (
  select n from jsonb_array_elements(s->'production_batches') n where not exists(select 1 from jsonb_array_elements(o->'production_batches') p where p->>'id'=n->>'id')
), new_counts as (
  select n from jsonb_array_elements(s->'stocktaking_records') n where not exists(select 1 from jsonb_array_elements(o->'stocktaking_records') p where p->>'id'=n->>'id')
), purchases as (
  select x,1 factor from jsonb_array_elements(s->'purchase_invoices') x
  union all select x,-1 from jsonb_array_elements(o->'purchase_invoices') x
), moves as (
  select l->>'itemId' id,sum((l->>'quantity')::numeric*factor) qty from purchases cross join lateral jsonb_array_elements(x->'items') l where not coalesce((x->>'isCancelled')::boolean,false) group by l->>'itemId'
  union all select l->>'itemId',-(l->>'normalizedQtyInBaseUnit')::numeric from new_sales cross join lateral jsonb_array_elements(n->'items') l where l->>'category'<>'drink_recipe'
  union all select l->>'itemId',(l->>'normalizedQtyInBaseUnit')::numeric from returned_sales cross join lateral jsonb_array_elements(n->'items') l where l->>'category'<>'drink_recipe'
  union all select recipe_item->>'ingredientId',-bon_erp_private.base_quantity((recipe_item->>'quantity')::numeric,recipe_item->>'unit',ingredient_item->>'baseUnit')*(l->>'normalizedQtyInBaseUnit')::numeric
    from new_sales cross join lateral jsonb_array_elements(n->'items') l
    join jsonb_array_elements(s->'items') drinks(drink_item) on drink_item->>'id'=l->>'itemId'
    cross join lateral jsonb_array_elements(coalesce(drink_item->'recipe','[]')) recipes(recipe_item)
    join jsonb_array_elements(s->'items') ingredients(ingredient_item) on ingredient_item->>'id'=recipe_item->>'ingredientId'
    where l->>'category'='drink_recipe'
  union all select n->>'blendId',(n->>'quantityProducedKg')::numeric from new_batches
  union all select l->>'ingredientId',-(l->>'quantityUsed')::numeric from new_batches cross join lateral jsonb_array_elements(n->'ingredientsConsumed') l
  union all select l->>'itemId',(l->>'difference')::numeric from new_counts cross join lateral jsonb_array_elements(n->'itemsAudited') l
)
select id,sum(qty) from moves group by id
$$;

create or replace function bon_erp_private.validate_changes(s jsonb,o jsonb) returns void
language plpgsql set search_path='' as $$
declare f text; p jsonb; n jsonb; e jsonb; old_e jsonb; t jsonb; c jsonb; fields text[];
  delta numeric; expected numeric; allocated numeric; old_allocated numeric; additions numeric; new_payments numeric;movement_totals jsonb;
  amount numeric; base_open numeric; earned numeric; salary numeric; advances numeric; deductions numeric; bonuses numeric; days numeric; paid numeric;
  period text:=to_char(now() at time zone 'Africa/Cairo','YYYY-MM'); close_period text; next_period text;
begin
  foreach f in array array['sales_invoices','purchase_invoices','production_batches','expenses','stocktaking_records','account_payments','employee_transactions'] loop
    fields:=case f
      when 'sales_invoices' then array['paidAmount','remainingAmount','isReturned','returnedAt','returnedBy','returnDebtReversed','returnRefundAmount']
      when 'purchase_invoices' then array['paidAmount','remainingAmount','isCancelled','cancelledAt','cancelledBy','refundDue']
      when 'expenses' then array['isCancelled','cancelledAt','cancelledBy']
      when 'account_payments' then array['reversedAt','reversedBy']
      when 'employee_transactions' then array['reversedAt','reversedBy'] else array[]::text[] end;
    for p in select value from jsonb_array_elements(o->f) loop
      select x into n from jsonb_array_elements(s->f) x where x->>'id'=p->>'id';
      if n is null or (p-fields) is distinct from (n-fields) then raise exception 'IMMUTABLE_DOCUMENT: %',f; end if;
      if f='employee_transactions' and p->>'accountingVersion' is distinct from '1' and n is distinct from p then raise exception 'LEGACY_PAYROLL_READONLY';end if;
      if (coalesce((p->>'isReturned')::boolean,false) or coalesce((p->>'isCancelled')::boolean,false) or p?'reversedAt') and n is distinct from p then raise exception 'CLOSED_DOCUMENT_IMMUTABLE'; end if;
      if f='expenses' and p?'sourceInvoiceId' and p->>'paidFrom'='تسوية مخزون (بدون نقدية)' and n is distinct from p then raise exception 'RETURN_COST_IMMUTABLE'; end if;
    end loop;
  end loop;
  for p in select value from jsonb_array_elements(o->'items') loop
    select x into n from jsonb_array_elements(s->'items') x where x->>'id'=p->>'id';
    if n is null then continue; end if;
    if p->'openingStock' is distinct from n->'openingStock' then raise exception 'OPENING_STOCK_IMMUTABLE'; end if;
    if (p->>'category' is distinct from n->>'category' or p->>'baseUnit' is distinct from n->>'baseUnit') and (
      exists(select 1 from jsonb_array_elements(o->'sales_invoices') a cross join lateral jsonb_array_elements(a->'items') l where l->>'itemId'=p->>'id')
      or exists(select 1 from jsonb_array_elements(o->'purchase_invoices') a cross join lateral jsonb_array_elements(a->'items') l where l->>'itemId'=p->>'id')
      or exists(select 1 from jsonb_array_elements(o->'stocktaking_records') a cross join lateral jsonb_array_elements(a->'itemsAudited') l where l->>'itemId'=p->>'id')
      or exists(select 1 from jsonb_array_elements(o->'production_batches') a where a->>'blendId'=p->>'id' or exists(select 1 from jsonb_array_elements(a->'ingredientsConsumed') l where l->>'ingredientId'=p->>'id'))
    ) then raise exception 'HISTORICAL_ITEM_UNIT_IMMUTABLE'; end if;
    if p->>'category'<>'drink_recipe' and (p->>'stock')::numeric>0 and (p->>'baseUnit' is distinct from n->>'baseUnit' or n->>'category'='drink_recipe') then raise exception 'STOCK_UNIT_CHANGE_REQUIRES_ZERO'; end if;
  end loop;
  select coalesce(jsonb_object_agg(item_id,quantity),'{}'::jsonb) into movement_totals from bon_erp_private.inventory_changes(s,o);
  for n in select value from jsonb_array_elements(s->'items') loop
    if n->>'category'='drink_recipe' then continue; end if;
    select x into p from jsonb_array_elements(o->'items') x where x->>'id'=n->>'id';
    delta:=coalesce((movement_totals->>(n->>'id'))::numeric,0);
    expected:=case when p is null then coalesce((n->>'openingStock')::numeric,(n->>'stock')::numeric) when p->>'category'='drink_recipe' then 0 else (p->>'stock')::numeric end;
    if abs((n->>'stock')::numeric-expected-delta)>0.000011 then raise exception 'INVENTORY_MOVEMENT_MISMATCH'; end if;
  end loop;
  for n in select value from jsonb_array_elements(s->'sales_invoices') loop
    if not exists(select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=n->>'id') then
      for t in select value from jsonb_array_elements(n->'items') loop
        select x into e from jsonb_array_elements(s->'items') x where x->>'id'=t->>'itemId';
        if e->>'category' is distinct from t->>'category' or (t->>'category'='drink_recipe' and (not coalesce((e->>'hasRecipe')::boolean,false) or jsonb_array_length(coalesce(e->'recipe','[]'))=0)) then raise exception 'INVALID_SALE_RECIPE'; end if;
      end loop;
    end if;
    if coalesce((n->>'isReturned')::boolean,false) and not exists(select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=n->>'id' and coalesce((x->>'isReturned')::boolean,false)) then
      if not(n?'returnDebtReversed' and n?'returnRefundAmount') or (n->>'returnDebtReversed')::numeric>(n->>'remainingAmount')::numeric+0.011 or abs((n->>'returnDebtReversed')::numeric+(n->>'returnRefundAmount')::numeric-(n->>'totalAmount')::numeric)>0.011 then raise exception 'RETURN_FINANCIAL_MISMATCH'; end if;
      select coalesce(sum((l->>'totalCost')::numeric),0) into amount from jsonb_array_elements(n->'items') l where l->>'category'='drink_recipe';
      if amount>0 and not exists(select 1 from jsonb_array_elements(s->'expenses') x where x->>'sourceInvoiceId'=n->>'id' and x->>'paidFrom'='تسوية مخزون (بدون نقدية)' and not coalesce((x->>'isCancelled')::boolean,false) and abs((x->>'amount')::numeric-amount)<0.011) then raise exception 'RETURN_CONSUMPTION_COST_REQUIRED'; end if;
    end if;
  end loop;
  for n in select value from jsonb_array_elements(s->'account_payments') loop
    if not exists(select 1 from jsonb_array_elements(o->'account_payments') x where x->>'id'=n->>'id') and not(n?'allocations' and n?'openingBalanceAmount') then raise exception 'PAYMENT_ALLOCATION_REQUIRED'; end if;
  end loop;
  foreach f in array array['sales_invoices','purchase_invoices'] loop
    for n in select value from jsonb_array_elements(s->f) loop
      select x into p from jsonb_array_elements(o->f) x where x->>'id'=n->>'id';
      select coalesce(sum((l->>'amount')::numeric),0) into allocated from jsonb_array_elements(s->'account_payments') a cross join lateral jsonb_array_elements(coalesce(a->'allocations','[]')) l where not(a?'reversedAt') and l->>'invoiceId'=n->>'id';
      select coalesce(sum((l->>'amount')::numeric),0) into old_allocated from jsonb_array_elements(o->'account_payments') a cross join lateral jsonb_array_elements(coalesce(a->'allocations','[]')) l where not(a?'reversedAt') and l->>'invoiceId'=n->>'id';
      if p is null then
        if allocated>(n->>'paidAmount')::numeric+0.011 then raise exception 'PAYMENT_EXCEEDS_INVOICE'; end if;
      elsif abs((n->>'paidAmount')::numeric-(p->>'paidAmount')::numeric-allocated+old_allocated)>0.011 then raise exception 'INVOICE_PAYMENT_HISTORY_MISMATCH'; end if;
    end loop;
  end loop;
  foreach f in array array['customers','suppliers'] loop
    for p in select value from jsonb_array_elements(o->f) loop
      select x into n from jsonb_array_elements(s->f) x where x->>'id'=p->>'id';
      if n is null then
        if (p->>'balance')::numeric>0 then raise exception 'ACCOUNT_WITH_DEBT_NOT_DELETABLE'; end if;
        continue;
      end if;
      delta:=0; additions:=0; new_payments:=0;
      for e in select value from jsonb_array_elements(s->case when f='customers' then 'sales_invoices' else 'purchase_invoices' end) loop
        if coalesce(e->>'customerId',e->>'supplierId')<>p->>'id' then continue; end if;
        select x into old_e from jsonb_array_elements(o->case when f='customers' then 'sales_invoices' else 'purchase_invoices' end) x where x->>'id'=e->>'id';
        if old_e is null then
          delta:=delta+(e->>'remainingAmount')::numeric;
          additions:=additions+(e->>'remainingAmount')::numeric;
          select coalesce(sum((l->>'amount')::numeric),0) into allocated from jsonb_array_elements(s->'account_payments') a cross join lateral jsonb_array_elements(coalesce(a->'allocations','[]')) l where not(a?'reversedAt') and l->>'invoiceId'=e->>'id';
          additions:=additions+allocated;
        else delta:=delta+(e->>'remainingAmount')::numeric-(old_e->>'remainingAmount')::numeric; end if;
        if coalesce((e->>'isReturned')::boolean,false) and not coalesce((old_e->>'isReturned')::boolean,false) then delta:=delta-(e->>'returnDebtReversed')::numeric; end if;
        if coalesce((e->>'isCancelled')::boolean,false) and not coalesce((old_e->>'isCancelled')::boolean,false) then delta:=delta-(e->>'remainingAmount')::numeric; end if;
      end loop;
      for e in select value from jsonb_array_elements(s->'account_payments') loop
        if e->>'targetId'<>p->>'id' or e->>'targetType'<>(case when f='customers' then 'customer' else 'supplier' end) then continue; end if;
        select x into old_e from jsonb_array_elements(o->'account_payments') x where x->>'id'=e->>'id';
        if old_e is null and not(e?'reversedAt') then
          new_payments:=new_payments+(e->>'amount')::numeric;
          delta:=delta-coalesce((e->>'openingBalanceAmount')::numeric,0);
        elsif old_e is not null and not(old_e?'reversedAt') and e?'reversedAt' then
          additions:=additions+(e->>'amount')::numeric;
          delta:=delta+coalesce((e->>'openingBalanceAmount')::numeric,0);
        end if;
      end loop;
      if new_payments>(p->>'balance')::numeric+additions+0.000001 then raise exception 'PAYMENT_EXCEEDS_DEBT'; end if;
      if abs((n->>'balance')::numeric-greatest(0,(p->>'balance')::numeric+delta))>0.011 then raise exception 'ACCOUNT_BALANCE_HISTORY_MISMATCH'; end if;
    end loop;
  end loop;
  for n in select value from jsonb_array_elements(s->'employee_transactions') loop
    if exists(select 1 from jsonb_array_elements(o->'employee_transactions') x where x->>'id'=n->>'id') then continue; end if;
    if n->>'accountingVersion' is distinct from '1' or n->>'payrollPeriod' is null or n->>'partnerId' is null then raise exception 'PAYROLL_ACCOUNTING_REQUIRED'; end if;
    if n->>'type'<>'إقفال شهر' and n->>'payrollPeriod'<>period then raise exception 'PAYROLL_PERIOD_CLOSED'; end if;
    if n->>'type'<>'حضور يومية' and n->>'type'<>'إقفال شهر' and (n->>'amount')::numeric<=0 then raise exception 'INVALID_PAYROLL_AMOUNT'; end if;
    if n->>'type'='إقفال شهر' and (n->>'amount')::numeric<>0 then raise exception 'INVALID_PAYROLL_CLOSING_AMOUNT';end if;
    select x into e from jsonb_array_elements(s->'employees') x where x->>'id'=n->>'employeeId';
    if n->>'type'='حضور يومية' and (e->>'salaryType'<>'يومية' or (n->>'amount')::numeric<>(e->>'dailyRate')::numeric) then raise exception 'PAYROLL_ATTENDANCE_RATE_MISMATCH'; end if;
  end loop;
  for e in select value from jsonb_array_elements(s->'employees') loop
    select x into old_e from jsonb_array_elements(o->'employees') x where x->>'id'=e->>'id';
    select x into c from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'type'='إقفال شهر' and not exists(select 1 from jsonb_array_elements(o->'employee_transactions') y where y->>'id'=x->>'id');
    base_open:=coalesce((old_e->>'openingPayable')::numeric,0);days:=coalesce((old_e->>'workedDaysThisMonth')::numeric,0);advances:=coalesce((old_e->>'totalAdvances')::numeric,0);deductions:=coalesce((old_e->>'totalDeductions')::numeric,0);bonuses:=coalesce((old_e->>'totalBonuses')::numeric,0);paid:=coalesce((old_e->>'totalPaidOut')::numeric,0);
    next_period:=coalesce(old_e->>'payrollPeriod',period);
    if c is not null then
      close_period:=c->>'payrollPeriod';
      if old_e is null or close_period is distinct from next_period or close_period>=period then raise exception 'INVALID_PAYROLL_CLOSING_PERIOD'; end if;
      if (select count(*) from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'type'='إقفال شهر' and not exists(select 1 from jsonb_array_elements(o->'employee_transactions') y where y->>'id'=x->>'id'))<>1 then raise exception 'SAVE_PAYROLL_CLOSING_FIRST'; end if;
      earned:=case when old_e->>'salaryType'='يومية' then days*(old_e->>'dailyRate')::numeric else (old_e->>'baseMonthlySalary')::numeric end;
      t:=c->'closingSummary';
      if abs((t->>'openingPayable')::numeric-base_open)>0.011 or abs((t->>'earned')::numeric-earned)>0.011 or abs((t->>'advances')::numeric-advances)>0.011 or abs((t->>'deductions')::numeric-deductions)>0.011 or abs((t->>'bonuses')::numeric-bonuses)>0.011 or abs((t->>'paidOut')::numeric-paid)>0.011 then raise exception 'PAYROLL_CLOSING_HISTORY_MISMATCH'; end if;
      base_open:=base_open+earned+bonuses-advances-deductions-paid;
      days:=0;advances:=0;deductions:=0;bonuses:=0;paid:=0;
      next_period:=to_char((close_period||'-01')::date+interval '1 month','YYYY-MM');
    end if;
    if coalesce(e->>'payrollPeriod',period) is distinct from next_period or abs(coalesce((e->>'openingPayable')::numeric,0)-base_open)>0.011 then raise exception 'PAYROLL_CARRY_HISTORY_MISMATCH'; end if;
    for t in select jsonb_set(x,'{__delta}','1') from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'payrollPeriod'=next_period and x->>'accountingVersion'='1' and x->>'type'<>'إقفال شهر' and not(x?'reversedAt')
      union all select jsonb_set(x,'{__delta}','-1') from jsonb_array_elements(o->'employee_transactions') x where c is null and x->>'employeeId'=e->>'id' and x->>'payrollPeriod'=next_period and x->>'accountingVersion'='1' and x->>'type'<>'إقفال شهر' and not(x?'reversedAt') loop
      amount:=(t->>'amount')::numeric*(t->>'__delta')::numeric;
      case t->>'type' when 'حضور يومية' then days:=days+(t->>'__delta')::numeric;
      when 'سلفة' then advances:=advances+amount;when 'خصم/عجز' then deductions:=deductions+amount;when 'مكافأة' then bonuses:=bonuses+amount;when 'صرف راتب' then paid:=paid+amount;else null;end case;
    end loop;
    if abs(days-(e->>'workedDaysThisMonth')::numeric)>0.000001 or abs(advances-(e->>'totalAdvances')::numeric)>0.011 or abs(deductions-(e->>'totalDeductions')::numeric)>0.011 or abs(bonuses-(e->>'totalBonuses')::numeric)>0.011 or abs(paid-(e->>'totalPaidOut')::numeric)>0.011 then raise exception 'PAYROLL_COUNTER_HISTORY_MISMATCH'; end if;
    select coalesce(sum((x->>'amount')::numeric),0) into salary from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'type'='صرف راتب' and not(x?'reversedAt') and not exists(select 1 from jsonb_array_elements(o->'employee_transactions') y where y->>'id'=x->>'id');
    earned:=case when e->>'salaryType'='يومية' then days*(e->>'dailyRate')::numeric else (e->>'baseMonthlySalary')::numeric end;
    if salary>0 and base_open+earned+bonuses-advances-deductions-paid< -0.000001 then raise exception 'PAYROLL_PAYMENT_EXCEEDS_DUE'; end if;
  end loop;
end $$;

create or replace function bon_erp_private.validate_financial_details(s jsonb,o jsonb) returns void
language plpgsql set search_path='' as $$
declare n jsonb;p jsonb;i jsonb;r jsonb;old_r jsonb;l jsonb;amount numeric;delta numeric;
begin
  for n in select value from jsonb_array_elements(s->'production_batches') loop
    if exists(select 1 from jsonb_array_elements(o->'production_batches') x where x->>'id'=n->>'id') then continue;end if;
    select x into i from jsonb_array_elements(s->'items') x where x->>'id'=n->>'blendId';
    if not coalesce((i->>'hasRecipe')::boolean,false) or jsonb_array_length(coalesce(i->'recipe','[]'))=0 then raise exception 'PRODUCTION_RECIPE_REQUIRED';end if;
    if exists(
      with expected as (
        select line->>'ingredientId' id,sum(bon_erp_private.base_quantity((line->>'quantity')::numeric,line->>'unit',raw->>'baseUnit')*(n->>'quantityProducedKg')::numeric) q
        from jsonb_array_elements(i->'recipe') line join jsonb_array_elements(s->'items') raw on raw->>'id'=line->>'ingredientId' group by line->>'ingredientId'
      ), actual as (
        select line->>'ingredientId' id,sum((line->>'quantityUsed')::numeric) q from jsonb_array_elements(n->'ingredientsConsumed') line group by line->>'ingredientId'
      ) select 1 from expected full join actual using(id) where expected.q is null or actual.q is null or abs(expected.q-actual.q)>0.000011
    )then raise exception 'PRODUCTION_CONSUMPTION_MISMATCH';end if;
    for l in select value from jsonb_array_elements(n->'ingredientsConsumed') loop
      select x into r from jsonb_array_elements(s->'items') x where x->>'id'=l->>'ingredientId';
      select x into old_r from jsonb_array_elements(o->'items') x where x->>'id'=l->>'ingredientId';
      if abs((l->>'cost')::numeric-round((l->>'quantityUsed')::numeric*(r->>'costPrice')::numeric,2))>0.011
        and (old_r is null or abs((l->>'cost')::numeric-round((l->>'quantityUsed')::numeric*(old_r->>'costPrice')::numeric,2))>0.011) then raise exception 'PRODUCTION_INGREDIENT_COST_MISMATCH';end if;
    end loop;
  end loop;
  for n in select value from jsonb_array_elements(s->'purchase_invoices') loop
    if not coalesce((n->>'isCancelled')::boolean,false) or exists(select 1 from jsonb_array_elements(o->'purchase_invoices') x where x->>'id'=n->>'id' and coalesce((x->>'isCancelled')::boolean,false)) then continue;end if;
    if not(n?'inventoryBefore' and n?'inventoryAfter' and n?'refundDue') or jsonb_array_length(n->'inventoryAfter')=0 or abs((n->>'refundDue')::numeric-(n->>'paidAmount')::numeric)>0.011 then raise exception 'PURCHASE_CANCELLATION_EVIDENCE_REQUIRED';end if;
    if exists(select 1 from jsonb_array_elements(o->'purchase_invoices') x where x->>'id'=n->>'id') then
      for i in select value from jsonb_array_elements(n->'inventoryAfter') loop
        select x into r from jsonb_array_elements(o->'items') x where x->>'id'=i->>'id';
        if r is distinct from i then raise exception 'PURCHASE_HAS_LATER_MOVEMENTS';end if;
      end loop;
    end if;
  end loop;
  for n in select value from jsonb_array_elements(s->'expenses') loop
    if exists(select 1 from jsonb_array_elements(o->'expenses') x where x->>'id'=n->>'id') then continue;end if;
    if n->>'category'='مسحوبات شركاء' and n->>'paidFrom'='من جيب الشريك' then raise exception 'WITHDRAWAL_SOURCE_INVALID';end if;
    if n->>'paidFrom'='تسوية مخزون (بدون نقدية)' then
      select x into i from jsonb_array_elements(s->'sales_invoices') x where x->>'id'=n->>'sourceInvoiceId' and coalesce((x->>'isReturned')::boolean,false);
      if i is null or n->>'category'<>'نثريات أخرى' or coalesce((n->>'isCancelled')::boolean,false) then raise exception 'INVALID_NONCASH_RETURN_EXPENSE';end if;
      select coalesce(sum((line->>'totalCost')::numeric),0) into amount from jsonb_array_elements(i->'items') line where line->>'category'='drink_recipe';
      if abs(amount-(n->>'amount')::numeric)>0.011 or (select count(*) from jsonb_array_elements(s->'expenses') x where x->>'sourceInvoiceId'=i->>'id' and not coalesce((x->>'isCancelled')::boolean,false))<>1 then raise exception 'RETURN_EXPENSE_DUPLICATE_OR_AMOUNT';end if;
    elsif n->>'partnerId' is null then raise exception 'EXPENSE_PARTNER_REQUIRED';end if;
  end loop;
  for p in select value from jsonb_array_elements(o->'partners') loop
    select x into n from jsonb_array_elements(s->'partners') x where x->>'id'=p->>'id';
    if n is null then continue;end if;
    select coalesce(sum((x->>'amount')::numeric*sign),0) into delta from (
      select x,1 sign from jsonb_array_elements(s->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
      union all select x,-1 from jsonb_array_elements(o->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
    ) expenses where (x->>'partnerId'=p->>'id' or not(x?'partnerId') and x->>'partnerName'=p->>'name') and x->>'paidFrom'='من جيب الشريك';
    if abs((n->>'totalPaidFromPocket')::numeric-(p->>'totalPaidFromPocket')::numeric-delta)>0.011 then raise exception 'PARTNER_POCKET_HISTORY_MISMATCH';end if;
    select coalesce(sum((x->>'amount')::numeric*sign),0) into delta from (
      select x,1 sign from jsonb_array_elements(s->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
      union all select x,-1 from jsonb_array_elements(o->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
    ) expenses where (x->>'partnerId'=p->>'id' or not(x?'partnerId') and x->>'partnerName'=p->>'name') and x->>'category'='مسحوبات شركاء';
    if abs((n->>'totalWithdrawals')::numeric-(p->>'totalWithdrawals')::numeric-delta)>0.011 then raise exception 'PARTNER_WITHDRAWAL_HISTORY_MISMATCH';end if;
  end loop;
end $$;

create or replace function bon_erp_private.check_store_write() returns trigger
language plpgsql set search_path='' as $$
declare s jsonb:=to_jsonb(new)-array['id','version','updated_at','updated_by'];o jsonb:=to_jsonb(old)-array['id','version','updated_at','updated_by'];
begin
  perform bon_erp_private.validate_payload(s);
  if coalesce(current_setting('bon_erp.restore_user',true),'')=auth.uid()::text then perform bon_erp_private.assert_owner();
  else perform bon_erp_private.validate_changes(s,o);perform bon_erp_private.validate_financial_details(s,o);end if;
  return new;
end $$;
create or replace function bon_erp_private.restore_store(p_expected_version bigint,p_state jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform bon_erp_private.assert_owner();
  perform set_config('bon_erp.restore_user',auth.uid()::text,true);
  result:=bon_erp_private.save_store(p_expected_version,p_state,p_operation_id,null);
  perform set_config('bon_erp.restore_user','',true);
  return result;
end $$;
create or replace function public.bon_erp_restore_store(p_expected_version bigint,p_state jsonb,p_operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select bon_erp_private.restore_store(p_expected_version,p_state,p_operation_id)$$;
revoke all on function bon_erp_private.assert_owner(),bon_erp_private.inventory_changes(jsonb,jsonb),bon_erp_private.validate_changes(jsonb,jsonb),bon_erp_private.validate_financial_details(jsonb,jsonb) from public,anon,authenticated;
revoke all on function bon_erp_private.restore_store(bigint,jsonb,uuid),public.bon_erp_restore_store(bigint,jsonb,uuid) from public,anon;
grant execute on function bon_erp_private.restore_store(bigint,jsonb,uuid),public.bon_erp_restore_store(bigint,jsonb,uuid) to authenticated;
commit;
