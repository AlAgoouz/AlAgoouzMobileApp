begin;
-- Extend unit enums in the current schema, including historical item snapshots.
-- Keep every other validation rule and existing function permission unchanged.
do $migration$
declare definition text;old_schema text;next_schema jsonb;
begin
 definition:=pg_get_functiondef('bon_erp_private.validate_payload(jsonb)'::regprocedure);
 old_schema:=split_part(definition,'$schema$',2);
 if old_schema='' or position('"piece"' in old_schema)=0 or position('"count"' in old_schema)>0 then
  raise exception 'COUNT_UNIT_SCHEMA_PATCH_REFUSED';
 end if;
 next_schema:=replace(old_schema,'"piece"','"piece", "count"')::jsonb;
 execute replace(definition,'$schema$'||old_schema||'$schema$','$schema$'||next_schema::text||'$schema$');
end $migration$;

create or replace function bon_erp_private.base_quantity(q numeric,u text,b text) returns numeric
language sql immutable set search_path='' as $$
 select case when u=b or (u in ('piece','count') and b in ('piece','count')) then q
 when (u='gram' and b='kg') or (u='ml' and b='liter') then q/1000 else null end
$$;
commit;
