-- Recipe product definitions remain outside operational items until activation.
-- Imported names keep their provenance; manual definitions have their own origin.
begin;
do $migration$
declare definition text;old_schema text;next_schema jsonb;
begin
 definition:=pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure);
 old_schema:=split_part(definition,'$schema$',2);
 if old_schema='' then raise exception 'RECIPE_DRAFT_SCHEMA_PATCH_REFUSED';end if;
 next_schema:=jsonb_set(old_schema::jsonb,'{properties,catalog_name_drafts}',$drafts${"default":[],"maxItems":2000,"type":"array","items":{"anyOf":[{"type":"object","properties":{"id":{"type":"string","minLength":1},"name":{"type":"string","minLength":1,"maxLength":200},"definition":{"type":"object","properties":{"code":{"type":"string","minLength":1},"category":{"type":"string","enum":["manufactured_blend","drink_recipe","seasoning_recipe"]},"baseUnit":{"type":"string","enum":["kg","piece","count","liter"]},"retailPrice":{"type":"number","minimum":0},"openingStock":{"type":"number","minimum":0},"minStock":{"type":"number","minimum":0}},"required":["code","category","baseUnit","retailPrice","openingStock","minStock"],"additionalProperties":false},"origin":{"type":"string","const":"github"},"sourceRepository":{"type":"string","minLength":1,"maxLength":200},"sourceCommit":{"type":"string","pattern":"^[a-f0-9]{40}$"},"sourcePath":{"type":"string","minLength":1,"maxLength":500},"importedAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"}},"required":["id","name","sourceRepository","sourceCommit","sourcePath","importedAt"],"additionalProperties":false},{"type":"object","properties":{"id":{"type":"string","minLength":1},"name":{"type":"string","minLength":1,"maxLength":200},"definition":{"type":"object","properties":{"code":{"type":"string","minLength":1},"category":{"type":"string","enum":["manufactured_blend","drink_recipe","seasoning_recipe"]},"baseUnit":{"type":"string","enum":["kg","piece","count","liter"]},"retailPrice":{"type":"number","minimum":0},"openingStock":{"type":"number","minimum":0},"minStock":{"type":"number","minimum":0}},"required":["code","category","baseUnit","retailPrice","openingStock","minStock"],"additionalProperties":false},"origin":{"type":"string","const":"manual"},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"}},"required":["id","name","origin","createdAt"],"additionalProperties":false}]}}$drafts$::jsonb);
 execute replace(definition,'$schema$'||old_schema||'$schema$','$schema$'||next_schema::text||'$schema$');
end $migration$;

create or replace function bon_erp_private.check_catalog_name_drafts() returns trigger
language plpgsql security invoker set search_path='' as $$
declare previous_names jsonb:='[]';d jsonb;p jsonb;next_d jsonb;restore_mode boolean:=coalesce(current_setting('bon_erp.restore_user',true),'')=auth.uid()::text;
begin
 select coalesce(jsonb_agg(value-'legacyPrices' order by position),'[]'::jsonb) into new.catalog_name_drafts
   from jsonb_array_elements(new.catalog_name_drafts) with ordinality t(value,position);
 if tg_op='UPDATE' then
  select coalesce(jsonb_agg(value-'legacyPrices' order by position),'[]'::jsonb) into previous_names
    from jsonb_array_elements(old.catalog_name_drafts) with ordinality t(value,position);
 end if;
 if (tg_op='INSERT' and new.catalog_name_drafts<>'[]'::jsonb) or (tg_op='UPDATE' and new.catalog_name_drafts is distinct from previous_names) then
  if not bon_erp_private.is_master(auth.uid()) then perform bon_erp_private.require_access('catalog');end if;
 end if;
 if jsonb_array_length(new.catalog_name_drafts)<>(select count(distinct value->>'id') from jsonb_array_elements(new.catalog_name_drafts))
   or exists(select 1 from jsonb_array_elements(new.catalog_name_drafts) value group by lower(regexp_replace(btrim(value->>'name'),'[[:space:]]+',' ','g')) having count(*)>1)
   then raise exception 'DUPLICATE_CATALOG_DRAFT';end if;
 for d in select value from jsonb_array_elements(new.catalog_name_drafts) loop
  if coalesce(btrim(d->>'name'),'')='' then raise exception 'CATALOG_DRAFT_NAME_REQUIRED';end if;
  if not(d?'definition') then continue;end if;
  p:=d->'definition';
  if coalesce(btrim(p->>'code'),'')='' or p->>'code' is distinct from btrim(p->>'code')
    or p->>'category' not in ('manufactured_blend','drink_recipe','seasoning_recipe')
    or (p->>'category'='manufactured_blend' and p->>'baseUnit'<>'kg')
    or (p->>'category'='drink_recipe' and p->>'baseUnit'<>'piece')
    or (p->>'category'<>'manufactured_blend' and ((p->>'openingStock')::numeric<>0 or (p->>'minStock')::numeric<>0))
    then raise exception 'INVALID_RECIPE_DEFINITION';end if;
  if exists(select 1 from jsonb_array_elements(new.items) item where upper(btrim(item->>'code'))=upper(p->>'code') or item->>'barcode'=p->>'code'
    or lower(regexp_replace(btrim(item->>'name'),'[[:space:]]+',' ','g'))=lower(regexp_replace(btrim(d->>'name'),'[[:space:]]+',' ','g')))
    or exists(select 1 from jsonb_array_elements(new.catalog_name_drafts) other where other->>'id'<>d->>'id' and upper(other#>>'{definition,code}')=upper(p->>'code'))
    then raise exception 'RECIPE_DEFINITION_CODE_OR_NAME_USED';end if;
 end loop;
 if not restore_mode then
  for d in select value from jsonb_array_elements(previous_names) loop
   select value into next_d from jsonb_array_elements(new.catalog_name_drafts) where value->>'id'=d->>'id';
   if next_d is null then continue;end if;
   if (d-array['name','definition']) is distinct from (next_d-array['name','definition']) then raise exception 'CATALOG_DRAFT_SOURCE_IMMUTABLE';end if;
   if d?'definition' and not(next_d?'definition') then raise exception 'RECIPE_DEFINITION_CLIENT_UPGRADE_REQUIRED';end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function bon_erp_private.check_catalog_name_drafts() from public,anon,authenticated;
drop trigger check_catalog_name_drafts on public.bon_elagouz_store;
create trigger check_catalog_name_drafts before insert or update of catalog_name_drafts,items on public.bon_elagouz_store
for each row execute function bon_erp_private.check_catalog_name_drafts();
commit;
