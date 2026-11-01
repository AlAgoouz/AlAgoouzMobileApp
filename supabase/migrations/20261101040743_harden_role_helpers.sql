begin;
-- Membership RLS already allows each authenticated user to read their own row.
-- These helpers therefore need no privileged execution or RLS bypass.
create or replace function public.bon_erp_role() returns text
language sql stable security invoker set search_path = '' as $$
  select role from public.erp_members where user_id = auth.uid()
$$;
create or replace function public.erp_role() returns text
language sql stable security invoker set search_path = '' as $$
  select role from public.erp_members where user_id = auth.uid()
$$;
revoke all on function public.bon_erp_role(), public.erp_role() from public, anon;
grant execute on function public.bon_erp_role(), public.erp_role() to authenticated;
create index if not exists bon_erp_store_receipts_actor_idx
  on public.bon_erp_store_receipts(actor_id);
commit;
