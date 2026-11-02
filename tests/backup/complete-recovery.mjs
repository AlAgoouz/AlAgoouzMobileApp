// Genuine PostgreSQL + Auth + Storage source and destination, using synthetic data only.
import {execFileSync,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {randomBytes,createHmac} from 'node:crypto';
import {encryptFile,sha256} from '../../scripts/backup/archive.mjs';
import {storageSnapshotSQL,vaultSnapshotSQL,downloadStorage,storagePath} from '../../scripts/backup/resources.mjs';
const root=resolve(process.env.AGOUZ_BACKUP_ROOT||'');
if(!process.env.AGOUZ_BACKUP_ROOT||!process.env.AGOUZ_PG_BIN)throw Error('ISOLATED_TEST_ROOT_REQUIRED');
const nonce=randomBytes(6).toString('hex'),prefix='agouz-backup-source-'+nonce,network=prefix;
const db=prefix+'-db',auth=prefix+'-auth',storageAPI=prefix+'-storage',dbVolume=prefix+'-db-data',fileVolume=prefix+'-file-data';
const password=randomBytes(24).toString('hex'),secret=randomBytes(48).toString('hex');
const generation=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(4).toString('hex'),work=join(root,'pending',generation);
fs.mkdirSync(work,{recursive:true,mode:0o700});
const created=[];let pgEnv;
function run(exe,args,env=process.env,input){try{return execFileSync(exe,args,{env,input,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});}catch(error){fs.writeFileSync(join(work,'source-failure.private.log'),error.stderr||String(error.code),{mode:0o600});const diagnostic=String(error.stderr||error.code).split('\n').filter(line=>/ERROR:|FATAL:|DETAIL:/.test(line)).join('\n').replaceAll(password,'[redacted]').replaceAll(secret,'[redacted]');if(diagnostic)console.error(diagnostic);throw Error('ISOLATED_SOURCE_TOOL_FAILED');}}
const pg=name=>join(process.env.AGOUZ_PG_BIN,name+(process.platform==='win32'?'.exe':''));
const sql=query=>run(pg('psql'),['-XqAt','-v','ON_ERROR_STOP=1','-d','agouz_source'],pgEnv,query).trim();
async function wait(check){for(let i=0;i<120;i++){try{if(await check())return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('ISOLATED_SOURCE_START_TIMEOUT');}
function port(name,n){const text=run('docker',['port',name,n+'/tcp']).trim();const m=text.match(/^127\.0\.0\.1:(\d+)$/);if(!m)throw Error('ISOLATED_SOURCE_PORT_REFUSED');return m[1];}
function jwt(role='service_role'){const now=Math.floor(Date.now()/1000),h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role,aud:'authenticated',iat:now,exp:now+3600})).toString('base64url');return h+'.'+b+'.'+createHmac('sha256',secret).update(h+'.'+b).digest('base64url');}
function container(name,image,env,extra=[]){const file=join(work,name+'.env');fs.writeFileSync(file,env.join('\n')+'\n',{mode:0o600});run('docker',['run','-d','--pull','never','--name',name,'--label','app.agouz.purpose=isolated-backup-source','--network',network,'--env-file',file,...extra,image]);created.push(['container',name]);}
async function api(base,path,body,type='application/json',method='POST'){const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+jwt(),'Content-Type':type,'x-upsert':'true'},body:body===undefined?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!r.ok){const text=await r.text();fs.writeFileSync(join(work,'api-failure.private.log'),text,{mode:0o600});const error=JSON.parse(text);console.error('Synthetic API failure',path,JSON.stringify({code:error.code,error:error.error,message:error.message}).replaceAll(password,'[redacted]').replaceAll(secret,'[redacted]'));throw Error('ISOLATED_SOURCE_API_FAILED_'+r.status);}return r;}
try{
 run('docker',['network','create','--label','app.agouz.purpose=isolated-backup-source',network]);created.push(['network',network]);
 for(const volume of [dbVolume,fileVolume]){run('docker',['volume','create','--label','app.agouz.purpose=isolated-backup-source',volume]);created.push(['volume',volume]);}
 container(db,'public.ecr.aws/supabase/postgres:17.11.0.004',['POSTGRES_PASSWORD='+password,'POSTGRES_USER=supabase_admin'],['--mount','type=volume,source='+dbVolume+',target=/var/lib/postgresql/data','--publish','127.0.0.1::5432']);
 pgEnv={...process.env,PGHOST:'127.0.0.1',PGPORT:port(db,5432),PGUSER:'supabase_admin',PGPASSWORD:password,PGSSLMODE:'disable',PGOPTIONS:'-c timezone=UTC'};
 await wait(()=>{run(pg('psql'),['-XqAt','-d','postgres','-c','select 1;'],pgEnv);return true;});
 run(pg('psql'),['-XqAt','-v','ON_ERROR_STOP=1','-d','postgres','-c','create database agouz_source template template0;'],pgEnv);
 sql("create schema auth; create schema extensions;create schema if not exists vault;create extension pgcrypto with schema extensions;create extension if not exists supabase_vault with schema vault;create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;grant usage on schema public,auth to anon,authenticated,service_role;");
 container(auth,'public.ecr.aws/supabase/gotrue:v2.197.0',['GOTRUE_DB_DRIVER=postgres','GOTRUE_DB_DATABASE_URL=postgres://supabase_admin:'+password+'@'+db+':5432/agouz_source?sslmode=disable','GOTRUE_DB_NAMESPACE=auth','GOTRUE_API_HOST=0.0.0.0','GOTRUE_API_PORT=9999','API_EXTERNAL_URL=http://localhost:9999','GOTRUE_SITE_URL=http://localhost','GOTRUE_JWT_SECRET='+secret,'GOTRUE_JWT_ADMIN_ROLES=service_role','GOTRUE_JWT_AUD=authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','GOTRUE_MAILER_AUTOCONFIRM=true'],['--publish','127.0.0.1::9999']);
 const authURL='http://127.0.0.1:'+port(auth,9999);await wait(async()=> (await fetch(authURL+'/health')).ok);
 const user=await(await api(authURL,'/admin/users',{email:'backup-smoke@example.test',password:randomBytes(24).toString('base64url'),email_confirm:true})).json();
 container(storageAPI,'public.ecr.aws/supabase/storage-api:v1.87.2',['DATABASE_URL=postgres://supabase_admin:'+password+'@'+db+':5432/agouz_source','DB_SUPER_USER=supabase_admin','AUTH_JWT_SECRET='+secret,'PGRST_JWT_SECRET='+secret,'ANON_KEY='+jwt('anon'),'SERVICE_KEY='+jwt(),'STORAGE_BACKEND=file','STORAGE_FILE_BACKEND_PATH=/var/lib/storage','FILE_STORAGE_BACKEND_PATH=/var/lib/storage','SERVER_HOST=0.0.0.0','SERVER_PORT=5000','TENANT_ID=stub','REGION=local','GLOBAL_S3_BUCKET=stub','IMAGE_TRANSFORMATION_ENABLED=false','ENABLE_IMAGE_TRANSFORMATION=false','PG_QUEUE_ENABLE=false'],['--mount','type=volume,source='+fileVolume+',target=/var/lib/storage','--publish','127.0.0.1::5000']);
 const storageURL='http://127.0.0.1:'+port(storageAPI,5000);await wait(async()=> (await fetch(storageURL+'/status')).ok);
 sql('grant usage on schema storage to service_role;grant all on all tables in schema storage to service_role;grant usage,select on all sequences in schema storage to service_role;create publication supabase_realtime;');
 sql(fs.readFileSync('supabase/schema.sql','utf8'));
 for(const file of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())sql(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const partner={id:'p1',name:'Synthetic Owner',username:'owner',role:'مدير',avatarLetter:'O',phone:'',sharePercent:100,totalPaidFromPocket:0,totalWithdrawals:0};
 sql(`insert into public.bon_elagouz_store(id,partners)values('main_store','${JSON.stringify([partner])}'::jsonb);insert into public.erp_members(user_id,username,partner_id,role)values('${user.id}','owner','p1','partner');insert into bon_erp_private.owner_config(id,email)values(true,'backup-smoke@example.test');insert into bon_erp_private.storage_backup_principal(id,user_id)values(true,'${user.id}');`);
 await api(storageURL,'/bucket',{id:'agouz-test-private',name:'agouz-test-private',public:false});
 const files=[['nested/صورة.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=','base64'),'image/png'],['مستندات/ملف تجريبي.bin',randomBytes(256*1024),'application/octet-stream'],['empty.txt',Buffer.alloc(0),'text/plain']];
 for(const [name,bytes,type]of files)await api(storageURL,'/object/'+storagePath('agouz-test-private',name),bytes,type);
 sql(`update storage.objects set owner='${user.id}',owner_id='${user.id}',user_metadata='{"tag":"خاص"}'::jsonb;select vault.create_secret('synthetic ''quoted'' secret with عربي', 'agouz-smoke-secret','synthetic only');select vault.create_secret('line one'||chr(10)||'line two',null,'unnamed synthetic');`);
 const storage=JSON.parse(sql(storageSnapshotSQL)),vault=JSON.parse(sql(vaultSnapshotSQL));
 run(pg('pg_dump'),['--format=custom','--exclude-table-data=vault.secrets','--dbname','agouz_source','--file',join(work,'database.dump')],pgEnv);
 run(pg('pg_dumpall'),['--roles-only','--no-role-passwords','--file',join(work,'roles.sql')],pgEnv);
 run('git',['archive','--format=tar','--output',join(work,'source.tar'),'HEAD']);
 const hashes=await downloadStorage(storage.objects,work,{baseURL:storageURL,token:jwt(),apikey:jwt()});
 fs.writeFileSync(join(work,'storage-index.json'),JSON.stringify(storage));fs.writeFileSync(join(work,'vault-secrets.json'),JSON.stringify(vault));fs.writeFileSync(join(work,'recovery-config.json'),JSON.stringify({project:'srinizbfqozvdqsuvvbc',encryptionKeyIncluded:false,providerSettings:{testOnly:true}}));
 for(const file of ['database.dump','roles.sql','source.tar','storage-index.json','vault-secrets.json','recovery-config.json'])hashes[file]=await sha256(join(work,file));
 const manifest={format:'agouz-full-logical-backup',version:2,project:'srinizbfqozvdqsuvvbc',generation,inventory:{auth_users:1,storage_objects:files.length,vault_secrets:2},files:hashes};
 fs.writeFileSync(join(work,'manifest.json'),JSON.stringify(manifest));
 run('tar',['-czf',join(work,'archive.tar.gz'),'-C',work,'database.dump','roles.sql','source.tar','manifest.json','storage-index.json','vault-secrets.json','recovery-config.json','storage']);
 const key=randomBytes(32);fs.writeFileSync(join(root,'recovery-key.base64'),key.toString('base64'),{flag:'wx',mode:0o600});
 await encryptFile(join(work,'archive.tar.gz'),join(work,'downloaded.agouz'),key);
 fs.writeFileSync(join(work,'receipt.json'),JSON.stringify({...manifest,encryptedSha256:await sha256(join(work,'downloaded.agouz'))}));
 const result=spawnSync(process.execPath,['scripts/backup/verify-restore.mjs',work],{env:process.env,stdio:'inherit',windowsHide:true});
 if(result.status!==0)throw Error('ISOLATED_FULL_RECOVERY_FAILED');
 const proof=JSON.parse(fs.readFileSync(join(work,'restore-proof.json'),'utf8'));
 if(proof.storageFilesVerified!==3||proof.vaultSecretsVerified!==2||!proof.storageOwnershipMatched)throw Error('ISOLATED_RESOURCE_PROOF_INCOMPLETE');
 fs.writeFileSync('complete-backup-recovery-proof.json',JSON.stringify({...proof,syntheticSourceOnly:true},null,2));
 console.log('Synthetic image, binary and empty file plus two Vault secrets restored and verified.');
}catch(error){console.error(error.message);process.exitCode=1;for(const [kind,name]of created)if(kind==='container'){try{const r=spawnSync('docker',['logs','--tail','80',name],{encoding:'utf8'});fs.writeFileSync(join(work,name+'.private.log'),(r.stdout||'')+(r.stderr||''));}catch{}}}
finally{
 for(const [kind,name]of created.reverse()){
  try{const label=run('docker',[kind==='container'?'inspect':kind,'inspect',name].filter((x,i,a)=>!(kind==='container'&&i===1))).trim();const data=JSON.parse(label)[0];const purpose=kind==='container'?data.Config.Labels?.['app.agouz.purpose']:data.Labels?.['app.agouz.purpose'];if(purpose!=='isolated-backup-source'||!name.startsWith(prefix))throw Error('SOURCE_CLEANUP_REFUSED');run('docker',kind==='container'?['rm','-f',name]:[kind,'rm',name]);}catch{console.error('ISOLATED_SOURCE_CLEANUP_FAILED');process.exitCode=1;}
 }
}
