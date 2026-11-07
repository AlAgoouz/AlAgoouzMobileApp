begin;

create table public.agouz_menu_draft (
  id smallint primary key default 1 check (id = 1),
  revision integer not null check (revision > 0),
  content jsonb not null
);

create table public.agouz_menu_publication (
  id smallint primary key default 1 check (id = 1),
  content jsonb not null,
  published_at timestamptz not null default now()
);

create function bon_erp_private.can_manage_menu() returns boolean
language sql stable security definer set search_path = '' as $$
  select bon_erp_private.is_master(auth.uid()) and exists (
    select from public.erp_members
    where user_id = auth.uid() and disabled_at is null and deleted_at is null
  )
$$;

alter table public.agouz_menu_draft enable row level security;
alter table public.agouz_menu_publication enable row level security;
revoke all on public.agouz_menu_draft, public.agouz_menu_publication from public, anon, authenticated;
grant select on public.agouz_menu_draft to authenticated;
grant select on public.agouz_menu_publication to anon, authenticated;
create policy owner_reads_menu_draft on public.agouz_menu_draft for select to authenticated
  using ((select bon_erp_private.can_manage_menu()));
create policy anyone_reads_published_menu on public.agouz_menu_publication for select to anon, authenticated
  using (true);

create function bon_erp_private.save_menu(
  p_expected_revision integer, p_content jsonb, p_publish boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
  public_items jsonb;
  schema_document constant json := $schema$
  {
    "type":"object", "additionalProperties":false,
    "required":["name","intro","logo","template","phone","whatsapp","location","items"],
    "properties":{
      "name":{"type":"string","minLength":1,"maxLength":80,"pattern":"\\S"},
      "intro":{"type":"string","maxLength":300},
      "logo":{"$ref":"#/definitions/photo"},
      "template":{"enum":["classic","photos","compact"]},
      "phone":{"$ref":"#/definitions/phone"},
      "whatsapp":{"$ref":"#/definitions/phone"},
      "location":{"type":"string","maxLength":500,"pattern":"^(|https://[^/\\s@?#]+[^\\s]*)$"},
      "items":{
        "type":"array","maxItems":200,
        "items":{
          "type":"object","additionalProperties":false,
          "required":["id","name","section","description","photo","visible","prices"],
          "properties":{
            "id":{"type":"string","pattern":"^[a-f0-9-]{36}$"},
            "name":{"type":"string","minLength":1,"maxLength":100,"pattern":"\\S"},
            "section":{"type":"string","minLength":1,"maxLength":60,"pattern":"\\S"},
            "description":{"type":"string","maxLength":240},
            "photo":{"$ref":"#/definitions/photo"},
            "visible":{"type":"boolean"},
            "prices":{
              "type":"array","minItems":1,"maxItems":8,
              "items":{
                "type":"object","additionalProperties":false,"required":["label","amount"],
                "properties":{
                  "label":{"type":"string","maxLength":40},
                  "amount":{"type":["number","null"],"minimum":0,"maximum":999999.99,"multipleOf":0.01}
                }
              }
            }
          }
        }
      }
    },
    "definitions":{
      "photo":{"type":"string","maxLength":90000,"pattern":"^(|data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2})$"},
      "phone":{"type":"string","pattern":"^(|[+][1-9][0-9]{7,14})$"}
    }
  }
  $schema$;
begin
  if not bon_erp_private.can_manage_menu() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_publish is null
    or p_content is null or octet_length(p_content::text) > 1250000
    or not extensions.jsonb_matches_schema(schema_document, p_content) then
    raise exception 'INVALID_MENU' using errcode = '22023';
  end if;

  if p_publish then
    select jsonb_agg(item order by ordinality) into public_items
    from jsonb_array_elements(p_content->'items') with ordinality as entries(item, ordinality)
    where (item->>'visible')::boolean;
    if public_items is null or exists (
      select from jsonb_array_elements(public_items) item
      where exists (select from jsonb_array_elements(item->'prices') price where price->>'amount' is null)
        or (jsonb_array_length(item->'prices') > 1 and (
          select count(distinct nullif(btrim(price->>'label'), ''))
          from jsonb_array_elements(item->'prices') price
        ) <> jsonb_array_length(item->'prices'))
    ) then
      raise exception 'INCOMPLETE_MENU' using errcode = '22023';
    end if;
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
    insert into public.agouz_menu_publication (content)
    values (jsonb_set(p_content, '{items}', public_items))
    on conflict (id) do update set content = excluded.content, published_at = now();
  end if;
  return next_revision;
end
$$;

create function public.agouz_save_menu(p_expected_revision integer, p_content jsonb, p_publish boolean)
returns integer language sql security invoker set search_path = '' as $$
  select bon_erp_private.save_menu(p_expected_revision, p_content, p_publish)
$$;
revoke all on function bon_erp_private.can_manage_menu(), bon_erp_private.save_menu(integer,jsonb,boolean),
  public.agouz_save_menu(integer,jsonb,boolean) from public, anon, authenticated;
grant execute on function bon_erp_private.can_manage_menu(), bon_erp_private.save_menu(integer,jsonb,boolean),
  public.agouz_save_menu(integer,jsonb,boolean) to authenticated;

commit;
