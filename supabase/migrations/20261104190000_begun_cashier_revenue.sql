-- One immutable source amount for newly imported financial reports.
create function bon_erp_private.begun_amount(p_rows jsonb,p_date text) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<>1 then raise exception 'BEGUN_RESULT_REQUIRED';end if;
 r:=p_rows->0;
 if r->>'metric' is distinct from 'Begun' or jsonb_typeof(r->'amount') is distinct from 'string' or coalesce(r->>'amount','')!~'^[0-9]{1,15}\.[0-9]{2}$' then raise exception 'BEGUN_RESULT_REQUIRED';end if;
 if r->>'businessDate' is not null and r->>'businessDate' is distinct from p_date then raise exception 'BEGUN_REPORT_DATE_MISMATCH';end if;
 return (r->>'amount')::numeric;
end $$;
revoke all on function bon_erp_private.begun_amount(jsonb,text) from public,anon,authenticated;

create function bon_erp_private.check_begun_queue() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.report_kind='financial' then perform bon_erp_private.begun_amount(new.raw_rows,new.sale_date);end if;
 return new;
end $$;
revoke all on function bon_erp_private.check_begun_queue() from public,anon,authenticated;
create trigger cashier_financial_begun before insert or update of raw_rows,sale_date,report_kind on public.cashier_sync_queue for each row execute function bon_erp_private.check_begun_queue();

create function bon_erp_private.check_store_begun() returns trigger
language plpgsql security invoker set search_path='' as $$
declare d jsonb;r jsonb;previous jsonb;q public.cashier_sync_queue%rowtype;
begin
 for d in select value from jsonb_array_elements(new.cashier_days) loop
  r:=d->'financialReport';
  -- Preserve historical reports. New online reports carry their source queue ID.
  if r->>'sourceQueueId' is null then continue;end if;
  if tg_op='UPDATE' then
   select value->'financialReport' into previous from jsonb_array_elements(old.cashier_days) where value->>'id'=d->>'id';
   if previous is not distinct from r then continue;end if;
  end if;
  select * into q from public.cashier_sync_queue where id::text=r->>'sourceQueueId';
  if not found or q.report_kind is distinct from 'financial' or q.sale_date is distinct from d->>'date' or q.content_hash is distinct from r->>'sha256' then raise exception 'CASHIER_BEGUN_SOURCE_MISMATCH';end if;
  if (r->>'totalRevenue')::numeric is distinct from bon_erp_private.begun_amount(q.raw_rows,q.sale_date) then raise exception 'CASHIER_BEGUN_AMOUNT_MISMATCH';end if;
 end loop;
 return new;
end $$;
revoke all on function bon_erp_private.check_store_begun() from public,anon,authenticated;
create trigger cashier_store_begun before insert or update of cashier_days on public.bon_elagouz_store for each row execute function bon_erp_private.check_store_begun();

create or replace function agouz_import_worker.claim_import(p_id uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare job bon_erp_private.import_jobs%rowtype;catalog jsonb;
begin
 select * into job from bon_erp_private.import_jobs where id=p_id for update;
 if not found or coalesce(p_key,'')!~'^[a-f0-9]{64}$' or job.worker_token is null or sha256(convert_to(p_key,'UTF8')) is distinct from sha256(convert_to(job.worker_token,'UTF8')) then raise exception 'IMPORT_WORKER_DENIED' using errcode='42501';end if;
 if job.status not in ('queued','processing') then return null;end if;
 if not bon_erp_private.import_allowed(job.owner_id) then update bon_erp_private.import_jobs set status='failed',error_code='USER_PERMISSION_DENIED',download_token=null,worker_token=null,updated_at=now() where id=p_id;return null;end if;
 if job.status='processing' and job.lease_until>now() then return jsonb_build_object('busy',true);end if;
 if job.attempt>=3 then update bon_erp_private.import_jobs set status='failed',error_code='IMPORT_RETRIES_EXHAUSTED',download_token=null,worker_token=null,updated_at=now() where id=p_id;return null;end if;
 update bon_erp_private.import_jobs set status='processing',attempt=attempt+1,lease_until=now()+interval '90 seconds',updated_at=now() where id=p_id returning * into job;
 if bon_erp_private.import_allowed(job.owner_id,true) then select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','name',v->>'name','code',v->>'code','barcode',v->>'barcode','baseUnit',v->>'baseUnit')),'[]'::jsonb) into catalog from public.bon_elagouz_store s cross join lateral jsonb_array_elements(s.items) v where s.id='main_store';else catalog:='[]'::jsonb;end if;
 return jsonb_build_object('id',job.id,'path',job.object_path,'fileName',job.file_name,'kind',job.kind,'saleDate',job.sale_date,'bytes',job.file_bytes,'downloadToken',job.download_token,'attempt',job.attempt,'catalog',catalog);
end $$;
