// Regenerate only this unpublished migration; historical migrations stay immutable.
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
function definition(source,name){const start=source.indexOf('create or replace function '+name+'(');const end=source.indexOf('$$;',start);if(start<0||end<0)throw Error('Missing function '+name);return source.slice(start,end+3);}
const payloadSource=read('supabase/migrations/20261101204556_server_store_validation.sql');
const transitionSource=read('supabase/migrations/20261101231059_enforce_store_transitions.sql');
let payload=definition(payloadSource,'bon_erp_private.validate_payload');
payload=payload.replace(/-- BEGIN GENERATED SCHEMA[\s\S]*?-- END GENERATED SCHEMA/,`-- BEGIN GENERATED SCHEMA\n  v_schema jsonb := $schema$${read('supabase/store.schema.json').trim()}$schema$::jsonb;\n-- END GENERATED SCHEMA`);
payload=payload.replace("('manufactured_blend','drink_recipe') then raise exception 'PRODUCED_ITEM_NOT_PURCHASABLE'","('manufactured_blend','drink_recipe','seasoning_recipe') then raise exception 'PRODUCED_ITEM_NOT_PURCHASABLE'");
payload=payload.replace("'drink_recipe','direct_product') then raise exception 'INVALID_SALES_QUANTITY'","'drink_recipe','direct_product','direct_drink','seasoning_recipe','snack') then raise exception 'INVALID_SALES_QUANTITY'");
payload=payload.replace("abs(total-(r->>'totalAmount')::numeric)>0.011 then raise exception 'PURCHASE_TOTAL_OR_SUPPLIER'","abs(total+coalesce((r->>'taxAmount')::numeric,0)-(r->>'totalAmount')::numeric)>0.011 or (r?'netAmount' and abs(total-(r->>'netAmount')::numeric)>0.011) then raise exception 'PURCHASE_TOTAL_OR_SUPPLIER'");
payload=payload.replace('end $$;',`  perform bon_erp_private.validate_section_changes(s,s);
  for r in select value from jsonb_array_elements(s->'cashier_days') loop
    if r->>'status'<>'approved' then continue;end if;
    total:=0;
    for l in select value from jsonb_array_elements(r->'consumption') loop
      if abs((l->>'totalCost')::numeric-round((l->>'quantity')::numeric*(l->>'unitCost')::numeric,2))>0.011 then raise exception 'CASHIER_COST_MISMATCH';end if;
      total:=total+(l->>'totalCost')::numeric;
    end loop;
    if abs(total-(r->>'totalCost')::numeric)>0.011 then raise exception 'CASHIER_TOTAL_COST_MISMATCH';end if;
  end loop;
end $$;`);
let changes=definition(transitionSource,'bon_erp_private.validate_changes');
changes=changes.replaceAll("p->>'category'<>'drink_recipe'","p->>'category' not in ('drink_recipe','seasoning_recipe')").replaceAll("n->>'category'='drink_recipe'","n->>'category' in ('drink_recipe','seasoning_recipe')").replaceAll("p->>'category'='drink_recipe'","p->>'category' in ('drink_recipe','seasoning_recipe')");
let financial=definition(transitionSource,'bon_erp_private.validate_financial_details');
const start=financial.indexOf("        select line->>'ingredientId' id,sum(bon_erp_private.base_quantity");
const end=financial.indexOf('\n      ), actual as (',start);
if(start<0||end<0)throw Error('production expected query missing');
financial=financial.slice(0,start)+`        select c.item_id id,sum(c.quantity) q
        from jsonb_array_elements(i->'recipe') line join jsonb_array_elements(s->'items') raw on raw->>'id'=line->>'ingredientId'
        cross join lateral bon_erp_private.consume_item(s->'items',raw->>'id',bon_erp_private.base_quantity((line->>'quantity')::numeric,line->>'unit',raw->>'baseUnit')*(n->>'quantityProducedKg')::numeric,array[i->>'id']) c group by c.item_id`+financial.slice(end);
let moves=definition(transitionSource,'bon_erp_private.inventory_changes');
const moveStart=moves.indexOf("  union all select l->>'itemId',-(l->>'normalizedQtyInBaseUnit')");
const moveEnd=moves.indexOf("  union all select n->>'blendId'",moveStart);
moves=moves.slice(0,moveStart)+`  union all select c.item_id,-c.quantity from new_sales cross join lateral jsonb_array_elements(n->'items') l cross join lateral bon_erp_private.consume_item(s->'items',l->>'itemId',(l->>'normalizedQtyInBaseUnit')::numeric) c
  union all select l->>'itemId',(l->>'normalizedQtyInBaseUnit')::numeric from returned_sales cross join lateral jsonb_array_elements(n->'items') l where l->>'category' not in ('drink_recipe','seasoning_recipe')
  union all select l->>'itemId',-(l->>'quantity')::numeric from jsonb_array_elements(s->'cashier_days') d cross join lateral jsonb_array_elements(coalesce(d->'consumption','[]')) l where d->>'status'='approved' and not exists(select 1 from jsonb_array_elements(o->'cashier_days') p where p->>'id'=d->>'id' and p->>'status'='approved')
`+moves.slice(moveEnd);
let save=definition(read('supabase/migrations/20261031225701_secure_store_transactions.sql'),'bon_erp_private.save_store');
save=save.replace("'stocktaking_records','account_payments']","'stocktaking_records','account_payments','cashier_days']");
save=save.replace(/  if exists\(select 1 from jsonb_array_elements\(p_state->'items'\) i where \(i->>'stock'\)::numeric<0\) then raise exception 'NEGATIVE_STOCK'; end if;\n/,'');
save=save.replace("account_payments=p_state->'account_payments'","account_payments=p_state->'account_payments',cashier_days=p_state->'cashier_days'");
save=save.replace("then raise exception 'QUEUE_INVOICE_REQUIRED'; end if;","and not exists(select 1 from jsonb_array_elements(p_state->'cashier_days') d where d->>'date'=v_queue.sale_date and (d->'itemsReport'->>'sourceQueueId'=p_queue_id::text or d->'financialReport'->>'sourceQueueId'=p_queue_id::text)) then raise exception 'QUEUE_REPORT_REQUIRED'; end if;");
let trigger=definition(transitionSource,'bon_erp_private.check_store_write');
trigger=trigger.replace('perform bon_erp_private.validate_financial_details(s,o);end if;','perform bon_erp_private.validate_financial_details(s,o);perform bon_erp_private.validate_section_changes(s,o);end if;');
const custom=read('supabase/section-rules-validation.sql');
fs.writeFileSync('supabase/migrations/20261103015028_section_business_rules.sql',`-- Seven product categories, fully paid purchases, separate tax, and paired cashier-day reports.
begin;
alter table public.bon_elagouz_store add column if not exists cashier_days jsonb not null default '[]'::jsonb;
${custom}
${payload}
${moves}
${changes}
${financial}
${save}
${trigger}
commit;
`);
