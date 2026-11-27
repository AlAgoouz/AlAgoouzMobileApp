import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
import {emptyStore,fromCloud,toCloud} from '../src/lib/storeState';
import {storeChanges} from '../src/lib/storeChanges';
import type {InventoryItem} from '../src/types/erp';
import {planExcel} from '../src/lib/excelPlan';
import {businessDate} from '../src/lib/dates';
import type {ExcelFile,ExcelSection} from '../src/lib/excelWorkbook';

it('runs the real ERP write guards and rolls back preview documents, audit entries and the receipt',async()=>{
  const db=new PGlite();
  const owner='11111111-1111-4111-8111-111111111111';
  const clerk='22222222-2222-4222-8222-222222222222';
  const item:InventoryItem={id:'bean',code:'BEAN',name:'بن',category:'raw_bean',baseUnit:'kg',stock:10,openingStock:10,minStock:1,costPrice:100,lastPurchasePrice:100,retailPrice:150,wholesalePrice:130,canSellDirectly:true,hasRecipe:false,supplierPrices:[]};
  const partner={id:'p1',username:'owner',name:'Owner',role:'شريك',avatarLetter:'O',phone:'',sharePercent:100,totalPaidFromPocket:0,totalWithdrawals:0};
  const before={...emptyStore,items:[item],partners:[partner]};
  const after={...before,items:[{...item,name:'بن جديد'}],auditLogs:[{id:crypto.randomUUID(),timestamp:new Date().toISOString(),actorId:owner,partnerName:'Owner',actionType:'تعديل وصفة/صنف' as const,description:'Excel workbook test'}]};
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create publication supabase_realtime;
      create schema storage;
      create table storage.objects(id uuid primary key,bucket_id text,name text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      alter table storage.objects enable row level security;
      alter table storage.buckets enable row level security;
      create schema extensions;
      -- PGlite has no Supabase extensions. The Docker integration suite also
      -- exercises this RPC with the production JSON Schema extension enabled.
      create function extensions.jsonb_matches_schema(json,jsonb) returns boolean language sql immutable as 'select true';
    `);
    await db.exec(readFileSync('supabase/schema.sql','utf8'));
    for(const file of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort()){
      if(file.includes('durable_import_dispatch'))continue; // pg_net and pg_cron are unrelated to workbook writes.
      await db.exec(readFileSync('supabase/migrations/'+file,'utf8').replace('create extension if not exists pg_jsonschema with schema extensions;',''));
    }
    await db.exec(`
      insert into auth.users values ('${owner}','owner@local.test',now()),('${clerk}','clerk@local.test',now());
      insert into public.erp_members (user_id,username,role,access_permissions) values
      ('${owner}','owner','partner','{"view":true,"catalog":true}'),('${clerk}','clerk','partner','{"view":true,"sales":true}');
      insert into bon_erp_private.owner_config (id,email,owner_user_id) values (true,'owner@local.test','${owner}');
    `);
    await db.query("insert into public.bon_elagouz_store (id,version,items,partners) values ('main_store',0,$1::jsonb,$2::jsonb)",[JSON.stringify(before.items),JSON.stringify(before.partners)]);
    const asUser=async(id:string)=>{
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      await db.exec('set role authenticated');
    };
    const id='aaa22222-2222-4222-8222-222222222222';
    const rpc=(preview:boolean,version=0,operation=id)=>db.query<{result:{version:number}}>(
      'select public.bon_erp_apply_excel($1::bigint,$2::jsonb,$3::uuid,$4::boolean) as result',
      [version,JSON.stringify(storeChanges(toCloud(before),toCloud(after))),operation,preview],
    );
    const status=()=>db.query(
      "select version::int,items->0->>'name' as name,jsonb_array_length(audit_logs) as entries,(select count(*) from public.bon_erp_store_receipts)::int as receipts from public.bon_elagouz_store",
    ).then(r=>r.rows[0]);
    await asUser(clerk);
    await expect(rpc(true)).rejects.toThrow('USER_PERMISSION_DENIED');
    await asUser(owner);
    expect((await rpc(true)).rows[0].result).toEqual({version:1});
    expect(await status()).toEqual({version:0,name:'بن',entries:0,receipts:0});
    await rpc(false);
    await rpc(false);
    expect(await status()).toEqual({version:1,name:'بن جديد',entries:1,receipts:1});
    await expect(rpc(true,0,crypto.randomUUID())).rejects.toThrow('STORE_CONFLICT');

    const member={userId:owner,role:'partner' as const,partnerId:'p1',displayName:'Owner',username:'owner',isOwner:true,permissions:{}};
    async function approve(section:ExcelSection,rows:ExcelFile['rows']){
      const raw=(await db.query("select * from public.bon_elagouz_store where id='main_store'")).rows[0] as Record<string,unknown>;
      const id=crypto.randomUUID();
      const plan=planExcel({id,section,rows},fromCloud(raw),member,'p1');
      expect(plan.issues,section).toEqual([]);
      const input=[Number(raw.version),JSON.stringify(plan.changes),id];
      await db.query('select public.bon_erp_apply_excel($1::bigint,$2::jsonb,$3::uuid,true)',input);
      expect((await status()).version).toBe(Number(raw.version));
      await db.query('select public.bon_erp_apply_excel($1::bigint,$2::jsonb,$3::uuid,false)',input);
      return fromCloud((await db.query("select * from public.bon_elagouz_store where id='main_store'")).rows[0] as Record<string,unknown>);
    }
    const row=(values:Record<string,string|number>,line=2)=>({line,values});
    const supplier=(await approve('suppliers',{contacts:[row({name:'مورد',phone:'01012345678',address:'القاهرة',representativeName:'مندوب',category:'بن'})]})).suppliers[0];
    const customer=(await approve('customers',{contacts:[row({name:'عميل',phone:'01012345678',area:'القاهرة',type:'جملة - تاجر'})]})).customers[0];
    const employee=(await approve('staff_payroll',{staff:[row({name:'عامل',role:'باريستا',salaryType:'شهري',baseMonthlySalary:1000})]})).employees[0];
    const purchase=await approve('purchase',{new:[row({reference:'P1',date:businessDate(),account:supplier.id,tax:20})],lines:[row({reference:'P1',code:'BEAN',quantity:5,price:160})]});
    expect(purchase.items[0]).toMatchObject({stock:15,costPrice:120});
    expect(purchase.purchaseInvoices[0]).toMatchObject({totalAmount:820,paidAmount:820,remainingAmount:0});
    await approve('products',{products:[row({name:'توليفة اختبـار',code:'BLEND',category:'توليفات',unit:'kg',retail:200})]});
    await approve('recipes',{ingredients:[row({code:'BLEND',ingredient:'BEAN',quantity:1000,unit:'gram'})]});
    const production=await approve('production',{new:[row({code:'BLEND',quantity:4})]});
    expect(production.productionBatches[0]).toMatchObject({quantityProducedKg:4,totalBatchCost:480});
    const sale=await approve('sales_pos',{new:[row({reference:'S1',date:businessDate(),account:customer.id,method:'آجل',paid:60})],lines:[row({reference:'S1',code:'BLEND',quantity:2,price:200})]});
    expect(sale.salesInvoices[0]).toMatchObject({totalAmount:400,paidAmount:60,remainingAmount:340,totalCost:240});
    const collection=await approve('customers',{payments:[row({account:customer.id,amount:100})]});
    expect(collection.customers[0].balance).toBe(240);
    expect(collection.salesInvoices[0].remainingAmount).toBe(240);
    const payroll=await approve('staff_payroll',{new:[row({account:employee.id,type:'صرف راتب',amount:300,source:'خزنة الشركة'})]});
    expect(payroll.employees[0].totalPaidOut).toBe(300);
    expect(payroll.expenses[0].sourceEmployeeTransactionId).toBe(payroll.employeeTransactions[0].id);
    const withdrawal=await approve('partners',{new:[row({date:businessDate(),account:'p1',type:'مسحوب',title:'سحب',amount:80,source:'خزنة الشركة'})]});
    expect(withdrawal.partners[0].totalWithdrawals).toBe(80);
  }finally{await db.close();}
},90000);
