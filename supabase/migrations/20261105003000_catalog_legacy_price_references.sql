-- Price references are pending catalog data; they do not book inventory or revenue.
do $migration$
declare definition text;old_schema text;next_schema jsonb;
begin
 definition:=pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure);
 old_schema:=split_part(definition,'$schema$',2);
 if old_schema='' then raise exception 'CATALOG_PRICE_SCHEMA_PATCH_REFUSED';end if;
 next_schema:=jsonb_set(old_schema::jsonb,'{properties,catalog_name_drafts}',$property${"default":[],"maxItems":2000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1},"name":{"type":"string","minLength":1,"maxLength":200},"sourceRepository":{"type":"string","minLength":1,"maxLength":200},"sourceCommit":{"type":"string","pattern":"^[a-f0-9]{40}$"},"sourcePath":{"type":"string","minLength":1,"maxLength":500},"importedAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"},"legacyPrices":{"type":"object","properties":{"purchasePrice":{"type":"number","minimum":0,"maximum":999999999999.99},"salePrice":{"type":"number","minimum":0,"maximum":999999999999.99},"unitLabel":{"type":"string","minLength":1,"maxLength":40},"packageWeightGrams":{"type":"integer","exclusiveMinimum":0,"maximum":1000000},"sourceName":{"type":"string","minLength":1,"maxLength":200},"sourcePath":{"type":"string","minLength":1,"maxLength":500},"sourceCommit":{"type":"string","pattern":"^[a-f0-9]{40}$"},"sourceKind":{"type":"string","const":"github_seed"},"requiresReview":{"type":"boolean","const":true}},"required":["purchasePrice","salePrice","unitLabel","sourceName","sourcePath","sourceCommit","sourceKind","requiresReview"],"additionalProperties":false}},"required":["id","name","sourceRepository","sourceCommit","sourcePath","importedAt"],"additionalProperties":false}}$property$::jsonb);
 execute replace(definition,'$schema$'||old_schema||'$schema$','$schema$'||next_schema::text||'$schema$');
end $migration$;

create or replace function bon_erp_private.check_catalog_name_drafts() returns trigger
language plpgsql security invoker set search_path='' as $$
declare previous_prices jsonb;
begin
 if tg_op='UPDATE' then
  if new.catalog_name_drafts is not distinct from old.catalog_name_drafts then return new;end if;
  -- Old clients omit optional nested fields. Preserve references before checking
  -- permissions, so an unrelated authorized write does not remove their prices.
  -- An explicit owner restore remains faithful to the selected backup snapshot.
  if coalesce(current_setting('bon_erp.restore_user',true),'') is distinct from auth.uid()::text then
   select coalesce(jsonb_object_agg(d->>'id',d->'legacyPrices') filter(where d?'legacyPrices'),'{}'::jsonb) into previous_prices from jsonb_array_elements(old.catalog_name_drafts) d;
   if previous_prices<>'{}'::jsonb then
    select coalesce(jsonb_agg(case when not(d?'legacyPrices') and previous_prices?(d->>'id') then d||jsonb_build_object('legacyPrices',previous_prices->(d->>'id')) else d end order by n),'[]'::jsonb) into new.catalog_name_drafts from jsonb_array_elements(new.catalog_name_drafts) with ordinality t(d,n);
   end if;
  end if;
  if new.catalog_name_drafts is not distinct from old.catalog_name_drafts then return new;end if;
 end if;
 if new.catalog_name_drafts='[]'::jsonb and tg_op='INSERT' then return new;end if;
 if not bon_erp_private.is_master(auth.uid()) then perform bon_erp_private.require_access('catalog');end if;
 if jsonb_array_length(new.catalog_name_drafts)<>(select count(distinct d->>'id') from jsonb_array_elements(new.catalog_name_drafts) d) or exists(select 1 from jsonb_array_elements(new.catalog_name_drafts) d group by lower(regexp_replace(btrim(d->>'name'),'[[:space:]]+',' ','g')) having count(*)>1) then raise exception 'DUPLICATE_CATALOG_DRAFT';end if;
 return new;
end $$;
revoke all on function bon_erp_private.check_catalog_name_drafts() from public,anon,authenticated;
