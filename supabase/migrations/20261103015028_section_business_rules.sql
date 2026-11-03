-- Seven product categories, fully paid purchases, separate tax, and paired cashier-day reports.
begin;
alter table public.bon_elagouz_store add column if not exists cashier_days jsonb not null default '[]'::jsonb;
-- Included in the section-business-rules migration. Private functions are not API endpoints.
create or replace function bon_erp_private.consume_item(catalog jsonb, target text, qty numeric, path text[] default array[]::text[])
returns table(item_id text,quantity numeric) language plpgsql set search_path='' as $$
declare i jsonb;l jsonb;r jsonb;
begin
  select x into i from jsonb_array_elements(catalog) x where x->>'id'=target;
  if i is null or qty<=0 or target=any(path) or cardinality(path)>50 then raise exception 'INVALID_CONSUMPTION_RECIPE';end if;
  if i->>'category'='drink_recipe' and cardinality(path)>0 then raise exception 'DRINK_NOT_INGREDIENT';end if;
  if i->>'category' in ('drink_recipe','seasoning_recipe') then
    if not coalesce((i->>'hasRecipe')::boolean,false) or jsonb_array_length(coalesce(i->'recipe','[]'))=0 then raise exception 'EMPTY_RECIPE';end if;
    for l in select value from jsonb_array_elements(i->'recipe') loop
      select x into r from jsonb_array_elements(catalog) x where x->>'id'=l->>'ingredientId';
      return query select * from bon_erp_private.consume_item(catalog,r->>'id',qty*bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unit',r->>'baseUnit'),path||target);
    end loop;
  else return query select target,qty;end if;
end $$;

create or replace function bon_erp_private.validate_section_changes(s jsonb,o jsonb) returns void
language plpgsql set search_path='' as $$
declare d jsonb;p jsonb;r jsonb;i jsonb;l jsonb;raw jsonb;old_raw jsonb;f text;expected numeric;costs numeric;before_qty numeric;previous_cost numeric;incoming numeric;expected_cost numeric;consumed jsonb;day_moves jsonb;reports text[]:=array[]::text[];
begin
  if not(s?'cashier_days') then raise exception 'CLIENT_UPGRADE_REQUIRED';end if;
  if (select count(*) from jsonb_array_elements(s->'cashier_days'))<>(select count(distinct x->>'date') from jsonb_array_elements(s->'cashier_days') x) then raise exception 'DUPLICATE_CASHIER_DAY';end if;
  for p in select value from jsonb_array_elements(o->'cashier_days') loop
    select x into d from jsonb_array_elements(s->'cashier_days') x where x->>'id'=p->>'id';
    if d is null or d->>'date' is distinct from p->>'date' or (p->>'status'='approved' and d is distinct from p) or (p?'financialReport' and d->'financialReport' is distinct from p->'financialReport') or (p?'itemsReport' and d->'itemsReport' is distinct from p->'itemsReport') then raise exception 'CASHIER_REPORT_IMMUTABLE';end if;
  end loop;
  for d in select value from jsonb_array_elements(s->'cashier_days') loop
    if not bon_erp_private.valid_date(d->>'date') or not(d?'financialReport' or d?'itemsReport') then raise exception 'INVALID_CASHIER_DAY';end if;
    if exists(select 1 from jsonb_array_elements(s->'sales_invoices') x where x->>'saleType'='cashier_sync' and x->>'date'=d->>'date') then raise exception 'LEGACY_CASHIER_DAY_EXISTS';end if;
    if d?'itemsReport' then
      for l in select value from jsonb_array_elements(d->'itemsReport'->'lines') loop
        select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId';
        if raw is null or bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unitLabel',raw->>'baseUnit') is null or abs(bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unitLabel',raw->>'baseUnit')-(l->>'normalizedQtyInBaseUnit')::numeric)>0.000001 then raise exception 'CASHIER_QUANTITY_UNIT_MISMATCH';end if;
      end loop;
    end if;
    foreach f in array array['financialReport','itemsReport'] loop
      if d?f then
        if d->f->>'sha256'=any(reports) then raise exception 'DUPLICATE_CASHIER_FILE';end if;
        reports:=array_append(reports,d->f->>'sha256');
      end if;
    end loop;
    if d->>'status'='pending' then
      if d?'totalCost' or d?'consumption' or d?'approvedAt' or d?'shortages' then raise exception 'PENDING_DAY_NOT_POSTED';end if;
      continue;
    end if;
    if not(d?'financialReport' and d?'itemsReport' and d?'totalCost' and d?'consumption' and d?'approvedAt' and d?'partnerName' and d?'shortages') or jsonb_array_length(d->'consumption')=0 then raise exception 'CASHIER_REPORT_PAIR_REQUIRED';end if;
    if exists(select 1 from jsonb_array_elements(o->'cashier_days') x where x->>'id'=d->>'id' and x->>'status'='approved') then continue;end if;
    if exists(
      with expected as (
        select c.item_id,sum(c.quantity) q from jsonb_array_elements(d->'itemsReport'->'lines') l cross join lateral bon_erp_private.consume_item(o->'items',l->>'itemId',(l->>'normalizedQtyInBaseUnit')::numeric) c group by c.item_id
      ), actual as (select l->>'itemId' item_id,sum((l->>'quantity')::numeric) q from jsonb_array_elements(d->'consumption') l group by l->>'itemId')
      select 1 from expected full join actual using(item_id) where expected.q is null or actual.q is null or abs(expected.q-actual.q)>0.000011
    )then raise exception 'CASHIER_CONSUMPTION_MISMATCH';end if;
    if (select count(*) from jsonb_array_elements(d->'consumption'))<>(select count(distinct x->>'itemId') from jsonb_array_elements(d->'consumption') x) then raise exception 'DUPLICATE_CONSUMPTION';end if;
    costs:=0;
    for l in select value from jsonb_array_elements(d->'consumption') loop
      select x into raw from jsonb_array_elements(o->'items') x where x->>'id'=l->>'itemId';
      if raw is null or abs((l->>'unitCost')::numeric-(raw->>'costPrice')::numeric)>0.001 or abs((l->>'totalCost')::numeric-round((l->>'quantity')::numeric*(raw->>'costPrice')::numeric,2))>0.011 then raise exception 'CASHIER_COST_MISMATCH';end if;
      costs:=costs+(l->>'totalCost')::numeric;
    end loop;
    if abs(costs-(d->>'totalCost')::numeric)>0.011 then raise exception 'CASHIER_TOTAL_COST_MISMATCH';end if;
    if exists(
      with expected as (select i->>'id' item_id,-(i->>'stock')::numeric q from jsonb_array_elements(s->'items') i where (i->>'stock')::numeric<0 and exists(select 1 from jsonb_array_elements(d->'consumption') l where l->>'itemId'=i->>'id')),
      actual as (select l->>'itemId' item_id,(l->>'shortage')::numeric q from jsonb_array_elements(d->'shortages') l)
      select 1 from expected full join actual using(item_id) where expected.q is null or actual.q is null or abs(expected.q-actual.q)>0.000011
    ) then raise exception 'CASHIER_SHORTAGE_MISMATCH';end if;
  end loop;
  foreach f in array array['customers','suppliers'] loop
    for r in select value from jsonb_array_elements(s->f) loop
      select x into p from jsonb_array_elements(o->f) x where x->>'id'=r->>'id';
      if p is null or r-array['balance','totalSales','totalPurchases','invoicesCount','lastPurchaseDate'] is distinct from p-array['balance','totalSales','totalPurchases','invoicesCount','lastPurchaseDate'] then
        if btrim(r->>'name')='' or regexp_replace(regexp_replace(translate(r->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[\s()+.\-]','','g'),'^00','')!~'^[0-9]{7,15}$' or (f='customers' and coalesce(btrim(r->>'area'),'')='') or (f='suppliers' and (coalesce(btrim(r->>'address'),'')='' or coalesce(btrim(r->>'representativeName'),'')='')) then raise exception 'CONTACT_DETAILS_REQUIRED';end if;
      end if;
    end loop;
  end loop;
  for i in select value from jsonb_array_elements(s->'items') loop
    select x into p from jsonb_array_elements(o->'items') x where x->>'id'=i->>'id';
    if p is null and (i->>'stock')::numeric<0 then raise exception 'NEGATIVE_OPENING_STOCK';end if;
    if (p is null or p->>'category' is distinct from i->>'category' or p->'recipe' is distinct from i->'recipe') and i->>'category' in ('manufactured_blend','drink_recipe','seasoning_recipe') and (not (i->>'hasRecipe')::boolean or jsonb_array_length(coalesce(i->'recipe','[]'))=0) then raise exception 'RECIPE_REQUIRED_ON_CREATION';end if;
    if i->>'category'='seasoning_recipe' and (i->>'stock')::numeric<>0 then raise exception 'SEASONING_HAS_NO_READY_STOCK';end if;
    if p is not null and exists(select 1 from jsonb_array_elements(o->'cashier_days') d cross join lateral jsonb_array_elements(coalesce(d->'itemsReport'->'lines','[]')) l where l->>'itemId'=i->>'id') and (p->>'category' is distinct from i->>'category' or p->>'baseUnit' is distinct from i->>'baseUnit') then raise exception 'HISTORICAL_ITEM_UNIT_IMMUTABLE';end if;
    if p is not null and not exists(select 1 from jsonb_array_elements(s->'purchase_invoices') r where coalesce((r->>'isCancelled')::boolean,false) and exists(select 1 from jsonb_array_elements(o->'purchase_invoices') old_r where old_r->>'id'=r->>'id' and not coalesce((old_r->>'isCancelled')::boolean,false)) and exists(select 1 from jsonb_array_elements(coalesce(r->'inventoryBefore','[]')) snap where snap->>'id'=i->>'id')) then
      if exists(select 1 from jsonb_array_elements(coalesce(p->'costHistory','[]')) with ordinality old_h(value,position) where old_h.value is distinct from i->'costHistory'->(old_h.position::int-1)) then raise exception 'COST_HISTORY_IMMUTABLE';end if;
      if p->>'costingVersion'='2' and p->'costPrice' is distinct from i->'costPrice' and not exists(select 1 from jsonb_array_elements(s->'purchase_invoices') r cross join lateral jsonb_array_elements(r->'items') line where line->>'itemId'=i->>'id' and not exists(select 1 from jsonb_array_elements(o->'purchase_invoices') old_r where old_r->>'id'=r->>'id')) and not exists(select 1 from jsonb_array_elements(s->'production_batches') r where r->>'blendId'=i->>'id' and not exists(select 1 from jsonb_array_elements(o->'production_batches') old_r where old_r->>'id'=r->>'id')) then raise exception 'COST_FROM_DOCUMENT_REQUIRED';end if;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'purchase_invoices') loop
    if exists(select 1 from jsonb_array_elements(o->'purchase_invoices') x where x->>'id'=r->>'id') then continue;end if;
    if r->>'accountingVersion' is distinct from '2' or r->>'paymentMethod'<>'نقدي' or (r->>'remainingAmount')::numeric<>0 or abs((r->>'paidAmount')::numeric-(r->>'totalAmount')::numeric)>0.001 or not(r?'netAmount' and r?'taxAmount') then raise exception 'NEW_PURCHASE_FULL_PAYMENT_REQUIRED';end if;
    select x into raw from jsonb_array_elements(s->'suppliers') x where x->>'id'=r->>'supplierId';
    if coalesce(btrim(raw->>'address'),'')='' or coalesce(btrim(raw->>'representativeName'),'')='' or regexp_replace(regexp_replace(translate(raw->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[\s()+.\-]','','g'),'^00','')!~'^[0-9]{7,15}$' then raise exception 'CONTACT_DETAILS_REQUIRED';end if;
    if (select count(*) from jsonb_array_elements(r->'items'))<>(select count(distinct x->>'itemId') from jsonb_array_elements(r->'items') x) then raise exception 'DUPLICATE_PURCHASE_LINE';end if;
    for l in select value from jsonb_array_elements(r->'items') loop
      select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId';
      select x into old_raw from jsonb_array_elements(o->'items') x where x->>'id'=l->>'itemId';
      if old_raw is null then raise exception 'DEFINE_ITEM_BEFORE_PURCHASE';end if;
      before_qty:=greatest(0,(old_raw->>'stock')::numeric);incoming:=(l->>'quantity')::numeric;
      expected_cost:=round((before_qty*(old_raw->>'costPrice')::numeric+incoming*(l->>'purchasePrice')::numeric)/(before_qty+incoming),2);
      if abs((raw->>'costPrice')::numeric-expected_cost)>0.001 or raw->>'costingVersion' is distinct from '2' then raise exception 'PURCHASE_AVERAGE_COST_MISMATCH';end if;
      if not exists(select 1 from jsonb_array_elements(coalesce(raw->'costHistory','[]')) h where h->>'sourceId'=r->>'id' and h->>'date'=r->>'date' and h->>'sourceType'='purchase' and (h->>'quantity')::numeric=incoming and (h->>'unitCost')::numeric=(l->>'purchasePrice')::numeric and (h->>'averageCost')::numeric=expected_cost) then raise exception 'PURCHASE_COST_HISTORY_REQUIRED';end if;
    end loop;
  end loop;
  for r in select value from jsonb_array_elements(s->'sales_invoices') loop
    if exists(select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=r->>'id') then continue;end if;
    if r->>'saleType'<>'wholesale' or not exists(select 1 from jsonb_array_elements(s->'customers') x where x->>'id'=r->>'customerId') then raise exception 'NEW_SALE_WHOLESALE_CUSTOMER_REQUIRED';end if;
    select x into raw from jsonb_array_elements(s->'customers') x where x->>'id'=r->>'customerId';
    if coalesce(btrim(raw->>'area'),'')='' or regexp_replace(regexp_replace(translate(raw->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[\s()+.\-]','','g'),'^00','')!~'^[0-9]{7,15}$' then raise exception 'CONTACT_DETAILS_REQUIRED';end if;
    for l in select value from jsonb_array_elements(r->'items') loop
      select x into raw from jsonb_array_elements(o->'items') x where x->>'id'=l->>'itemId';
      if raw is null or raw->>'category'<>'manufactured_blend' then raise exception 'WHOLESALE_BLENDS_ONLY';end if;
      if abs((l->>'unitCost')::numeric-(raw->>'costPrice')::numeric)>0.001 or abs((l->>'quantity')::numeric-(l->>'normalizedQtyInBaseUnit')::numeric)>0.000001 then raise exception 'WHOLESALE_COST_OR_QUANTITY_MISMATCH';end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(r->'items') l join jsonb_array_elements(o->'items') raw on raw->>'id'=l->>'itemId' where raw->>'category'<>'manufactured_blend') then raise exception 'WHOLESALE_BLENDS_ONLY';end if;
    if exists(select 1 from jsonb_array_elements(r->'items') l join jsonb_array_elements(o->'items') raw on raw->>'id'=l->>'itemId' group by raw->>'id',raw->>'stock' having sum((l->>'normalizedQtyInBaseUnit')::numeric)>(raw->>'stock')::numeric+0.000001) then raise exception 'WHOLESALE_INSUFFICIENT_STOCK';end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'production_batches') loop
    if exists(select 1 from jsonb_array_elements(o->'production_batches') x where x->>'id'=r->>'id') then continue;end if;
    if exists(select 1 from jsonb_array_elements(r->'ingredientsConsumed') l join jsonb_array_elements(o->'items') raw on raw->>'id'=l->>'ingredientId' group by raw->>'id',raw->>'stock' having sum((l->>'quantityUsed')::numeric)>(raw->>'stock')::numeric+0.000001) then raise exception 'PRODUCTION_INSUFFICIENT_STOCK';end if;
    select x into old_raw from jsonb_array_elements(o->'items') x where x->>'id'=r->>'blendId';
    select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=r->>'blendId';
    if old_raw is null then raise exception 'DEFINE_BLEND_BEFORE_PRODUCTION';end if;
    before_qty:=greatest(0,(old_raw->>'stock')::numeric);incoming:=(r->>'quantityProducedKg')::numeric;
    expected_cost:=round((before_qty*(old_raw->>'costPrice')::numeric+incoming*(r->>'unitCostPerKg')::numeric)/(before_qty+incoming),2);
    if raw->>'costingVersion' is distinct from '2' or abs((raw->>'costPrice')::numeric-expected_cost)>0.001 then raise exception 'PRODUCTION_AVERAGE_COST_MISMATCH';end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(raw->'costHistory','[]')) h where h->>'sourceId'=r->>'id' and h->>'date'=r->>'date' and h->>'sourceType'='production' and (h->>'quantity')::numeric=incoming and (h->>'unitCost')::numeric=(r->>'unitCostPerKg')::numeric and (h->>'averageCost')::numeric=expected_cost) then raise exception 'PRODUCTION_COST_HISTORY_REQUIRED';end if;
  end loop;
  if exists(
    with strict_needs as (
      select l->>'itemId' item_id,(l->>'normalizedQtyInBaseUnit')::numeric q from jsonb_array_elements(s->'sales_invoices') r cross join lateral jsonb_array_elements(r->'items') l where not exists(select 1 from jsonb_array_elements(o->'sales_invoices') p where p->>'id'=r->>'id')
      union all select l->>'ingredientId',(l->>'quantityUsed')::numeric from jsonb_array_elements(s->'production_batches') r cross join lateral jsonb_array_elements(r->'ingredientsConsumed') l where not exists(select 1 from jsonb_array_elements(o->'production_batches') p where p->>'id'=r->>'id')
    ) select 1 from strict_needs n left join jsonb_array_elements(o->'items') raw on raw->>'id'=n.item_id group by n.item_id,raw->>'stock' having raw->>'stock' is null or sum(n.q)>(raw->>'stock')::numeric+0.000001
  ) then raise exception 'INSUFFICIENT_STOCK_FOR_WHOLESALE_OR_PRODUCTION';end if;
end $$;
revoke all on function bon_erp_private.consume_item(jsonb,text,numeric,text[]),bon_erp_private.validate_section_changes(jsonb,jsonb) from public,anon,authenticated;

create or replace function bon_erp_private.validate_payload(s jsonb) returns void
language plpgsql set search_path='' as $$
declare
-- BEGIN GENERATED SCHEMA
  v_schema jsonb := $schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "cashier_days": {
      "default": [],
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "status": {
            "type": "string",
            "enum": [
              "pending",
              "approved"
            ]
          },
          "financialReport": {
            "type": "object",
            "properties": {
              "fileName": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^[a-f0-9]{64}$"
              },
              "uploadedAt": {
                "type": "string",
                "minLength": 1
              },
              "sourceQueueId": {
                "type": "string",
                "minLength": 1
              },
              "totalRevenue": {
                "type": "number",
                "minimum": 0
              }
            },
            "required": [
              "fileName",
              "sha256",
              "uploadedAt",
              "totalRevenue"
            ],
            "additionalProperties": false
          },
          "itemsReport": {
            "type": "object",
            "properties": {
              "fileName": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^[a-f0-9]{64}$"
              },
              "uploadedAt": {
                "type": "string",
                "minLength": 1
              },
              "sourceQueueId": {
                "type": "string",
                "minLength": 1
              },
              "lines": {
                "minItems": 1,
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "itemId": {
                      "type": "string",
                      "minLength": 1
                    },
                    "quantity": {
                      "type": "number",
                      "exclusiveMinimum": 0
                    },
                    "unitLabel": {
                      "type": "string",
                      "minLength": 1
                    },
                    "normalizedQtyInBaseUnit": {
                      "type": "number",
                      "exclusiveMinimum": 0
                    }
                  },
                  "required": [
                    "itemId",
                    "quantity",
                    "unitLabel",
                    "normalizedQtyInBaseUnit"
                  ],
                  "additionalProperties": false
                }
              }
            },
            "required": [
              "fileName",
              "sha256",
              "uploadedAt",
              "lines"
            ],
            "additionalProperties": false
          },
          "consumption": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "quantity": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "unitCost": {
                  "type": "number",
                  "minimum": 0
                },
                "totalCost": {
                  "type": "number",
                  "minimum": 0
                }
              },
              "required": [
                "itemId",
                "quantity",
                "unitCost",
                "totalCost"
              ],
              "additionalProperties": false
            }
          },
          "shortages": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "shortage": {
                  "type": "number",
                  "exclusiveMinimum": 0
                }
              },
              "required": [
                "itemId",
                "shortage"
              ],
              "additionalProperties": false
            }
          },
          "totalCost": {
            "type": "number",
            "minimum": 0
          },
          "approvedAt": {
            "type": "string",
            "minLength": 1
          },
          "partnerName": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "id",
          "date",
          "status"
        ],
        "additionalProperties": false
      }
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "code": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "category": {
            "type": "string",
            "enum": [
              "raw_bean",
              "raw_spice",
              "manufactured_blend",
              "drink_recipe",
              "direct_product",
              "direct_drink",
              "seasoning_recipe",
              "snack"
            ]
          },
          "baseUnit": {
            "type": "string",
            "enum": [
              "kg",
              "piece",
              "liter"
            ]
          },
          "openingStock": {
            "type": "number",
            "minimum": 0
          },
          "stock": {
            "type": "number"
          },
          "minStock": {
            "type": "number",
            "minimum": 0
          },
          "costPrice": {
            "type": "number",
            "minimum": 0
          },
          "lastPurchasePrice": {
            "type": "number",
            "minimum": 0
          },
          "retailPrice": {
            "type": "number",
            "minimum": 0
          },
          "wholesalePrice": {
            "type": "number",
            "minimum": 0
          },
          "canSellDirectly": {
            "type": "boolean"
          },
          "hasRecipe": {
            "type": "boolean"
          },
          "recipe": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "ingredientId": {
                  "type": "string",
                  "minLength": 1
                },
                "ingredientName": {
                  "type": "string"
                },
                "quantity": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "unit": {
                  "type": "string",
                  "enum": [
                    "kg",
                    "gram",
                    "piece",
                    "liter",
                    "ml"
                  ]
                }
              },
              "required": [
                "ingredientId",
                "ingredientName",
                "quantity",
                "unit"
              ],
              "additionalProperties": false
            }
          },
          "supplierPrices": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "supplierId": {
                  "type": "string",
                  "minLength": 1
                },
                "supplierName": {
                  "type": "string"
                },
                "price": {
                  "type": "number",
                  "minimum": 0
                },
                "date": {
                  "type": "string"
                }
              },
              "required": [
                "supplierId",
                "supplierName",
                "price",
                "date"
              ],
              "additionalProperties": {}
            }
          },
          "costingVersion": {
            "type": "number",
            "const": 2
          },
          "costHistory": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "date": {
                  "type": "string",
                  "minLength": 1
                },
                "postedAt": {
                  "type": "string",
                  "minLength": 1
                },
                "sourceType": {
                  "type": "string",
                  "enum": [
                    "opening",
                    "purchase",
                    "production"
                  ]
                },
                "sourceId": {
                  "type": "string",
                  "minLength": 1
                },
                "quantity": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "unitCost": {
                  "type": "number",
                  "minimum": 0
                },
                "averageCost": {
                  "type": "number",
                  "minimum": 0
                }
              },
              "required": [
                "id",
                "date",
                "postedAt",
                "sourceType",
                "sourceId",
                "quantity",
                "unitCost",
                "averageCost"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "code",
          "name",
          "category",
          "baseUnit",
          "stock",
          "minStock",
          "costPrice",
          "lastPurchasePrice",
          "retailPrice",
          "wholesalePrice",
          "canSellDirectly",
          "hasRecipe",
          "supplierPrices"
        ],
        "additionalProperties": {}
      }
    },
    "production_batches": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "batchNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "blendId": {
            "type": "string",
            "minLength": 1
          },
          "blendName": {
            "type": "string"
          },
          "quantityProducedKg": {
            "type": "number",
            "minimum": 0
          },
          "unitCostPerKg": {
            "type": "number",
            "minimum": 0
          },
          "totalBatchCost": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "ingredientsConsumed": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "ingredientId": {
                  "type": "string",
                  "minLength": 1
                },
                "ingredientName": {
                  "type": "string"
                },
                "quantityUsed": {
                  "type": "number",
                  "minimum": 0
                },
                "displayQuantity": {
                  "type": "string"
                },
                "cost": {
                  "type": "number",
                  "minimum": 0
                }
              },
              "required": [
                "ingredientId",
                "ingredientName",
                "quantityUsed",
                "displayQuantity",
                "cost"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "batchNumber",
          "date",
          "blendId",
          "blendName",
          "quantityProducedKg",
          "unitCostPerKg",
          "totalBatchCost",
          "partnerName",
          "ingredientsConsumed"
        ],
        "additionalProperties": {}
      }
    },
    "purchase_invoices": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "invoiceNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "totalAmount": {
            "type": "number",
            "minimum": 0
          },
          "paidAmount": {
            "type": "number",
            "minimum": 0
          },
          "remainingAmount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "isCancelled": {
            "type": "boolean"
          },
          "cancelledAt": {
            "type": "string"
          },
          "cancelledBy": {
            "type": "string"
          },
          "refundDue": {
            "type": "number",
            "minimum": 0
          },
          "supplierId": {
            "type": "string",
            "minLength": 1
          },
          "netAmount": {
            "type": "number",
            "minimum": 0
          },
          "taxAmount": {
            "type": "number",
            "minimum": 0
          },
          "accountingVersion": {
            "type": "number",
            "const": 2
          },
          "paymentMethod": {
            "type": "string",
            "enum": [
              "نقدي",
              "آجل",
              "جزئي"
            ]
          },
          "supplierName": {
            "type": "string"
          },
          "inventoryBefore": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "code": {
                  "type": "string",
                  "minLength": 1
                },
                "name": {
                  "type": "string",
                  "minLength": 1
                },
                "category": {
                  "type": "string",
                  "enum": [
                    "raw_bean",
                    "raw_spice",
                    "manufactured_blend",
                    "drink_recipe",
                    "direct_product",
                    "direct_drink",
                    "seasoning_recipe",
                    "snack"
                  ]
                },
                "baseUnit": {
                  "type": "string",
                  "enum": [
                    "kg",
                    "piece",
                    "liter"
                  ]
                },
                "openingStock": {
                  "type": "number",
                  "minimum": 0
                },
                "stock": {
                  "type": "number"
                },
                "minStock": {
                  "type": "number",
                  "minimum": 0
                },
                "costPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "lastPurchasePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "retailPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "wholesalePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "canSellDirectly": {
                  "type": "boolean"
                },
                "hasRecipe": {
                  "type": "boolean"
                },
                "recipe": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "ingredientId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "ingredientName": {
                        "type": "string"
                      },
                      "quantity": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "unit": {
                        "type": "string",
                        "enum": [
                          "kg",
                          "gram",
                          "piece",
                          "liter",
                          "ml"
                        ]
                      }
                    },
                    "required": [
                      "ingredientId",
                      "ingredientName",
                      "quantity",
                      "unit"
                    ],
                    "additionalProperties": false
                  }
                },
                "supplierPrices": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "supplierId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "supplierName": {
                        "type": "string"
                      },
                      "price": {
                        "type": "number",
                        "minimum": 0
                      },
                      "date": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "supplierId",
                      "supplierName",
                      "price",
                      "date"
                    ],
                    "additionalProperties": {}
                  }
                },
                "costingVersion": {
                  "type": "number",
                  "const": 2
                },
                "costHistory": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "minLength": 1
                      },
                      "date": {
                        "type": "string",
                        "minLength": 1
                      },
                      "postedAt": {
                        "type": "string",
                        "minLength": 1
                      },
                      "sourceType": {
                        "type": "string",
                        "enum": [
                          "opening",
                          "purchase",
                          "production"
                        ]
                      },
                      "sourceId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "quantity": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "unitCost": {
                        "type": "number",
                        "minimum": 0
                      },
                      "averageCost": {
                        "type": "number",
                        "minimum": 0
                      }
                    },
                    "required": [
                      "id",
                      "date",
                      "postedAt",
                      "sourceType",
                      "sourceId",
                      "quantity",
                      "unitCost",
                      "averageCost"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "id",
                "code",
                "name",
                "category",
                "baseUnit",
                "stock",
                "minStock",
                "costPrice",
                "lastPurchasePrice",
                "retailPrice",
                "wholesalePrice",
                "canSellDirectly",
                "hasRecipe",
                "supplierPrices"
              ],
              "additionalProperties": {}
            }
          },
          "inventoryAfter": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "code": {
                  "type": "string",
                  "minLength": 1
                },
                "name": {
                  "type": "string",
                  "minLength": 1
                },
                "category": {
                  "type": "string",
                  "enum": [
                    "raw_bean",
                    "raw_spice",
                    "manufactured_blend",
                    "drink_recipe",
                    "direct_product",
                    "direct_drink",
                    "seasoning_recipe",
                    "snack"
                  ]
                },
                "baseUnit": {
                  "type": "string",
                  "enum": [
                    "kg",
                    "piece",
                    "liter"
                  ]
                },
                "openingStock": {
                  "type": "number",
                  "minimum": 0
                },
                "stock": {
                  "type": "number"
                },
                "minStock": {
                  "type": "number",
                  "minimum": 0
                },
                "costPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "lastPurchasePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "retailPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "wholesalePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "canSellDirectly": {
                  "type": "boolean"
                },
                "hasRecipe": {
                  "type": "boolean"
                },
                "recipe": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "ingredientId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "ingredientName": {
                        "type": "string"
                      },
                      "quantity": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "unit": {
                        "type": "string",
                        "enum": [
                          "kg",
                          "gram",
                          "piece",
                          "liter",
                          "ml"
                        ]
                      }
                    },
                    "required": [
                      "ingredientId",
                      "ingredientName",
                      "quantity",
                      "unit"
                    ],
                    "additionalProperties": false
                  }
                },
                "supplierPrices": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "supplierId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "supplierName": {
                        "type": "string"
                      },
                      "price": {
                        "type": "number",
                        "minimum": 0
                      },
                      "date": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "supplierId",
                      "supplierName",
                      "price",
                      "date"
                    ],
                    "additionalProperties": {}
                  }
                },
                "costingVersion": {
                  "type": "number",
                  "const": 2
                },
                "costHistory": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "minLength": 1
                      },
                      "date": {
                        "type": "string",
                        "minLength": 1
                      },
                      "postedAt": {
                        "type": "string",
                        "minLength": 1
                      },
                      "sourceType": {
                        "type": "string",
                        "enum": [
                          "opening",
                          "purchase",
                          "production"
                        ]
                      },
                      "sourceId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "quantity": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "unitCost": {
                        "type": "number",
                        "minimum": 0
                      },
                      "averageCost": {
                        "type": "number",
                        "minimum": 0
                      }
                    },
                    "required": [
                      "id",
                      "date",
                      "postedAt",
                      "sourceType",
                      "sourceId",
                      "quantity",
                      "unitCost",
                      "averageCost"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "id",
                "code",
                "name",
                "category",
                "baseUnit",
                "stock",
                "minStock",
                "costPrice",
                "lastPurchasePrice",
                "retailPrice",
                "wholesalePrice",
                "canSellDirectly",
                "hasRecipe",
                "supplierPrices"
              ],
              "additionalProperties": {}
            }
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "itemName": {
                  "type": "string"
                },
                "quantity": {
                  "type": "number",
                  "minimum": 0
                },
                "purchasePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "updateProductCost": {
                  "type": "boolean"
                }
              },
              "required": [
                "itemId",
                "itemName",
                "quantity",
                "purchasePrice",
                "updateProductCost"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "invoiceNumber",
          "date",
          "totalAmount",
          "paidAmount",
          "remainingAmount",
          "partnerName",
          "supplierId",
          "paymentMethod",
          "supplierName",
          "items"
        ],
        "additionalProperties": {}
      }
    },
    "sales_invoices": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "invoiceNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "totalAmount": {
            "type": "number",
            "minimum": 0
          },
          "paidAmount": {
            "type": "number",
            "minimum": 0
          },
          "remainingAmount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "isCancelled": {
            "type": "boolean"
          },
          "cancelledAt": {
            "type": "string"
          },
          "cancelledBy": {
            "type": "string"
          },
          "refundDue": {
            "type": "number",
            "minimum": 0
          },
          "saleType": {
            "type": "string",
            "enum": [
              "retail",
              "wholesale",
              "cashier_sync"
            ]
          },
          "paymentMethod": {
            "type": "string",
            "enum": [
              "نقدي",
              "آجل",
              "محفظة/انستا باي"
            ]
          },
          "customerName": {
            "type": "string"
          },
          "isReturned": {
            "type": "boolean"
          },
          "returnedAt": {
            "type": "string"
          },
          "returnedBy": {
            "type": "string"
          },
          "returnDebtReversed": {
            "type": "number",
            "minimum": 0
          },
          "returnRefundAmount": {
            "type": "number",
            "minimum": 0
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "itemName": {
                  "type": "string"
                },
                "category": {
                  "type": "string",
                  "enum": [
                    "raw_bean",
                    "raw_spice",
                    "manufactured_blend",
                    "drink_recipe",
                    "direct_product",
                    "direct_drink",
                    "seasoning_recipe",
                    "snack"
                  ]
                },
                "quantity": {
                  "type": "number",
                  "minimum": 0
                },
                "normalizedQtyInBaseUnit": {
                  "type": "number",
                  "minimum": 0
                },
                "totalPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "totalCost": {
                  "type": "number",
                  "minimum": 0
                },
                "unitCost": {
                  "type": "number",
                  "minimum": 0
                },
                "unitPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "profit": {
                  "type": "number"
                }
              },
              "required": [
                "itemId",
                "itemName",
                "category",
                "quantity",
                "normalizedQtyInBaseUnit",
                "totalPrice",
                "totalCost",
                "unitCost",
                "unitPrice",
                "profit"
              ],
              "additionalProperties": {}
            }
          },
          "subtotal": {
            "type": "number",
            "minimum": 0
          },
          "discount": {
            "type": "number",
            "minimum": 0
          },
          "totalCost": {
            "type": "number",
            "minimum": 0
          },
          "netProfit": {
            "type": "number"
          }
        },
        "required": [
          "id",
          "invoiceNumber",
          "date",
          "totalAmount",
          "paidAmount",
          "remainingAmount",
          "partnerName",
          "saleType",
          "paymentMethod",
          "customerName",
          "items",
          "subtotal",
          "discount",
          "totalCost",
          "netProfit"
        ],
        "additionalProperties": {}
      }
    },
    "suppliers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "phone": {
            "type": "string"
          },
          "address": {
            "type": "string"
          },
          "representativeName": {
            "type": "string"
          },
          "category": {
            "type": "string"
          },
          "balance": {
            "type": "number",
            "minimum": 0
          },
          "totalPurchases": {
            "type": "number",
            "minimum": 0
          },
          "invoicesCount": {
            "type": "number",
            "minimum": 0
          }
        },
        "required": [
          "id",
          "name",
          "phone",
          "category",
          "balance",
          "totalPurchases",
          "invoicesCount"
        ],
        "additionalProperties": {}
      }
    },
    "customers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "phone": {
            "type": "string"
          },
          "area": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "balance": {
            "type": "number",
            "minimum": 0
          },
          "totalSales": {
            "type": "number",
            "minimum": 0
          },
          "invoicesCount": {
            "type": "number",
            "minimum": 0
          }
        },
        "required": [
          "id",
          "name",
          "phone",
          "type",
          "balance",
          "totalSales",
          "invoicesCount"
        ],
        "additionalProperties": {}
      }
    },
    "expenses": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "category": {
            "type": "string",
            "enum": [
              "إيجار",
              "كهرباء ومياه وغاز",
              "رواتب ويوميات",
              "صيانة مطاحن وماكينات",
              "أكياس وتغليف",
              "نقل ومشال",
              "مسحوبات شركاء",
              "نثريات أخرى"
            ]
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "frequency": {
            "type": "string",
            "enum": [
              "monthly_fixed",
              "daily"
            ]
          },
          "amount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "paidFrom": {
            "type": "string",
            "enum": [
              "درج المحل",
              "خزنة الشركة",
              "من جيب الشريك",
              "تسوية مخزون (بدون نقدية)"
            ]
          },
          "partnerId": {
            "type": "string",
            "minLength": 1
          },
          "isCancelled": {
            "type": "boolean"
          },
          "cancelledAt": {
            "type": "string"
          },
          "cancelledBy": {
            "type": "string"
          },
          "sourceInvoiceId": {
            "type": "string",
            "minLength": 1
          },
          "sourceEmployeeTransactionId": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "id",
          "date",
          "category",
          "title",
          "amount",
          "partnerName",
          "paidFrom"
        ],
        "additionalProperties": {}
      }
    },
    "partners": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "username": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string"
          },
          "avatarLetter": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "sharePercent": {
            "type": "number",
            "minimum": 0,
            "maximum": 100
          },
          "totalPaidFromPocket": {
            "type": "number",
            "minimum": 0
          },
          "totalWithdrawals": {
            "type": "number",
            "minimum": 0
          },
          "lastLogin": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "username",
          "name",
          "role",
          "avatarLetter",
          "phone",
          "sharePercent",
          "totalPaidFromPocket",
          "totalWithdrawals"
        ],
        "additionalProperties": false
      }
    },
    "audit_logs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "timestamp": {
            "type": "string",
            "minLength": 1
          },
          "partnerName": {
            "type": "string"
          },
          "actionType": {
            "type": "string",
            "minLength": 1
          },
          "description": {
            "type": "string"
          },
          "amount": {
            "type": "number"
          },
          "actorId": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "timestamp",
          "partnerName",
          "actionType",
          "description"
        ],
        "additionalProperties": false
      }
    },
    "shifts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "shiftName": {
            "type": "string"
          },
          "cashierName": {
            "type": "string"
          },
          "supervisorPartner": {
            "type": "string"
          },
          "openingCash": {
            "type": "number",
            "minimum": 0
          },
          "cashSales": {
            "type": "number",
            "minimum": 0
          },
          "expensesPaid": {
            "type": "number",
            "minimum": 0
          },
          "expectedCash": {
            "type": "number"
          },
          "actualCash": {
            "type": "number",
            "minimum": 0
          },
          "difference": {
            "type": "number"
          },
          "status": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "date",
          "shiftName",
          "cashierName",
          "supervisorPartner",
          "openingCash",
          "cashSales",
          "expensesPaid",
          "expectedCash",
          "actualCash",
          "difference",
          "status"
        ],
        "additionalProperties": false
      }
    },
    "employees": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "salaryType": {
            "type": "string",
            "enum": [
              "شهري",
              "يومية"
            ]
          },
          "baseMonthlySalary": {
            "type": "number",
            "minimum": 0
          },
          "dailyRate": {
            "type": "number",
            "minimum": 0
          },
          "workedDaysThisMonth": {
            "type": "number",
            "minimum": 0
          },
          "totalAdvances": {
            "type": "number",
            "minimum": 0
          },
          "totalDeductions": {
            "type": "number",
            "minimum": 0
          },
          "totalBonuses": {
            "type": "number",
            "minimum": 0
          },
          "totalPaidOut": {
            "type": "number",
            "minimum": 0
          },
          "payrollPeriod": {
            "type": "string",
            "pattern": "^\\d{4}-(0[1-9]|1[0-2])$"
          },
          "openingPayable": {
            "type": "number"
          }
        },
        "required": [
          "id",
          "name",
          "role",
          "phone",
          "salaryType",
          "baseMonthlySalary",
          "dailyRate",
          "workedDaysThisMonth",
          "totalAdvances",
          "totalDeductions",
          "totalBonuses",
          "totalPaidOut"
        ],
        "additionalProperties": false
      }
    },
    "employee_transactions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "employeeId": {
            "type": "string",
            "minLength": 1
          },
          "employeeName": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "سلفة",
              "حضور يومية",
              "خصم/عجز",
              "مكافأة",
              "صرف راتب",
              "إقفال شهر"
            ]
          },
          "amount": {
            "type": "number",
            "minimum": 0
          },
          "notes": {
            "type": "string"
          },
          "partnerName": {
            "type": "string"
          },
          "payrollPeriod": {
            "type": "string",
            "pattern": "^\\d{4}-(0[1-9]|1[0-2])$"
          },
          "accountingVersion": {
            "type": "number",
            "const": 1
          },
          "partnerId": {
            "type": "string",
            "minLength": 1
          },
          "paidFrom": {
            "type": "string",
            "enum": [
              "درج المحل",
              "خزنة الشركة",
              "من جيب الشريك"
            ]
          },
          "expenseId": {
            "type": "string",
            "minLength": 1
          },
          "reversedAt": {
            "type": "string"
          },
          "reversedBy": {
            "type": "string"
          },
          "closingSummary": {
            "type": "object",
            "properties": {
              "openingPayable": {
                "type": "number"
              },
              "earned": {
                "type": "number",
                "minimum": 0
              },
              "advances": {
                "type": "number",
                "minimum": 0
              },
              "deductions": {
                "type": "number",
                "minimum": 0
              },
              "bonuses": {
                "type": "number",
                "minimum": 0
              },
              "paidOut": {
                "type": "number",
                "minimum": 0
              },
              "carryForward": {
                "type": "number"
              }
            },
            "required": [
              "openingPayable",
              "earned",
              "advances",
              "deductions",
              "bonuses",
              "paidOut",
              "carryForward"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "id",
          "date",
          "employeeId",
          "employeeName",
          "type",
          "amount",
          "notes",
          "partnerName"
        ],
        "additionalProperties": false
      }
    },
    "stocktaking_records": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "auditNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "partnerName": {
            "type": "string"
          },
          "totalShortageValue": {
            "type": "number",
            "minimum": 0
          },
          "totalSurplusValue": {
            "type": "number",
            "minimum": 0
          },
          "netVarianceValue": {
            "type": "number"
          },
          "itemsAudited": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "itemName": {
                  "type": "string"
                },
                "baseUnit": {
                  "type": "string"
                },
                "systemStock": {
                  "type": "number"
                },
                "actualStock": {
                  "type": "number",
                  "minimum": 0
                },
                "difference": {
                  "type": "number"
                },
                "unitCost": {
                  "type": "number",
                  "minimum": 0
                },
                "financialDifference": {
                  "type": "number"
                }
              },
              "required": [
                "itemId",
                "itemName",
                "baseUnit",
                "systemStock",
                "actualStock",
                "difference",
                "unitCost",
                "financialDifference"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "auditNumber",
          "date",
          "partnerName",
          "totalShortageValue",
          "totalSurplusValue",
          "netVarianceValue",
          "itemsAudited"
        ],
        "additionalProperties": {}
      }
    },
    "account_payments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "targetType": {
            "type": "string",
            "enum": [
              "supplier",
              "customer"
            ]
          },
          "targetId": {
            "type": "string",
            "minLength": 1
          },
          "targetName": {
            "type": "string"
          },
          "amount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "notes": {
            "type": "string"
          },
          "reversedAt": {
            "type": "string"
          },
          "reversedBy": {
            "type": "string"
          },
          "allocations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "invoiceId": {
                  "type": "string",
                  "minLength": 1
                },
                "amount": {
                  "type": "number",
                  "minimum": 0
                }
              },
              "required": [
                "invoiceId",
                "amount"
              ],
              "additionalProperties": false
            }
          },
          "openingBalanceAmount": {
            "type": "number",
            "minimum": 0
          }
        },
        "required": [
          "id",
          "date",
          "targetType",
          "targetId",
          "targetName",
          "amount",
          "partnerName"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "cashier_days",
    "items",
    "production_batches",
    "purchase_invoices",
    "sales_invoices",
    "suppliers",
    "customers",
    "expenses",
    "partners",
    "audit_logs",
    "shifts",
    "employees",
    "employee_transactions",
    "stocktaking_records",
    "account_payments"
  ],
  "additionalProperties": false
}$schema$::jsonb;
-- END GENERATED SCHEMA
  f text; r jsonb; l jsonb; item jsonb; raw jsonb; linked jsonb;
  total numeric; costs numeric; qty numeric; period text;
begin
  if octet_length(s::text)>10485760 then raise exception 'STORE_TOO_LARGE' using errcode='22023'; end if;
  if not extensions.jsonb_matches_schema(v_schema::json,s) then raise exception 'INVALID_STORE_SCHEMA' using errcode='22023'; end if;
  if jsonb_path_exists(s,'$.**.password') then raise exception 'PLAINTEXT_PASSWORD_FORBIDDEN'; end if;
  for f in select jsonb_object_keys(s) loop
    if (select count(*) from jsonb_array_elements(s->f))<>(select count(distinct x->>'id') from jsonb_array_elements(s->f) x) then raise exception 'DUPLICATE_IDS: %',f; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(s->'items'))<>(select count(distinct upper(btrim(x->>'code'))) from jsonb_array_elements(s->'items') x) then raise exception 'DUPLICATE_ITEM_CODE'; end if;
  if jsonb_array_length(s->'partners')<1 or abs((select coalesce(sum((p->>'sharePercent')::numeric),0) from jsonb_array_elements(s->'partners') p)-100)>0.0001 then raise exception 'INVALID_PARTNER_SHARES'; end if;
  for item in select value from jsonb_array_elements(s->'items') loop
    if item->>'category'='manufactured_blend' and item->>'baseUnit'<>'kg' or item->>'category'='drink_recipe' and item->>'baseUnit'<>'piece' then raise exception 'INVALID_ITEM_UNIT'; end if;
    if (item->>'hasRecipe')::boolean and jsonb_array_length(coalesce(item->'recipe','[]'::jsonb))=0 then raise exception 'EMPTY_RECIPE'; end if;
    for l in select value from jsonb_array_elements(coalesce(item->'recipe','[]'::jsonb)) loop
      select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=l->>'ingredientId';
      if raw is null or raw->>'id'=item->>'id' or raw->>'category'='drink_recipe' then raise exception 'INVALID_RECIPE_REFERENCE'; end if;
      if bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unit',raw->>'baseUnit') is null then raise exception 'INVALID_RECIPE_UNIT'; end if;
    end loop;
  end loop;
  if exists(
    with recursive edges as (select i->>'id' src,recipe_row->>'ingredientId' dst from jsonb_array_elements(s->'items') i cross join lateral jsonb_array_elements(coalesce(i->'recipe','[]')) recipe_row),
    walk as (select src,dst,array[src,dst] path,src=dst cycle from edges union all select w.src,e.dst,w.path||e.dst,e.dst=any(w.path) from walk w join edges e on e.src=w.dst where not w.cycle and cardinality(w.path)<=50)
    select 1 from walk where cycle or cardinality(path)>50
  ) then raise exception 'RECIPE_CYCLE_OR_DEPTH'; end if;
  foreach f in array array['sales_invoices','purchase_invoices','production_batches','expenses','employee_transactions','account_payments','stocktaking_records','shifts'] loop
    for r in select value from jsonb_array_elements(s->f) loop
      if not bon_erp_private.valid_date(r->>'date') then raise exception 'INVALID_BUSINESS_DATE: %',f; end if;
    end loop;
  end loop;
  foreach f in array array['sales_invoices','purchase_invoices'] loop
    for r in select value from jsonb_array_elements(s->f) loop
      if abs((r->>'totalAmount')::numeric-(r->>'paidAmount')::numeric-(r->>'remainingAmount')::numeric)>0.011 then raise exception 'INVOICE_PAYMENT_MISMATCH'; end if;
      if jsonb_array_length(r->'items')=0 then raise exception 'EMPTY_INVOICE'; end if;
      total:=0; costs:=0;
      for l in select value from jsonb_array_elements(r->'items') loop
        select x into item from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId';
        if item is null or (l->>'quantity')::numeric<=0 then raise exception 'INVALID_INVOICE_ITEM'; end if;
        if f='purchase_invoices' then
          if item->>'category' in ('manufactured_blend','drink_recipe','seasoning_recipe') then raise exception 'PRODUCED_ITEM_NOT_PURCHASABLE'; end if;
          total:=total+round((l->>'quantity')::numeric*(l->>'purchasePrice')::numeric,2);
        else
          qty:=(l->>'normalizedQtyInBaseUnit')::numeric;
          if qty<=0 or l->>'category' not in ('raw_bean','raw_spice','manufactured_blend','drink_recipe','direct_product','direct_drink','seasoning_recipe','snack') then raise exception 'INVALID_SALES_QUANTITY'; end if;
          if abs((l->>'totalPrice')::numeric-round(qty*(l->>'unitPrice')::numeric,2))>0.011 or abs((l->>'totalCost')::numeric-round(qty*(l->>'unitCost')::numeric,2))>0.011 or abs((l->>'profit')::numeric-((l->>'totalPrice')::numeric-(l->>'totalCost')::numeric))>0.011 then raise exception 'SALES_LINE_MISMATCH'; end if;
          total:=total+(l->>'totalPrice')::numeric; costs:=costs+(l->>'totalCost')::numeric;
        end if;
      end loop;
      if f='purchase_invoices' then
        if not exists(select 1 from jsonb_array_elements(s->'suppliers') x where x->>'id'=r->>'supplierId') or abs(total+coalesce((r->>'taxAmount')::numeric,0)-(r->>'totalAmount')::numeric)>0.011 or (r?'netAmount' and abs(total-(r->>'netAmount')::numeric)>0.011) then raise exception 'PURCHASE_TOTAL_OR_SUPPLIER'; end if;
      else
        if r->>'saleType'='wholesale' and not exists(select 1 from jsonb_array_elements(s->'customers') x where x->>'id'=r->>'customerId') then raise exception 'INVALID_SALES_CUSTOMER'; end if;
        if abs(total-(r->>'subtotal')::numeric)>0.011 or (r->>'discount')::numeric>total or abs(total-(r->>'discount')::numeric-(r->>'totalAmount')::numeric)>0.011 or abs(costs-(r->>'totalCost')::numeric)>0.011 or abs((r->>'netProfit')::numeric-((r->>'totalAmount')::numeric-costs))>0.011 then raise exception 'SALES_TOTAL_MISMATCH'; end if;
        if r->>'saleType' in ('retail','cashier_sync') and (r->>'remainingAmount')::numeric>0 then raise exception 'CASH_SALE_REQUIRES_PAYMENT'; end if;
      end if;
    end loop;
  end loop;
  for r in select value from jsonb_array_elements(s->'production_batches') loop
    if (r->>'quantityProducedKg')::numeric<=0 or not exists(select 1 from jsonb_array_elements(s->'items') x where x->>'id'=r->>'blendId' and x->>'category'='manufactured_blend') then raise exception 'INVALID_PRODUCTION'; end if;
    total:=0;
    for l in select value from jsonb_array_elements(r->'ingredientsConsumed') loop
      if (l->>'quantityUsed')::numeric<=0 or not exists(select 1 from jsonb_array_elements(s->'items') x where x->>'id'=l->>'ingredientId') then raise exception 'INVALID_PRODUCTION_INGREDIENT'; end if;
      total:=total+(l->>'cost')::numeric;
    end loop;
    if abs(total-(r->>'totalBatchCost')::numeric)>0.011 or abs(round(total/(r->>'quantityProducedKg')::numeric,2)-(r->>'unitCostPerKg')::numeric)>0.011 then raise exception 'PRODUCTION_COST_MISMATCH'; end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'stocktaking_records') loop
    total:=0; costs:=0;
    for l in select value from jsonb_array_elements(r->'itemsAudited') loop
      if not exists(select 1 from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId') or abs((l->>'actualStock')::numeric-(l->>'systemStock')::numeric-(l->>'difference')::numeric)>0.000001 or abs(round((l->>'difference')::numeric*(l->>'unitCost')::numeric,2)-(l->>'financialDifference')::numeric)>0.011 then raise exception 'INVALID_STOCKTAKING'; end if;
      if (l->>'financialDifference')::numeric<0 then total:=total-(l->>'financialDifference')::numeric; else costs:=costs+(l->>'financialDifference')::numeric; end if;
    end loop;
    if abs(total-(r->>'totalShortageValue')::numeric)>0.011 or abs(costs-(r->>'totalSurplusValue')::numeric)>0.011 or abs(costs-total-(r->>'netVarianceValue')::numeric)>0.011 then raise exception 'STOCKTAKING_TOTAL_MISMATCH'; end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'account_payments') loop
    f:=case when r->>'targetType'='supplier' then 'suppliers' else 'customers' end;
    if (r->>'amount')::numeric<=0 or not exists(select 1 from jsonb_array_elements(s->f) x where x->>'id'=r->>'targetId') then raise exception 'INVALID_PAYMENT_TARGET'; end if;
    if r ? 'allocations' then
      total:=coalesce((r->>'openingBalanceAmount')::numeric,0);
      f:=case when r->>'targetType'='supplier' then 'purchase_invoices' else 'sales_invoices' end;
      for l in select value from jsonb_array_elements(r->'allocations') loop
        select x into linked from jsonb_array_elements(s->f) x where x->>'id'=l->>'invoiceId';
        if linked is null or coalesce(linked->>'supplierId',linked->>'customerId')<>r->>'targetId' or (l->>'amount')::numeric<=0 then raise exception 'INVALID_PAYMENT_ALLOCATION'; end if;
        total:=total+(l->>'amount')::numeric;
      end loop;
      if abs(total-(r->>'amount')::numeric)>0.011 then raise exception 'PAYMENT_ALLOCATION_MISMATCH'; end if;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'employee_transactions') loop
    if not exists(select 1 from jsonb_array_elements(s->'employees') x where x->>'id'=r->>'employeeId') then raise exception 'INVALID_EMPLOYEE_REFERENCE'; end if;
    if r->>'accountingVersion'='1' then
      if r->>'type' not in ('سلفة','حضور يومية','خصم/عجز','مكافأة','صرف راتب','إقفال شهر') or not exists(select 1 from jsonb_array_elements(s->'partners') x where x->>'id'=r->>'partnerId') then raise exception 'INVALID_PAYROLL_ACTION'; end if;
      if r->>'type' in ('سلفة','صرف راتب') then
        select x into linked from jsonb_array_elements(s->'expenses') x where x->>'id'=r->>'expenseId';
        if linked is null or linked->>'sourceEmployeeTransactionId'<>r->>'id' or linked->>'category'<>'رواتب ويوميات' or linked->>'paidFrom'<>r->>'paidFrom' or linked->>'partnerId'<>r->>'partnerId' or (linked->>'amount')::numeric<>(r->>'amount')::numeric or coalesce((linked->>'isCancelled')::boolean,false)<>(r ? 'reversedAt') then raise exception 'PAYROLL_EXPENSE_MISMATCH'; end if;
      elsif r ? 'expenseId' then raise exception 'NONCASH_PAYROLL_EXPENSE'; end if;
      if r->>'type'='إقفال شهر' then
        linked:=r->'closingSummary';
        if linked is null or abs((linked->>'openingPayable')::numeric+(linked->>'earned')::numeric+(linked->>'bonuses')::numeric-(linked->>'advances')::numeric-(linked->>'deductions')::numeric-(linked->>'paidOut')::numeric-(linked->>'carryForward')::numeric)>0.011 then raise exception 'PAYROLL_CLOSING_MISMATCH'; end if;
      end if;
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(s->'employee_transactions') x where x->>'type'='إقفال شهر' group by x->>'employeeId',x->>'payrollPeriod' having count(*)>1) then raise exception 'PAYROLL_ALREADY_CLOSED'; end if;
  for r in select value from jsonb_array_elements(s->'expenses') loop
    if r ? 'sourceEmployeeTransactionId' and not exists(select 1 from jsonb_array_elements(s->'employee_transactions') x where x->>'id'=r->>'sourceEmployeeTransactionId' and x->>'expenseId'=r->>'id') then raise exception 'ORPHAN_PAYROLL_EXPENSE'; end if;
    if r ? 'partnerId' and not exists(select 1 from jsonb_array_elements(s->'partners') x where x->>'id'=r->>'partnerId') then raise exception 'INVALID_EXPENSE_PARTNER'; end if;
    if (r->>'amount')::numeric<=0 then raise exception 'INVALID_EXPENSE_AMOUNT'; end if;
  end loop;
  perform bon_erp_private.validate_section_changes(s,s);
  for r in select value from jsonb_array_elements(s->'cashier_days') loop
    if r->>'status'<>'approved' then continue;end if;
    total:=0;
    for l in select value from jsonb_array_elements(r->'consumption') loop
      if abs((l->>'totalCost')::numeric-round((l->>'quantity')::numeric*(l->>'unitCost')::numeric,2))>0.011 then raise exception 'CASHIER_COST_MISMATCH';end if;
      total:=total+(l->>'totalCost')::numeric;
    end loop;
    if abs(total-(r->>'totalCost')::numeric)>0.011 then raise exception 'CASHIER_TOTAL_COST_MISMATCH';end if;
  end loop;
end $;
create or replace function bon_erp_private.inventory_changes(s jsonb,o jsonb)
returns table(item_id text,quantity numeric) language sql set search_path='' as $$
with new_sales as (
  select n from jsonb_array_elements(s->'sales_invoices') n where not exists(select 1 from jsonb_array_elements(o->'sales_invoices') p where p->>'id'=n->>'id')
), returned_sales as (
  select n from jsonb_array_elements(s->'sales_invoices') n where coalesce((n->>'isReturned')::boolean,false)
  and not exists(select 1 from jsonb_array_elements(o->'sales_invoices') p where p->>'id'=n->>'id' and coalesce((p->>'isReturned')::boolean,false))
), new_batches as (
  select n from jsonb_array_elements(s->'production_batches') n where not exists(select 1 from jsonb_array_elements(o->'production_batches') p where p->>'id'=n->>'id')
), new_counts as (
  select n from jsonb_array_elements(s->'stocktaking_records') n where not exists(select 1 from jsonb_array_elements(o->'stocktaking_records') p where p->>'id'=n->>'id')
), purchases as (
  select x,1 factor from jsonb_array_elements(s->'purchase_invoices') x
  union all select x,-1 from jsonb_array_elements(o->'purchase_invoices') x
), moves as (
  select l->>'itemId' id,sum((l->>'quantity')::numeric*factor) qty from purchases cross join lateral jsonb_array_elements(x->'items') l where not coalesce((x->>'isCancelled')::boolean,false) group by l->>'itemId'
  union all select c.item_id,-c.quantity from new_sales cross join lateral jsonb_array_elements(n->'items') l cross join lateral bon_erp_private.consume_item(s->'items',l->>'itemId',(l->>'normalizedQtyInBaseUnit')::numeric) c
  union all select l->>'itemId',(l->>'normalizedQtyInBaseUnit')::numeric from returned_sales cross join lateral jsonb_array_elements(n->'items') l where l->>'category' not in ('drink_recipe','seasoning_recipe')
  union all select l->>'itemId',-(l->>'quantity')::numeric from jsonb_array_elements(s->'cashier_days') d cross join lateral jsonb_array_elements(coalesce(d->'consumption','[]')) l where d->>'status'='approved' and not exists(select 1 from jsonb_array_elements(o->'cashier_days') p where p->>'id'=d->>'id' and p->>'status'='approved')
  union all select n->>'blendId',(n->>'quantityProducedKg')::numeric from new_batches
  union all select l->>'ingredientId',-(l->>'quantityUsed')::numeric from new_batches cross join lateral jsonb_array_elements(n->'ingredientsConsumed') l
  union all select l->>'itemId',(l->>'difference')::numeric from new_counts cross join lateral jsonb_array_elements(n->'itemsAudited') l
)
select id,sum(qty) from moves group by id
$$;
create or replace function bon_erp_private.validate_changes(s jsonb,o jsonb) returns void
language plpgsql set search_path='' as $$
declare f text; p jsonb; n jsonb; e jsonb; old_e jsonb; t jsonb; c jsonb; fields text[];
  delta numeric; expected numeric; allocated numeric; old_allocated numeric; additions numeric; new_payments numeric;movement_totals jsonb;
  amount numeric; base_open numeric; earned numeric; salary numeric; advances numeric; deductions numeric; bonuses numeric; days numeric; paid numeric;
  period text:=to_char(now() at time zone 'Africa/Cairo','YYYY-MM'); close_period text; next_period text;
begin
  foreach f in array array['sales_invoices','purchase_invoices','production_batches','expenses','stocktaking_records','account_payments','employee_transactions'] loop
    fields:=case f
      when 'sales_invoices' then array['paidAmount','remainingAmount','isReturned','returnedAt','returnedBy','returnDebtReversed','returnRefundAmount']
      when 'purchase_invoices' then array['paidAmount','remainingAmount','isCancelled','cancelledAt','cancelledBy','refundDue']
      when 'expenses' then array['isCancelled','cancelledAt','cancelledBy']
      when 'account_payments' then array['reversedAt','reversedBy']
      when 'employee_transactions' then array['reversedAt','reversedBy'] else array[]::text[] end;
    for p in select value from jsonb_array_elements(o->f) loop
      select x into n from jsonb_array_elements(s->f) x where x->>'id'=p->>'id';
      if n is null or (p-fields) is distinct from (n-fields) then raise exception 'IMMUTABLE_DOCUMENT: %',f; end if;
      if f='employee_transactions' and p->>'accountingVersion' is distinct from '1' and n is distinct from p then raise exception 'LEGACY_PAYROLL_READONLY';end if;
      if (coalesce((p->>'isReturned')::boolean,false) or coalesce((p->>'isCancelled')::boolean,false) or p?'reversedAt') and n is distinct from p then raise exception 'CLOSED_DOCUMENT_IMMUTABLE'; end if;
      if f='expenses' and p?'sourceInvoiceId' and p->>'paidFrom'='تسوية مخزون (بدون نقدية)' and n is distinct from p then raise exception 'RETURN_COST_IMMUTABLE'; end if;
    end loop;
  end loop;
  for p in select value from jsonb_array_elements(o->'items') loop
    select x into n from jsonb_array_elements(s->'items') x where x->>'id'=p->>'id';
    if n is null then continue; end if;
    if p->'openingStock' is distinct from n->'openingStock' then raise exception 'OPENING_STOCK_IMMUTABLE'; end if;
    if (p->>'category' is distinct from n->>'category' or p->>'baseUnit' is distinct from n->>'baseUnit') and (
      exists(select 1 from jsonb_array_elements(o->'sales_invoices') a cross join lateral jsonb_array_elements(a->'items') l where l->>'itemId'=p->>'id')
      or exists(select 1 from jsonb_array_elements(o->'purchase_invoices') a cross join lateral jsonb_array_elements(a->'items') l where l->>'itemId'=p->>'id')
      or exists(select 1 from jsonb_array_elements(o->'stocktaking_records') a cross join lateral jsonb_array_elements(a->'itemsAudited') l where l->>'itemId'=p->>'id')
      or exists(select 1 from jsonb_array_elements(o->'production_batches') a where a->>'blendId'=p->>'id' or exists(select 1 from jsonb_array_elements(a->'ingredientsConsumed') l where l->>'ingredientId'=p->>'id'))
    ) then raise exception 'HISTORICAL_ITEM_UNIT_IMMUTABLE'; end if;
    if p->>'category' not in ('drink_recipe','seasoning_recipe') and (p->>'stock')::numeric>0 and (p->>'baseUnit' is distinct from n->>'baseUnit' or n->>'category' in ('drink_recipe','seasoning_recipe')) then raise exception 'STOCK_UNIT_CHANGE_REQUIRES_ZERO'; end if;
  end loop;
  select coalesce(jsonb_object_agg(item_id,quantity),'{}'::jsonb) into movement_totals from bon_erp_private.inventory_changes(s,o);
  for n in select value from jsonb_array_elements(s->'items') loop
    if n->>'category' in ('drink_recipe','seasoning_recipe') then continue; end if;
    select x into p from jsonb_array_elements(o->'items') x where x->>'id'=n->>'id';
    delta:=coalesce((movement_totals->>(n->>'id'))::numeric,0);
    expected:=case when p is null then coalesce((n->>'openingStock')::numeric,(n->>'stock')::numeric) when p->>'category' in ('drink_recipe','seasoning_recipe') then 0 else (p->>'stock')::numeric end;
    if abs((n->>'stock')::numeric-expected-delta)>0.000011 then raise exception 'INVENTORY_MOVEMENT_MISMATCH'; end if;
  end loop;
  for n in select value from jsonb_array_elements(s->'sales_invoices') loop
    if not exists(select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=n->>'id') then
      for t in select value from jsonb_array_elements(n->'items') loop
        select x into e from jsonb_array_elements(s->'items') x where x->>'id'=t->>'itemId';
        if e->>'category' is distinct from t->>'category' or (t->>'category'='drink_recipe' and (not coalesce((e->>'hasRecipe')::boolean,false) or jsonb_array_length(coalesce(e->'recipe','[]'))=0)) then raise exception 'INVALID_SALE_RECIPE'; end if;
      end loop;
    end if;
    if coalesce((n->>'isReturned')::boolean,false) and not exists(select 1 from jsonb_array_elements(o->'sales_invoices') x where x->>'id'=n->>'id' and coalesce((x->>'isReturned')::boolean,false)) then
      if not(n?'returnDebtReversed' and n?'returnRefundAmount') or (n->>'returnDebtReversed')::numeric>(n->>'remainingAmount')::numeric+0.011 or abs((n->>'returnDebtReversed')::numeric+(n->>'returnRefundAmount')::numeric-(n->>'totalAmount')::numeric)>0.011 then raise exception 'RETURN_FINANCIAL_MISMATCH'; end if;
      select coalesce(sum((l->>'totalCost')::numeric),0) into amount from jsonb_array_elements(n->'items') l where l->>'category'='drink_recipe';
      if amount>0 and not exists(select 1 from jsonb_array_elements(s->'expenses') x where x->>'sourceInvoiceId'=n->>'id' and x->>'paidFrom'='تسوية مخزون (بدون نقدية)' and not coalesce((x->>'isCancelled')::boolean,false) and abs((x->>'amount')::numeric-amount)<0.011) then raise exception 'RETURN_CONSUMPTION_COST_REQUIRED'; end if;
    end if;
  end loop;
  for n in select value from jsonb_array_elements(s->'account_payments') loop
    if not exists(select 1 from jsonb_array_elements(o->'account_payments') x where x->>'id'=n->>'id') and not(n?'allocations' and n?'openingBalanceAmount') then raise exception 'PAYMENT_ALLOCATION_REQUIRED'; end if;
  end loop;
  foreach f in array array['sales_invoices','purchase_invoices'] loop
    for n in select value from jsonb_array_elements(s->f) loop
      select x into p from jsonb_array_elements(o->f) x where x->>'id'=n->>'id';
      select coalesce(sum((l->>'amount')::numeric),0) into allocated from jsonb_array_elements(s->'account_payments') a cross join lateral jsonb_array_elements(coalesce(a->'allocations','[]')) l where not(a?'reversedAt') and l->>'invoiceId'=n->>'id';
      select coalesce(sum((l->>'amount')::numeric),0) into old_allocated from jsonb_array_elements(o->'account_payments') a cross join lateral jsonb_array_elements(coalesce(a->'allocations','[]')) l where not(a?'reversedAt') and l->>'invoiceId'=n->>'id';
      if p is null then
        if allocated>(n->>'paidAmount')::numeric+0.011 then raise exception 'PAYMENT_EXCEEDS_INVOICE'; end if;
      elsif abs((n->>'paidAmount')::numeric-(p->>'paidAmount')::numeric-allocated+old_allocated)>0.011 then raise exception 'INVOICE_PAYMENT_HISTORY_MISMATCH'; end if;
    end loop;
  end loop;
  foreach f in array array['customers','suppliers'] loop
    for p in select value from jsonb_array_elements(o->f) loop
      select x into n from jsonb_array_elements(s->f) x where x->>'id'=p->>'id';
      if n is null then
        if (p->>'balance')::numeric>0 then raise exception 'ACCOUNT_WITH_DEBT_NOT_DELETABLE'; end if;
        continue;
      end if;
      delta:=0; additions:=0; new_payments:=0;
      for e in select value from jsonb_array_elements(s->case when f='customers' then 'sales_invoices' else 'purchase_invoices' end) loop
        if coalesce(e->>'customerId',e->>'supplierId')<>p->>'id' then continue; end if;
        select x into old_e from jsonb_array_elements(o->case when f='customers' then 'sales_invoices' else 'purchase_invoices' end) x where x->>'id'=e->>'id';
        if old_e is null then
          delta:=delta+(e->>'remainingAmount')::numeric;
          additions:=additions+(e->>'remainingAmount')::numeric;
          select coalesce(sum((l->>'amount')::numeric),0) into allocated from jsonb_array_elements(s->'account_payments') a cross join lateral jsonb_array_elements(coalesce(a->'allocations','[]')) l where not(a?'reversedAt') and l->>'invoiceId'=e->>'id';
          additions:=additions+allocated;
        else delta:=delta+(e->>'remainingAmount')::numeric-(old_e->>'remainingAmount')::numeric; end if;
        if coalesce((e->>'isReturned')::boolean,false) and not coalesce((old_e->>'isReturned')::boolean,false) then delta:=delta-(e->>'returnDebtReversed')::numeric; end if;
        if coalesce((e->>'isCancelled')::boolean,false) and not coalesce((old_e->>'isCancelled')::boolean,false) then delta:=delta-(e->>'remainingAmount')::numeric; end if;
      end loop;
      for e in select value from jsonb_array_elements(s->'account_payments') loop
        if e->>'targetId'<>p->>'id' or e->>'targetType'<>(case when f='customers' then 'customer' else 'supplier' end) then continue; end if;
        select x into old_e from jsonb_array_elements(o->'account_payments') x where x->>'id'=e->>'id';
        if old_e is null and not(e?'reversedAt') then
          new_payments:=new_payments+(e->>'amount')::numeric;
          delta:=delta-coalesce((e->>'openingBalanceAmount')::numeric,0);
        elsif old_e is not null and not(old_e?'reversedAt') and e?'reversedAt' then
          additions:=additions+(e->>'amount')::numeric;
          delta:=delta+coalesce((e->>'openingBalanceAmount')::numeric,0);
        end if;
      end loop;
      if new_payments>(p->>'balance')::numeric+additions+0.000001 then raise exception 'PAYMENT_EXCEEDS_DEBT'; end if;
      if abs((n->>'balance')::numeric-greatest(0,(p->>'balance')::numeric+delta))>0.011 then raise exception 'ACCOUNT_BALANCE_HISTORY_MISMATCH'; end if;
    end loop;
  end loop;
  for n in select value from jsonb_array_elements(s->'employee_transactions') loop
    if exists(select 1 from jsonb_array_elements(o->'employee_transactions') x where x->>'id'=n->>'id') then continue; end if;
    if n->>'accountingVersion' is distinct from '1' or n->>'payrollPeriod' is null or n->>'partnerId' is null then raise exception 'PAYROLL_ACCOUNTING_REQUIRED'; end if;
    if n->>'type'<>'إقفال شهر' and n->>'payrollPeriod'<>period then raise exception 'PAYROLL_PERIOD_CLOSED'; end if;
    if n->>'type'<>'حضور يومية' and n->>'type'<>'إقفال شهر' and (n->>'amount')::numeric<=0 then raise exception 'INVALID_PAYROLL_AMOUNT'; end if;
    if n->>'type'='إقفال شهر' and (n->>'amount')::numeric<>0 then raise exception 'INVALID_PAYROLL_CLOSING_AMOUNT';end if;
    select x into e from jsonb_array_elements(s->'employees') x where x->>'id'=n->>'employeeId';
    if n->>'type'='حضور يومية' and (e->>'salaryType'<>'يومية' or (n->>'amount')::numeric<>(e->>'dailyRate')::numeric) then raise exception 'PAYROLL_ATTENDANCE_RATE_MISMATCH'; end if;
  end loop;
  for e in select value from jsonb_array_elements(s->'employees') loop
    select x into old_e from jsonb_array_elements(o->'employees') x where x->>'id'=e->>'id';
    select x into c from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'type'='إقفال شهر' and not exists(select 1 from jsonb_array_elements(o->'employee_transactions') y where y->>'id'=x->>'id');
    base_open:=coalesce((old_e->>'openingPayable')::numeric,0);days:=coalesce((old_e->>'workedDaysThisMonth')::numeric,0);advances:=coalesce((old_e->>'totalAdvances')::numeric,0);deductions:=coalesce((old_e->>'totalDeductions')::numeric,0);bonuses:=coalesce((old_e->>'totalBonuses')::numeric,0);paid:=coalesce((old_e->>'totalPaidOut')::numeric,0);
    next_period:=coalesce(old_e->>'payrollPeriod',period);
    if c is not null then
      close_period:=c->>'payrollPeriod';
      if old_e is null or close_period is distinct from next_period or close_period>=period then raise exception 'INVALID_PAYROLL_CLOSING_PERIOD'; end if;
      if (select count(*) from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'type'='إقفال شهر' and not exists(select 1 from jsonb_array_elements(o->'employee_transactions') y where y->>'id'=x->>'id'))<>1 then raise exception 'SAVE_PAYROLL_CLOSING_FIRST'; end if;
      earned:=case when old_e->>'salaryType'='يومية' then days*(old_e->>'dailyRate')::numeric else (old_e->>'baseMonthlySalary')::numeric end;
      t:=c->'closingSummary';
      if abs((t->>'openingPayable')::numeric-base_open)>0.011 or abs((t->>'earned')::numeric-earned)>0.011 or abs((t->>'advances')::numeric-advances)>0.011 or abs((t->>'deductions')::numeric-deductions)>0.011 or abs((t->>'bonuses')::numeric-bonuses)>0.011 or abs((t->>'paidOut')::numeric-paid)>0.011 then raise exception 'PAYROLL_CLOSING_HISTORY_MISMATCH'; end if;
      base_open:=base_open+earned+bonuses-advances-deductions-paid;
      days:=0;advances:=0;deductions:=0;bonuses:=0;paid:=0;
      next_period:=to_char((close_period||'-01')::date+interval '1 month','YYYY-MM');
    end if;
    if coalesce(e->>'payrollPeriod',period) is distinct from next_period or abs(coalesce((e->>'openingPayable')::numeric,0)-base_open)>0.011 then raise exception 'PAYROLL_CARRY_HISTORY_MISMATCH'; end if;
    for t in select jsonb_set(x,'{__delta}','1') from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'payrollPeriod'=next_period and x->>'accountingVersion'='1' and x->>'type'<>'إقفال شهر' and not(x?'reversedAt')
      union all select jsonb_set(x,'{__delta}','-1') from jsonb_array_elements(o->'employee_transactions') x where c is null and x->>'employeeId'=e->>'id' and x->>'payrollPeriod'=next_period and x->>'accountingVersion'='1' and x->>'type'<>'إقفال شهر' and not(x?'reversedAt') loop
      amount:=(t->>'amount')::numeric*(t->>'__delta')::numeric;
      case t->>'type' when 'حضور يومية' then days:=days+(t->>'__delta')::numeric;
      when 'سلفة' then advances:=advances+amount;when 'خصم/عجز' then deductions:=deductions+amount;when 'مكافأة' then bonuses:=bonuses+amount;when 'صرف راتب' then paid:=paid+amount;else null;end case;
    end loop;
    if abs(days-(e->>'workedDaysThisMonth')::numeric)>0.000001 or abs(advances-(e->>'totalAdvances')::numeric)>0.011 or abs(deductions-(e->>'totalDeductions')::numeric)>0.011 or abs(bonuses-(e->>'totalBonuses')::numeric)>0.011 or abs(paid-(e->>'totalPaidOut')::numeric)>0.011 then raise exception 'PAYROLL_COUNTER_HISTORY_MISMATCH'; end if;
    select coalesce(sum((x->>'amount')::numeric),0) into salary from jsonb_array_elements(s->'employee_transactions') x where x->>'employeeId'=e->>'id' and x->>'type'='صرف راتب' and not(x?'reversedAt') and not exists(select 1 from jsonb_array_elements(o->'employee_transactions') y where y->>'id'=x->>'id');
    earned:=case when e->>'salaryType'='يومية' then days*(e->>'dailyRate')::numeric else (e->>'baseMonthlySalary')::numeric end;
    if salary>0 and base_open+earned+bonuses-advances-deductions-paid< -0.000001 then raise exception 'PAYROLL_PAYMENT_EXCEEDS_DUE'; end if;
  end loop;
end $$;
create or replace function bon_erp_private.validate_financial_details(s jsonb,o jsonb) returns void
language plpgsql set search_path='' as $$
declare n jsonb;p jsonb;i jsonb;r jsonb;old_r jsonb;l jsonb;amount numeric;delta numeric;
begin
  for n in select value from jsonb_array_elements(s->'production_batches') loop
    if exists(select 1 from jsonb_array_elements(o->'production_batches') x where x->>'id'=n->>'id') then continue;end if;
    select x into i from jsonb_array_elements(s->'items') x where x->>'id'=n->>'blendId';
    if not coalesce((i->>'hasRecipe')::boolean,false) or jsonb_array_length(coalesce(i->'recipe','[]'))=0 then raise exception 'PRODUCTION_RECIPE_REQUIRED';end if;
    if exists(
      with expected as (
        select c.item_id id,sum(c.quantity) q
        from jsonb_array_elements(i->'recipe') line join jsonb_array_elements(s->'items') raw on raw->>'id'=line->>'ingredientId'
        cross join lateral bon_erp_private.consume_item(s->'items',raw->>'id',bon_erp_private.base_quantity((line->>'quantity')::numeric,line->>'unit',raw->>'baseUnit')*(n->>'quantityProducedKg')::numeric,array[i->>'id']) c group by c.item_id
      ), actual as (
        select line->>'ingredientId' id,sum((line->>'quantityUsed')::numeric) q from jsonb_array_elements(n->'ingredientsConsumed') line group by line->>'ingredientId'
      ) select 1 from expected full join actual using(id) where expected.q is null or actual.q is null or abs(expected.q-actual.q)>0.000011
    )then raise exception 'PRODUCTION_CONSUMPTION_MISMATCH';end if;
    for l in select value from jsonb_array_elements(n->'ingredientsConsumed') loop
      select x into r from jsonb_array_elements(s->'items') x where x->>'id'=l->>'ingredientId';
      select x into old_r from jsonb_array_elements(o->'items') x where x->>'id'=l->>'ingredientId';
      if abs((l->>'cost')::numeric-round((l->>'quantityUsed')::numeric*(r->>'costPrice')::numeric,2))>0.011
        and (old_r is null or abs((l->>'cost')::numeric-round((l->>'quantityUsed')::numeric*(old_r->>'costPrice')::numeric,2))>0.011) then raise exception 'PRODUCTION_INGREDIENT_COST_MISMATCH';end if;
    end loop;
  end loop;
  for n in select value from jsonb_array_elements(s->'purchase_invoices') loop
    if not coalesce((n->>'isCancelled')::boolean,false) or exists(select 1 from jsonb_array_elements(o->'purchase_invoices') x where x->>'id'=n->>'id' and coalesce((x->>'isCancelled')::boolean,false)) then continue;end if;
    if not(n?'inventoryBefore' and n?'inventoryAfter' and n?'refundDue') or jsonb_array_length(n->'inventoryAfter')=0 or abs((n->>'refundDue')::numeric-(n->>'paidAmount')::numeric)>0.011 then raise exception 'PURCHASE_CANCELLATION_EVIDENCE_REQUIRED';end if;
    if exists(select 1 from jsonb_array_elements(o->'purchase_invoices') x where x->>'id'=n->>'id') then
      for i in select value from jsonb_array_elements(n->'inventoryAfter') loop
        select x into r from jsonb_array_elements(o->'items') x where x->>'id'=i->>'id';
        if r is distinct from i then raise exception 'PURCHASE_HAS_LATER_MOVEMENTS';end if;
      end loop;
    end if;
  end loop;
  for n in select value from jsonb_array_elements(s->'expenses') loop
    if exists(select 1 from jsonb_array_elements(o->'expenses') x where x->>'id'=n->>'id') then continue;end if;
    if n->>'category'='مسحوبات شركاء' and n->>'paidFrom'='من جيب الشريك' then raise exception 'WITHDRAWAL_SOURCE_INVALID';end if;
    if n->>'paidFrom'='تسوية مخزون (بدون نقدية)' then
      select x into i from jsonb_array_elements(s->'sales_invoices') x where x->>'id'=n->>'sourceInvoiceId' and coalesce((x->>'isReturned')::boolean,false);
      if i is null or n->>'category'<>'نثريات أخرى' or coalesce((n->>'isCancelled')::boolean,false) then raise exception 'INVALID_NONCASH_RETURN_EXPENSE';end if;
      select coalesce(sum((line->>'totalCost')::numeric),0) into amount from jsonb_array_elements(i->'items') line where line->>'category'='drink_recipe';
      if abs(amount-(n->>'amount')::numeric)>0.011 or (select count(*) from jsonb_array_elements(s->'expenses') x where x->>'sourceInvoiceId'=i->>'id' and not coalesce((x->>'isCancelled')::boolean,false))<>1 then raise exception 'RETURN_EXPENSE_DUPLICATE_OR_AMOUNT';end if;
    elsif n->>'partnerId' is null then raise exception 'EXPENSE_PARTNER_REQUIRED';end if;
  end loop;
  for p in select value from jsonb_array_elements(o->'partners') loop
    select x into n from jsonb_array_elements(s->'partners') x where x->>'id'=p->>'id';
    if n is null then continue;end if;
    select coalesce(sum((x->>'amount')::numeric*sign),0) into delta from (
      select x,1 sign from jsonb_array_elements(s->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
      union all select x,-1 from jsonb_array_elements(o->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
    ) expenses where (x->>'partnerId'=p->>'id' or not(x?'partnerId') and x->>'partnerName'=p->>'name') and x->>'paidFrom'='من جيب الشريك';
    if abs((n->>'totalPaidFromPocket')::numeric-(p->>'totalPaidFromPocket')::numeric-delta)>0.011 then raise exception 'PARTNER_POCKET_HISTORY_MISMATCH';end if;
    select coalesce(sum((x->>'amount')::numeric*sign),0) into delta from (
      select x,1 sign from jsonb_array_elements(s->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
      union all select x,-1 from jsonb_array_elements(o->'expenses') x where not coalesce((x->>'isCancelled')::boolean,false)
    ) expenses where (x->>'partnerId'=p->>'id' or not(x?'partnerId') and x->>'partnerName'=p->>'name') and x->>'category'='مسحوبات شركاء';
    if abs((n->>'totalWithdrawals')::numeric-(p->>'totalWithdrawals')::numeric-delta)>0.011 then raise exception 'PARTNER_WITHDRAWAL_HISTORY_MISMATCH';end if;
  end loop;
end $$;
create or replace function bon_erp_private.save_store(
  p_expected_version bigint, p_state jsonb, p_operation_id uuid, p_queue_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_current public.bon_elagouz_store%rowtype;
  v_receipt public.bon_erp_store_receipts%rowtype;
  v_key text;
  v_hash text := md5(p_state::text);
  v_queue public.cashier_sync_queue%rowtype;
begin
  if v_actor is null or not exists(select 1 from public.erp_members where user_id=v_actor and role='partner') then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version<0 or jsonb_typeof(p_state)<>'object' then
    raise exception 'INVALID_STATE';
  end if;
  select * into v_current from public.bon_elagouz_store where id='main_store' for update;
  if not found then raise exception 'STORE_NOT_INITIALIZED'; end if;
  select * into v_receipt from public.bon_erp_store_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.actor_id<>v_actor or v_receipt.payload_hash<>v_hash or v_receipt.queue_id is distinct from p_queue_id then raise exception 'OPERATION_ID_REUSED'; end if;
    if v_current.version<>v_receipt.version then raise exception 'STORE_CONFLICT'; end if;
    return jsonb_build_object('version',v_receipt.version);
  end if;
  if v_current.version<>p_expected_version then raise exception 'STORE_CONFLICT' using errcode='40001'; end if;
  foreach v_key in array array['items','production_batches','purchase_invoices','sales_invoices','suppliers','customers','expenses','partners','audit_logs','shifts','employees','employee_transactions','stocktaking_records','account_payments','cashier_days'] loop
    if jsonb_typeof(p_state->v_key) is distinct from 'array' then raise exception 'INVALID_STATE: %',v_key; end if;
    if exists(select 1 from jsonb_array_elements(p_state->v_key) r where jsonb_typeof(r)<>'object' or coalesce(r->>'id','')='') then raise exception 'INVALID_ROWS: %',v_key; end if;
    if (select count(*) from jsonb_array_elements(p_state->v_key))<>(select count(distinct r->>'id') from jsonb_array_elements(p_state->v_key) r) then raise exception 'DUPLICATE_IDS: %',v_key; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_state->'partners') p where p ? 'password') then raise exception 'PLAINTEXT_PASSWORD_FORBIDDEN'; end if;
  if (select count(*) from jsonb_array_elements(p_state->'sales_invoices') i where i->>'sourceId' is not null)<>
     (select count(distinct i->>'sourceId') from jsonb_array_elements(p_state->'sales_invoices') i where i->>'sourceId' is not null) then raise exception 'DUPLICATE_CASHIER_SOURCE'; end if;
  -- No partner can accidentally remove the profile linked to a current login.
  if exists(select 1 from public.erp_members m where m.role='partner' and m.partner_id is not null and not exists(select 1 from jsonb_array_elements(p_state->'partners') p where p->>'id'=m.partner_id)) then raise exception 'PARTNER_PROFILE_REQUIRED'; end if;
  if p_queue_id is not null then
    select * into v_queue from public.cashier_sync_queue where id=p_queue_id for update;
    if not found or v_queue.processed then raise exception 'QUEUE_PROCESSED'; end if;
    if not exists(select 1 from jsonb_array_elements(p_state->'sales_invoices') i where i->>'sourceQueueId'=p_queue_id::text and i->>'date'=v_queue.sale_date and length(coalesce(i->>'sourceId',''))=64) and not exists(select 1 from jsonb_array_elements(p_state->'cashier_days') d where d->>'date'=v_queue.sale_date and (d->'itemsReport'->>'sourceQueueId'=p_queue_id::text or d->'financialReport'->>'sourceQueueId'=p_queue_id::text)) then raise exception 'QUEUE_REPORT_REQUIRED'; end if;
  end if;
  update public.bon_elagouz_store set
    version=version+1, updated_at=now(), updated_by=v_actor::text,
    items=p_state->'items',production_batches=p_state->'production_batches',purchase_invoices=p_state->'purchase_invoices',sales_invoices=p_state->'sales_invoices',
    suppliers=p_state->'suppliers',customers=p_state->'customers',expenses=p_state->'expenses',partners=p_state->'partners',audit_logs=p_state->'audit_logs',shifts=p_state->'shifts',
    employees=p_state->'employees',employee_transactions=p_state->'employee_transactions',stocktaking_records=p_state->'stocktaking_records',account_payments=p_state->'account_payments',cashier_days=p_state->'cashier_days'
    where id='main_store';
  if p_queue_id is not null then update public.cashier_sync_queue set processed=true,processed_at=now() where id=p_queue_id; end if;
  insert into public.bon_erp_store_receipts(operation_id,actor_id,version,payload_hash,queue_id) values(p_operation_id,v_actor,v_current.version+1,v_hash,p_queue_id);
  return jsonb_build_object('version',v_current.version+1);
end $$;
create or replace function bon_erp_private.check_store_write() returns trigger
language plpgsql set search_path='' as $$
declare s jsonb:=to_jsonb(new)-array['id','version','updated_at','updated_by'];o jsonb:=to_jsonb(old)-array['id','version','updated_at','updated_by'];
begin
  perform bon_erp_private.validate_payload(s);
  if coalesce(current_setting('bon_erp.restore_user',true),'')=auth.uid()::text then perform bon_erp_private.assert_owner();
  else perform bon_erp_private.validate_changes(s,o);perform bon_erp_private.validate_financial_details(s,o);perform bon_erp_private.validate_section_changes(s,o);end if;
  return new;
end $$;
commit;
