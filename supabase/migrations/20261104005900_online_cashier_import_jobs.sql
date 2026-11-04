create schema agouz_import_worker;
revoke all on schema agouz_import_worker from public;
grant usage on schema agouz_import_worker to anon,authenticated;
create table bon_erp_private.import_jobs(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,file_name text not null,object_path text not null unique,
 sale_date text not null,kind text not null check(kind in ('financial','items')),file_bytes integer not null check(file_bytes between 1 and 10485760),
 status text not null default 'uploading' check(status in ('uploading','queued','processing','ready','failed','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),lease_until timestamptz,attempt integer not null default 0,
 download_token text,worker_token text,result jsonb,error_code text,queue_id uuid references public.cashier_sync_queue(id),content_hash text
);
alter table bon_erp_private.import_jobs enable row level security;
revoke all on bon_erp_private.import_jobs from public,anon,authenticated;
create unique index import_jobs_active_day_kind on bon_erp_private.import_jobs(sale_date,kind) where status in ('uploading','queued','processing','ready');
create index import_jobs_owner_time on bon_erp_private.import_jobs(owner_id,created_at desc);
alter table public.cashier_sync_queue add column import_job_id uuid references bon_erp_private.import_jobs(id);
alter table public.cashier_sync_queue add column report_kind text check(report_kind in ('financial','items'));

create function bon_erp_private.import_allowed(p_user uuid,p_review boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.erp_members m where m.user_id=p_user and m.disabled_at is null and m.deleted_at is null and ((not p_review and m.role='cashier') or m.role='partner' and (bon_erp_private.is_master(m.user_id) or coalesce((m.access_permissions->>'view')::boolean,false) and coalesce((m.access_permissions->>'cashier')::boolean,false))))
$$;
create function bon_erp_private.import_visible(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$select bon_erp_private.import_allowed(auth.uid()) and (p_owner=auth.uid() or bon_erp_private.import_allowed(auth.uid(),true))$$;
create function bon_erp_private.import_object_allowed(p_path text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from bon_erp_private.import_jobs j where j.object_path=p_path and bon_erp_private.import_visible(j.owner_id) and (not p_write or j.owner_id=auth.uid() and j.status='uploading'))
$$;
revoke all on function bon_erp_private.import_allowed(uuid,boolean),bon_erp_private.import_visible(uuid) from public,anon,authenticated;
revoke all on function bon_erp_private.import_object_allowed(text,boolean) from public,anon;
grant execute on function bon_erp_private.import_object_allowed(text,boolean) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('agouz-cashier-imports','agouz-cashier-imports',false,10485760,array['text/csv','text/plain','application/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create policy agouz_import_upload on storage.objects for insert to authenticated with check(bucket_id='agouz-cashier-imports' and bon_erp_private.import_object_allowed(name,true));
create policy agouz_import_read on storage.objects for select to authenticated using(bucket_id='agouz-cashier-imports' and bon_erp_private.import_object_allowed(name,false));

create function bon_erp_private.new_import(p_name text,p_kind text,p_date text,p_bytes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare job bon_erp_private.import_jobs%rowtype;extension text;has_report boolean;
begin
 if not bon_erp_private.import_allowed(auth.uid()) then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_name is null or p_kind is null or p_date is null or p_bytes is null or length(p_name) not between 1 and 160 or p_name~'[/\\[:cntrl:]]' or p_kind not in ('financial','items') or p_date!~'^\d{4}-\d{2}-\d{2}$' or to_char(p_date::date,'YYYY-MM-DD')<>p_date or p_bytes not between 1 and 10485760 then raise exception 'INVALID_IMPORT';end if;
 extension:=lower(substring(p_name from '\.([a-zA-Z0-9]+)$'));if extension not in ('csv','xls','xlsx') or extension is null then raise exception 'UNSUPPORTED_IMPORT_FORMAT';end if;
 if (select count(*) from bon_erp_private.import_jobs where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'IMPORT_RATE_LIMIT';end if;
 if (select coalesce(sum(file_bytes),0) from bon_erp_private.import_jobs)>524288000 then raise exception 'IMPORT_STORAGE_LIMIT';end if;
 update bon_erp_private.import_jobs set status='failed',error_code='UPLOAD_EXPIRED',updated_at=now() where status='uploading' and created_at<now()-interval '30 minutes';
 select exists(select 1 from public.bon_elagouz_store s cross join lateral jsonb_array_elements(s.cashier_days) d where s.id='main_store' and d->>'date'=p_date and (d->>'status'='approved' or d ? (case when p_kind='financial' then 'financialReport' else 'itemsReport' end))) into has_report;
 if has_report then raise exception 'CASHIER_REPORT_ALREADY_EXISTS';end if;
 job.id:=gen_random_uuid();job.owner_id:=auth.uid();job.object_path:=job.owner_id::text||'/'||job.id::text||'/report.'||extension;
 insert into bon_erp_private.import_jobs(id,owner_id,file_name,object_path,sale_date,kind,file_bytes) values(job.id,job.owner_id,p_name,job.object_path,p_date,p_kind,p_bytes) returning * into job;
 return jsonb_build_object('id',job.id,'path',job.object_path,'status',job.status);
exception when unique_violation then raise exception 'CASHIER_IMPORT_ALREADY_PENDING';
end $$;

create function bon_erp_private.read_import(p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not bon_erp_private.import_allowed(auth.uid()) then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if p_id is not null then
  select (to_jsonb(j)-'download_token'-'worker_token')||jsonb_build_object('reviewed',coalesce(q.processed,false)) into result from bon_erp_private.import_jobs j left join public.cashier_sync_queue q on q.id=j.queue_id where j.id=p_id and bon_erp_private.import_visible(j.owner_id);
 else
  select coalesce(jsonb_agg(v order by v->>'created_at' desc),'[]'::jsonb) into result from (select (to_jsonb(j)-'download_token'-'worker_token'-'result'-'object_path')||jsonb_build_object('reviewed',coalesce(q.processed,false)) v from bon_erp_private.import_jobs j left join public.cashier_sync_queue q on q.id=j.queue_id where bon_erp_private.import_visible(j.owner_id) order by j.created_at desc limit 20) t;
 end if;return result;
end $$;

create function bon_erp_private.prepare_import(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare job bon_erp_private.import_jobs%rowtype;
begin
 select * into job from bon_erp_private.import_jobs where id=p_id for update;
 if not found or not bon_erp_private.import_visible(job.owner_id) then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if job.status in ('ready','cancelled') then return jsonb_build_object('id',job.id,'status',job.status);end if;
 if p_token is null or length(p_token) not between 20 and 4000 or p_token!~'^[a-zA-Z0-9_.-]+$' or not exists(select 1 from storage.objects where bucket_id='agouz-cashier-imports' and name=job.object_path) then raise exception 'IMPORT_UPLOAD_MISSING';end if;
 if job.status in ('uploading','failed') or job.updated_at<now()-interval '10 minutes' and (job.status='queued' or job.lease_until<now()) then
  update bon_erp_private.import_jobs set status='queued',worker_token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),download_token=p_token,attempt=0,lease_until=null,error_code=null,result=null,updated_at=now() where id=p_id returning * into job;
 end if;
 return jsonb_build_object('id',job.id,'status',job.status,'workerToken',job.worker_token);
end $$;

create function agouz_import_worker.claim_import(p_id uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 return jsonb_build_object('id',job.id,'path',job.object_path,'fileName',job.file_name,'kind',job.kind,'bytes',job.file_bytes,'downloadToken',job.download_token,'attempt',job.attempt,'catalog',catalog);
end $$;

create function agouz_import_worker.finish_import(p_id uuid,p_key text,p_attempt integer,p_result jsonb,p_error text) returns jsonb language plpgsql security definer set search_path='' as $$
declare job bon_erp_private.import_jobs%rowtype;queue uuid;
begin
 select * into job from bon_erp_private.import_jobs where id=p_id for update;
 if not found or coalesce(p_key,'')!~'^[a-f0-9]{64}$' or job.worker_token is null or sha256(convert_to(p_key,'UTF8')) is distinct from sha256(convert_to(job.worker_token,'UTF8')) then raise exception 'IMPORT_WORKER_DENIED' using errcode='42501';end if;
 if job.status='ready' then return jsonb_build_object('status','ready','queueId',job.queue_id);end if;
 if job.status<>'processing' or job.attempt is distinct from p_attempt then raise exception 'IMPORT_LEASE_CHANGED';end if;
 if not bon_erp_private.import_allowed(job.owner_id) then p_error:='USER_PERMISSION_DENIED';end if;
 if p_error is null and (p_result is null or jsonb_typeof(p_result->'rows') is distinct from 'array') then raise exception 'INVALID_IMPORT_RESULT';end if;
 if p_error is null and (jsonb_array_length(p_result->'rows') not between 1 and 10000 or octet_length(p_result::text)>2097152 or coalesce(p_result->>'sha256','')!~'^[a-f0-9]{64}$') then raise exception 'INVALID_IMPORT_RESULT';end if;
 if p_error is null and exists(select 1 from public.cashier_sync_queue where content_hash=p_result->>'sha256') then p_error:='DUPLICATE_IMPORT_FILE';end if;
 if p_error is null then
  begin
  insert into public.cashier_sync_queue(file_name,sale_date,raw_rows,content_hash,report_kind,import_job_id) values(job.file_name,job.sale_date,p_result->'rows',p_result->>'sha256',job.kind,job.id) returning id into queue;
  exception when unique_violation then p_error:='DUPLICATE_IMPORT_FILE';end;
 end if;
 if p_error is null then
  update bon_erp_private.import_jobs set status='ready',result=p_result,content_hash=p_result->>'sha256',queue_id=queue,download_token=null,lease_until=null,updated_at=now() where id=p_id;
 else
  update bon_erp_private.import_jobs set status='failed',error_code=left(p_error,100),download_token=null,worker_token=null,lease_until=null,updated_at=now() where id=p_id;
 end if;
 return jsonb_build_object('status',case when p_error is null then 'ready' else 'failed' end,'queueId',queue);
end $$;

create function bon_erp_private.cancel_import(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare job bon_erp_private.import_jobs%rowtype;
begin
 select * into job from bon_erp_private.import_jobs where id=p_id for update;
 if not found or not bon_erp_private.import_visible(job.owner_id) then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if exists(select 1 from public.cashier_sync_queue where id=job.queue_id and processed) then raise exception 'IMPORT_ALREADY_REVIEWED';end if;
 update bon_erp_private.import_jobs set status='cancelled',worker_token=null,download_token=null,updated_at=now() where id=p_id;
 update public.cashier_sync_queue set processed=true,processed_at=now() where id=job.queue_id;
end $$;

create function public.bon_erp_new_import(p_name text,p_kind text,p_date text,p_bytes integer) returns jsonb language sql security invoker set search_path='' as $$select bon_erp_private.new_import(p_name,p_kind,p_date,p_bytes)$$;
create function public.bon_erp_read_import(p_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select bon_erp_private.read_import(p_id)$$;
create function public.bon_erp_prepare_import(p_id uuid,p_token text) returns jsonb language sql security invoker set search_path='' as $$select bon_erp_private.prepare_import(p_id,p_token)$$;
create function public.bon_erp_claim_import(p_id uuid,p_key text) returns jsonb language sql security invoker set search_path='' as $$select agouz_import_worker.claim_import(p_id,p_key)$$;
create function public.bon_erp_finish_import(p_id uuid,p_key text,p_attempt integer,p_result jsonb,p_error text) returns jsonb language sql security invoker set search_path='' as $$select agouz_import_worker.finish_import(p_id,p_key,p_attempt,p_result,p_error)$$;
create function public.bon_erp_cancel_import(p_id uuid) returns void language sql security invoker set search_path='' as $$select bon_erp_private.cancel_import(p_id)$$;
revoke all on function bon_erp_private.new_import(text,text,text,integer),bon_erp_private.read_import(uuid),bon_erp_private.prepare_import(uuid,text),agouz_import_worker.claim_import(uuid,text),agouz_import_worker.finish_import(uuid,text,integer,jsonb,text),bon_erp_private.cancel_import(uuid),public.bon_erp_new_import(text,text,text,integer),public.bon_erp_read_import(uuid),public.bon_erp_prepare_import(uuid,text),public.bon_erp_claim_import(uuid,text),public.bon_erp_finish_import(uuid,text,integer,jsonb,text),public.bon_erp_cancel_import(uuid) from public,anon,authenticated;
grant execute on function bon_erp_private.new_import(text,text,text,integer),bon_erp_private.read_import(uuid),bon_erp_private.prepare_import(uuid,text),bon_erp_private.cancel_import(uuid),public.bon_erp_new_import(text,text,text,integer),public.bon_erp_read_import(uuid),public.bon_erp_prepare_import(uuid,text),public.bon_erp_cancel_import(uuid) to authenticated;
grant execute on function agouz_import_worker.claim_import(uuid,text),agouz_import_worker.finish_import(uuid,text,integer,jsonb,text),public.bon_erp_claim_import(uuid,text),public.bon_erp_finish_import(uuid,text,integer,jsonb,text) to anon,authenticated;
