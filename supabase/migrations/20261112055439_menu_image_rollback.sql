begin;

create table bon_erp_private.previous_shop_menu (
  id smallint primary key default 1 check (id = 1),
  content jsonb not null
);
alter table bon_erp_private.previous_shop_menu enable row level security;
revoke all on table bon_erp_private.previous_shop_menu from public, anon, authenticated;

create function bon_erp_private.remember_menu_image() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into bon_erp_private.previous_shop_menu (content) values (old.content)
    on conflict (id) do update set content = excluded.content;
  return null;
end
$$;

create trigger remember_menu_image
after update of content on public.agouz_menu_publication
for each row when (old.content ? 'image' and new.content ? 'image' and old.content is distinct from new.content)
execute function bon_erp_private.remember_menu_image();

create function bon_erp_private.menu_restore_available() returns boolean
language sql stable security definer set search_path = '' as $$
  select bon_erp_private.can_manage_menu()
    and exists (select from bon_erp_private.previous_shop_menu where id = 1)
$$;

create function bon_erp_private.restore_menu_image(p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
  previous_content jsonb;
begin
  if not bon_erp_private.can_manage_menu() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;

  -- Serialize against normal publishing before reading the previous image.
  update public.agouz_menu_draft set revision = revision + 1
    where id = 1 and revision = p_expected_revision returning revision into next_revision;
  if next_revision is null then
    raise exception 'MENU_REVISION_CONFLICT' using errcode = '40001';
  end if;
  select content into previous_content from bon_erp_private.previous_shop_menu where id = 1;
  if previous_content is null then
    raise exception 'PREVIOUS_MENU_UNAVAILABLE' using errcode = '22023';
  end if;

  update public.agouz_menu_draft set content = previous_content where id = 1;
  update public.agouz_menu_publication set content = previous_content, published_at = now() where id = 1;
  return jsonb_build_object('revision', next_revision, 'content', previous_content);
end
$$;

create function public.agouz_menu_restore_available() returns boolean
language sql stable security invoker set search_path = '' as $$
  select bon_erp_private.menu_restore_available()
$$;
create function public.agouz_restore_menu_image(p_expected_revision integer) returns jsonb
language sql security invoker set search_path = '' as $$
  select bon_erp_private.restore_menu_image(p_expected_revision)
$$;

revoke all on function bon_erp_private.remember_menu_image(), bon_erp_private.menu_restore_available(),
  bon_erp_private.restore_menu_image(integer), public.agouz_menu_restore_available(),
  public.agouz_restore_menu_image(integer) from public, anon, authenticated;
grant execute on function bon_erp_private.menu_restore_available(), bon_erp_private.restore_menu_image(integer),
  public.agouz_menu_restore_available(), public.agouz_restore_menu_image(integer) to authenticated;

commit;
