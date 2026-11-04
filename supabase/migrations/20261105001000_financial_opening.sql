-- An opening balance is a single carried cash asset, never a sale or profit.
alter table public.bon_elagouz_store add column financial_openings jsonb not null default '[]'::jsonb;
do $migration$
declare definition text;old_schema text;next_schema jsonb;old_save text;
begin
 definition:=pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure);
 old_schema:=split_part(definition,'$schema$',2);
 if old_schema='' then raise exception 'OPENING_SCHEMA_PATCH_REFUSED';end if;
 next_schema:=jsonb_set(old_schema::jsonb,'{properties,financial_openings}',$property${"default":[],"maxItems":1,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1},"date":{"type":"string","minLength":1},"account":{"type":"string","const":"treasury"},"amount":{"type":"number","minimum":0,"maximum":999999999999.99},"priorPeriodSettled":{"type":"boolean","const":true},"history":{"minItems":1,"maxItems":1000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1},"recordedAt":{"type":"string","minLength":1},"actorId":{"type":"string","minLength":1},"actorName":{"type":"string","minLength":1},"amount":{"type":"number","minimum":0,"maximum":999999999999.99},"reason":{"type":"string","minLength":6,"maxLength":500}},"required":["id","recordedAt","actorId","actorName","amount","reason"],"additionalProperties":false}}},"required":["id","date","account","amount","priorPeriodSettled","history"],"additionalProperties":false}}$property$::jsonb);
 execute replace(definition,'$schema$'||old_schema||'$schema$','$schema$'||next_schema::text||'$schema$');
 old_save:=pg_get_functiondef('bon_erp_private.save_store(bigint,jsonb,uuid,uuid)'::regprocedure);
 definition:=replace(old_save,'cashier_days=p_state->''cashier_days''','cashier_days=p_state->''cashier_days'',financial_openings=p_state->''financial_openings''');
 definition:=replace(definition,'select * into v_current from public.bon_elagouz_store where id=''main_store'' for update;','select * into v_current from public.bon_elagouz_store where id=''main_store'' for update;
  if not(p_state ? ''financial_openings'') then p_state:=p_state||jsonb_build_object(''financial_openings'',v_current.financial_openings);end if;');
 if definition=old_save or position('financial_openings=p_state' in definition)=0 or position('v_current.financial_openings' in definition)=0 then raise exception 'OPENING_SAVE_PATCH_REFUSED';end if;
 execute definition;
end $migration$;

create function bon_erp_private.check_financial_opening() returns trigger
language plpgsql security invoker set search_path='' as $$
declare before_rows jsonb:='[]';r jsonb;previous jsonb;event jsonb;count_before integer;
begin
 if tg_op='UPDATE' then before_rows:=old.financial_openings;end if;
 if new.financial_openings is not distinct from before_rows then return new;end if;
 perform bon_erp_private.assert_owner();
 if coalesce(current_setting('bon_erp.restore_user',true),'')=auth.uid()::text then return new;end if;
 if jsonb_array_length(new.financial_openings)<>1 then raise exception 'OPENING_IMMUTABLE';end if;
 r:=new.financial_openings->0;previous:=before_rows->0;
 if r->>'account' is distinct from 'treasury' or r->>'priorPeriodSettled' is distinct from 'true' or (r->>'date')!~'^\d{4}-\d{2}-\d{2}$' or to_char((r->>'date')::date,'YYYY-MM-DD')<>r->>'date' or (r->>'date')::date>(now() at time zone 'Africa/Cairo')::date or (r->>'amount')::numeric<0 or (r->>'amount')::numeric>999999999999.99 or round((r->>'amount')::numeric,2)<>(r->>'amount')::numeric then raise exception 'INVALID_FINANCIAL_OPENING';end if;
 if previous is not null and (r->>'id' is distinct from previous->>'id' or r->>'date' is distinct from previous->>'date') then raise exception 'OPENING_IMMUTABLE';end if;
 count_before:=coalesce(jsonb_array_length(previous->'history'),0);
 if jsonb_array_length(r->'history')<>count_before+1 then raise exception 'OPENING_HISTORY_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(previous->'history','[]')) with ordinality t(v,n) where r->'history'->(n::integer-1) is distinct from v) then raise exception 'OPENING_HISTORY_IMMUTABLE';end if;
 event:=r->'history'->count_before;
 if exists(select 1 from jsonb_array_elements(coalesce(previous->'history','[]')) t(v) where v->>'id'=event->>'id') then raise exception 'OPENING_HISTORY_REQUIRED';end if;
 if event->>'actorId' is distinct from auth.uid()::text or (event->>'amount')::numeric is distinct from (r->>'amount')::numeric or length(trim(event->>'reason')) not between 6 and 500 or nullif(event->>'recordedAt','')::timestamptz is null then raise exception 'OPENING_HISTORY_REQUIRED';end if;
 return new;
end $$;
revoke all on function bon_erp_private.check_financial_opening() from public,anon,authenticated;
create trigger check_financial_opening before insert or update of financial_openings on public.bon_elagouz_store for each row execute function bon_erp_private.check_financial_opening();

-- Include the opening asset in server exports without changing profit totals.
do $migration$
declare definition text;patched text;
begin
 definition:=pg_get_functiondef('public.bon_erp_export_report(text,text)'::regprocedure);
 patched:=replace(definition,'''partners'',s.partners','''partners'',s.partners,''financial_openings'',s.financial_openings');
 if patched=definition then raise exception 'OPENING_EXPORT_PATCH_REFUSED';end if;
 execute patched;
end $migration$;
