create function public.bon_erp_export_report(p_from text,p_to text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s public.bon_elagouz_store%rowtype;result jsonb;summary jsonb;field text;
begin
 summary:=public.bon_erp_dashboard(p_from,p_to);
 select * into strict s from public.bon_elagouz_store where id='main_store';
 result:=jsonb_build_object('version',s.version,'summary',summary,'items',s.items,'customers',s.customers,'suppliers',s.suppliers,'partners',s.partners);
 foreach field in array array['sales_invoices','purchase_invoices','expenses','cashier_days'] loop
  result:=result||jsonb_build_object(field,coalesce((select jsonb_agg(v order by v->>'date',v->>'id') from jsonb_array_elements(to_jsonb(s)->field)v where v->>'date' between p_from and p_to),'[]'::jsonb));
 end loop;
 foreach field in array array['items','customers','suppliers','partners','sales_invoices','purchase_invoices','expenses','cashier_days'] loop
  if jsonb_array_length(result->field)>10000 then raise exception 'EXPORT_ROW_LIMIT';end if;
 end loop;
 if octet_length(result::text)>8388608 then raise exception 'EXPORT_SIZE_LIMIT';end if;
 return result;
end $$;
revoke all on function public.bon_erp_export_report(text,text) from public,anon;
grant execute on function public.bon_erp_export_report(text,text) to authenticated;
