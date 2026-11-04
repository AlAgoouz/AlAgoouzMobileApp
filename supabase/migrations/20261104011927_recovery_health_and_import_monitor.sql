create table bon_erp_private.recovery_health(
 id boolean primary key default true check(id),state text not null check(state in('running','success','failed')),
 run_id text not null,source_sha text not null,started_at timestamptz not null default now(),finished_at timestamptz,
 last_verified_at timestamptz,last_verified_run text,last_verified_source text,generation text
);
alter table bon_erp_private.recovery_health enable row level security;
revoke all on bon_erp_private.recovery_health from public,anon,authenticated;
create function bon_erp_private.report_recovery_health(p_state text,p_run text,p_sha text,p_generation text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from bon_erp_private.storage_backup_principal where user_id=auth.uid()) then raise exception 'BACKUP_PRINCIPAL_REQUIRED' using errcode='42501';end if;
 if p_state is null or p_state not in('running','success','failed') or coalesce(p_run,'')!~'^[0-9]{1,20}$' or coalesce(p_sha,'')!~'^[a-f0-9]{40}$' or p_state='success' and coalesce(p_generation,'')!~'^[a-zA-Z0-9-]{20,100}$' then raise exception 'INVALID_RECOVERY_STATUS';end if;
 if p_state='running' then
  insert into bon_erp_private.recovery_health(id,state,run_id,source_sha)values(true,p_state,p_run,p_sha) on conflict(id)do update set state='running',run_id=p_run,source_sha=p_sha,started_at=now(),finished_at=null;
 else
  update bon_erp_private.recovery_health set state=p_state,finished_at=now(),last_verified_at=case when p_state='success' then now() else last_verified_at end,last_verified_run=case when p_state='success' then p_run else last_verified_run end,last_verified_source=case when p_state='success' then p_sha else last_verified_source end,generation=case when p_state='success' then p_generation else generation end where id and run_id=p_run and state='running';
  if not found then raise exception 'RECOVERY_RUN_CHANGED';end if;
 end if;
end $$;
create function public.bon_erp_report_recovery_health(p_state text,p_run text,p_sha text,p_generation text default null) returns void language sql security invoker set search_path='' as $$select bon_erp_private.report_recovery_health(p_state,p_run,p_sha,p_generation)$$;
create function bon_erp_private.operational_health() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare imports jsonb;backup jsonb;
begin
 if public.bon_erp_role() is distinct from 'partner' then raise exception 'USER_PERMISSION_DENIED' using errcode='42501';end if;
 if bon_erp_private.import_allowed(auth.uid(),true) then
  select jsonb_build_object('failed',count(*)filter(where status='failed'),'working',count(*)filter(where status in('uploading','queued','processing')),'delayed',count(*)filter(where status in('uploading','queued','processing') and updated_at<now()-interval '10 minutes'),'awaitingReview',count(*)filter(where status='ready' and not coalesce(q.processed,false))) into imports from bon_erp_private.import_jobs j left join public.cashier_sync_queue q on q.id=j.queue_id where j.status<>'cancelled';
 end if;
 select to_jsonb(r)-'id'-'generation' into backup from bon_erp_private.recovery_health r where id;
 return jsonb_build_object('imports',imports,'backup',backup,'checkedAt',now());
end $$;
create function public.bon_erp_operational_health() returns jsonb language sql stable security invoker set search_path='' as $$select bon_erp_private.operational_health()$$;
revoke all on function bon_erp_private.report_recovery_health(text,text,text,text),public.bon_erp_report_recovery_health(text,text,text,text),bon_erp_private.operational_health(),public.bon_erp_operational_health() from public,anon,authenticated;
grant execute on function bon_erp_private.report_recovery_health(text,text,text,text),public.bon_erp_report_recovery_health(text,text,text,text),bon_erp_private.operational_health(),public.bon_erp_operational_health() to authenticated;
