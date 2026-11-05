-- User revoked price import. Discard only its pending metadata, including stale
-- browser payloads; retain user-entered prices on actual products unchanged.
do $migration$
declare definition text;old_schema text;next_schema jsonb;old_save text;marker text;
begin
 definition:=pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure);
 old_schema:=split_part(definition,'$schema$',2);
 if old_schema='' then raise exception 'MANUAL_PRICING_SCHEMA_PATCH_REFUSED';end if;
 next_schema:=jsonb_set(old_schema::jsonb,'{properties,catalog_name_drafts}',$property${"default":[],"maxItems":2000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1},"name":{"type":"string","minLength":1,"maxLength":200},"sourceRepository":{"type":"string","minLength":1,"maxLength":200},"sourceCommit":{"type":"string","pattern":"^[a-f0-9]{40}$"},"sourcePath":{"type":"string","minLength":1,"maxLength":500},"importedAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"}},"required":["id","name","sourceRepository","sourceCommit","sourcePath","importedAt"],"additionalProperties":false}}$property$::jsonb);
 execute replace(definition,'$schema$'||old_schema||'$schema$','$schema$'||next_schema::text||'$schema$');
 old_save:=pg_get_functiondef('bon_erp_private.save_store(bigint,jsonb,uuid,uuid)'::regprocedure);
 marker:='if not(p_state ? ''catalog_name_drafts'') then p_state:=p_state||jsonb_build_object(''catalog_name_drafts'',v_current.catalog_name_drafts);end if;';
 definition:=replace(old_save,marker,marker||'
  p_state:=jsonb_set(p_state,''{catalog_name_drafts}'',(select coalesce(jsonb_agg(d-''legacyPrices'' order by n),''[]''::jsonb) from jsonb_array_elements(p_state->''catalog_name_drafts'') with ordinality t(d,n)));');
 if definition=old_save or position('d-''legacyPrices''' in definition)=0 then raise exception 'MANUAL_PRICING_SAVE_PATCH_REFUSED';end if;
 execute definition;
end $migration$;

create or replace function bon_erp_private.check_catalog_name_drafts() returns trigger
language plpgsql security invoker set search_path='' as $$
declare previous_names jsonb:='[]';
begin
 select coalesce(jsonb_agg(d-'legacyPrices' order by n),'[]'::jsonb) into new.catalog_name_drafts from jsonb_array_elements(new.catalog_name_drafts) with ordinality t(d,n);
 if tg_op='UPDATE' then
  select coalesce(jsonb_agg(d-'legacyPrices' order by n),'[]'::jsonb) into previous_names from jsonb_array_elements(old.catalog_name_drafts) with ordinality t(d,n);
  if new.catalog_name_drafts is not distinct from previous_names then return new;end if;
 end if;
 if new.catalog_name_drafts='[]'::jsonb and tg_op='INSERT' then return new;end if;
 if not bon_erp_private.is_master(auth.uid()) then perform bon_erp_private.require_access('catalog');end if;
 if jsonb_array_length(new.catalog_name_drafts)<>(select count(distinct d->>'id') from jsonb_array_elements(new.catalog_name_drafts) d) or exists(select 1 from jsonb_array_elements(new.catalog_name_drafts) d group by lower(regexp_replace(btrim(d->>'name'),'[[:space:]]+',' ','g')) having count(*)>1) then raise exception 'DUPLICATE_CATALOG_DRAFT';end if;
 return new;
end $$;
revoke all on function bon_erp_private.check_catalog_name_drafts() from public,anon,authenticated;
