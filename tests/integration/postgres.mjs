import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
const container=process.env.AGOUZ_TEST_PG_CONTAINER || 'agouz_mobile_validation-db-1';
export const database='agouz_validation_'+crypto.randomBytes(6).toString('hex');
export function sql(text,db=database) {
  return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-XqAt','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',windowsHide:true,timeout:60000,stdio:['pipe','pipe','pipe']}).trim();
}
export function literal(value){return "'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";}
export function setup(){
  const labels=JSON.parse(execFileSync('docker',['inspect','--format','{{json .Config.Labels}}',container],{encoding:'utf8',windowsHide:true}));
  if(labels['app.agouz.purpose']!=='isolated-validation') throw new Error('Refusing to use an unrelated database container');
  sql(`create database ${database};`,'postgres');
  sql(`create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`);
  sql(`create schema storage;create table storage.objects(id uuid primary key,bucket_id text,name text);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);alter table storage.objects enable row level security;alter table storage.buckets enable row level security;`);
  sql(fs.readFileSync('supabase/schema.sql','utf8'));
  for(const file of fs.readdirSync('supabase/migrations').filter((name)=>name.endsWith('.sql')).sort()) sql(fs.readFileSync('supabase/migrations/'+file,'utf8'));
}
export function dispose(){
  if(!/^agouz_validation_[a-f0-9]{12}$/.test(database)) throw new Error('Invalid disposable database');
  sql(`drop database ${database} with(force);`,'postgres');
}
