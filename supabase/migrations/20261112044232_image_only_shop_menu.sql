begin;

create or replace function bon_erp_private.save_menu(
  p_expected_revision integer, p_content jsonb, p_publish boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
  schema_document constant json := $schema$
  {
    "type":"object",
    "additionalProperties":false,
    "required":["image"],
    "properties":{
      "image":{
        "type":"string",
        "maxLength":1200000,
        "pattern":"^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$"
      }
    }
  }
  $schema$;
begin
  if not bon_erp_private.can_manage_menu() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_publish is null
    or p_content is null or octet_length(p_content::text) > 1200050
    or not extensions.jsonb_matches_schema(schema_document, p_content) then
    raise exception 'INVALID_MENU' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.agouz_menu_draft (revision, content) values (1, p_content)
      on conflict (id) do nothing returning revision into next_revision;
  else
    update public.agouz_menu_draft
      set revision = revision + 1, content = p_content
      where id = 1 and revision = p_expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then
    raise exception 'MENU_REVISION_CONFLICT' using errcode = '40001';
  end if;

  if p_publish then
    insert into public.agouz_menu_publication (content) values (p_content)
      on conflict (id) do update set content = excluded.content, published_at = now();
  end if;
  return next_revision;
end
$$;

commit;
