begin;

create function bon_erp_private.check_sale_return_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare previous_invoice jsonb; returned_invoice jsonb; available_debt numeric;
begin
  if coalesce(current_setting('bon_erp.restore_user',true),'')=auth.uid()::text then
    return new;
  end if;
  for previous_invoice, returned_invoice in
    select original, current
    from jsonb_array_elements(old.sales_invoices) original
    join jsonb_array_elements(new.sales_invoices) current
      on original->>'id'=current->>'id'
    where coalesce((current->>'isReturned')::boolean,false)
      and not coalesce((original->>'isReturned')::boolean,false)
  loop
    select (customer->>'balance')::numeric into available_debt
    from jsonb_array_elements(old.customers) customer
    where customer->>'id'=previous_invoice->>'customerId';

    if coalesce(available_debt,0)<(previous_invoice->>'remainingAmount')::numeric
      or (returned_invoice->>'returnDebtReversed')::numeric is distinct from (previous_invoice->>'remainingAmount')::numeric
      or (returned_invoice->>'returnRefundAmount')::numeric is distinct from (previous_invoice->>'paidAmount')::numeric
    then
      raise exception 'RETURN_PAYMENT_RECONCILIATION_REQUIRED';
    end if;
  end loop;
  return new;
end $$;
revoke all on function bon_erp_private.check_sale_return_payment() from public,anon,authenticated;
create trigger check_sale_return_payment before update of sales_invoices on public.bon_elagouz_store
for each row when (old.sales_invoices is distinct from new.sales_invoices)
execute function bon_erp_private.check_sale_return_payment();

-- Require a source date for new queue rows while allowing historical rows to be read.
create or replace function bon_erp_private.check_begun_queue() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.report_kind='financial' then
    perform bon_erp_private.begun_amount(new.raw_rows,new.sale_date);
    if new.raw_rows->0->>'businessDate' is null then
      raise exception 'BEGUN_REPORT_DATE_REQUIRED';
    end if;
  end if;
  return new;
end $$;

create or replace function bon_erp_private.prepare_import(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job bon_erp_private.import_jobs%rowtype;
begin
  select * into job from bon_erp_private.import_jobs where id=p_id for update;
  if not found or not bon_erp_private.import_visible(job.owner_id) then
    raise exception 'USER_PERMISSION_DENIED' using errcode='42501';
  end if;
  if job.status in ('ready','cancelled') then
    return jsonb_build_object('id',job.id,'status',job.status);
  end if;
  if job.attempt>=3 and not (job.status='processing' and coalesce(job.lease_until>now(),false)) then
    update bon_erp_private.import_jobs
    set status='failed',error_code=coalesce(error_code,'IMPORT_RETRIES_EXHAUSTED'),
        download_token=null,worker_token=null,lease_until=null,updated_at=now()
    where id=p_id returning * into job;
    return jsonb_build_object('id',job.id,'status',job.status);
  end if;
  if p_token is null or length(p_token) not between 20 and 4000 or p_token!~'^[a-zA-Z0-9_.-]+$'
    or not exists(select 1 from storage.objects where bucket_id='agouz-cashier-imports' and name=job.object_path)
  then raise exception 'IMPORT_UPLOAD_MISSING';end if;
  if job.status in ('uploading','failed')
    or (job.updated_at<now()-interval '10 minutes' and (job.status='queued' or job.lease_until<now()))
  then
    update bon_erp_private.import_jobs
    set status='queued',worker_token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
        download_token=p_token,lease_until=null,error_code=null,result=null,updated_at=now()
    where id=p_id returning * into job;
  end if;
  return jsonb_build_object('id',job.id,'status',job.status,'workerToken',job.worker_token);
end $$;

commit;
