create extension if not exists pg_net with schema extensions;
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
alter table bon_erp_private.import_jobs add column dispatched_at timestamptz;
create function bon_erp_private.dispatch_imports() returns integer language plpgsql security definer set search_path='' as $$
declare job bon_erp_private.import_jobs%rowtype;dispatched integer:=0;
begin
 -- No caller-supplied URL, key, SQL or file path. Duplicate deliveries are
 -- fenced by the existing per-job token and transactional processing lease.
 for job in select * from bon_erp_private.import_jobs where
  (status='queued' or status='processing' and lease_until<now())
  and (dispatched_at is null or dispatched_at<now()-interval '2 minutes')
  order by created_at limit 2 for update skip locked loop
  if job.attempt>=3 then
   update bon_erp_private.import_jobs set status='failed',error_code='IMPORT_RETRIES_EXHAUSTED',worker_token=null,download_token=null,updated_at=now() where id=job.id;
  elsif job.updated_at<now()-interval '50 minutes' and job.attempt=0 then
   update bon_erp_private.import_jobs set status='failed',error_code='IMPORT_DOWNLOAD_EXPIRED',worker_token=null,download_token=null,updated_at=now() where id=job.id;
  else
   perform net.http_post(url:='https://agouz.vercel.app/api/import-worker',body:=jsonb_build_object('job_id',job.id,'worker_token',job.worker_token),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=60000);
   update bon_erp_private.import_jobs set dispatched_at=now() where id=job.id;
   dispatched:=dispatched+1;
  end if;
 end loop;
 return dispatched;
end $$;
revoke all on function bon_erp_private.dispatch_imports() from public,anon,authenticated;
-- Supabase hosts Cron in its postgres database. Disposable financial-test
-- databases exercise dispatch inside rollback transactions without scheduling
-- external requests. Restores disable Cron and all external networking.
do $$begin
 if current_database()='postgres' then
  create extension if not exists pg_cron;
  perform cron.schedule('agouz-import-dispatch','* * * * *','select bon_erp_private.dispatch_imports();');
 end if;
end$$;
