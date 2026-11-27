create function public.bon_erp_apply_excel(
  p_expected_version bigint, p_changes jsonb, p_operation_id uuid, p_preview boolean
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  result jsonb;
  original_partners jsonb;
begin
  if p_preview is null then raise exception 'INVALID_STORE_CHANGES'; end if;

  -- Financial partner creation and changes to ownership require the owner.
  -- Totals also change through expense and payroll workflows with their own permissions.
  if p_changes ? 'partners' and not coalesce((public.bon_erp_my_access()->>'is_owner')::boolean,false) then
    select partners into original_partners from public.bon_elagouz_store where id='main_store';
    if jsonb_typeof(p_changes->'partners'->'upsert') is distinct from 'array'
      or p_changes->'partners'->'remove' is distinct from '[]'::jsonb
      or exists (
        select 1 from jsonb_array_elements(p_changes->'partners'->'upsert') changed
        where not exists (
          select 1 from jsonb_array_elements(original_partners) original
          where original->>'id'=changed->>'id'
            and original->'sharePercent' is not distinct from changed->'sharePercent'
        )
      )
    then raise exception 'USER_PERMISSION_DENIED: excel_partner_ownership' using errcode='42501';
    end if;
  end if;

  if not p_preview then
    return bon_erp_private.save_store_changes(p_expected_version, p_changes, p_operation_id, null);
  end if;

  -- The subtransaction runs the same checks as approval and rolls back document
  -- changes, audit entries and the receipt before returning the result.
  begin
    result := bon_erp_private.save_store_changes(
      p_expected_version, p_changes, p_operation_id, null
    );
    raise sqlstate 'AX001' using message = 'ROLLBACK_EXCEL_PREVIEW';
  exception when sqlstate 'AX001' then
    return result;
  end;
end;
$$;

revoke all on function public.bon_erp_apply_excel(bigint, jsonb, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.bon_erp_apply_excel(bigint, jsonb, uuid, boolean)
  to authenticated;
