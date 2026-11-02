import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {sha256,decryptFile} from './archive.mjs';

const root=resolve(process.env.AGOUZ_BACKUP_ROOT || 'D:/AgouzPrivateBackups');
const work=resolve(process.argv[2] || '');
if(!work.startsWith(resolve(root,'pending')+sep))throw new Error('RESTORE_WORKSPACE_REFUSED');
const pg=process.env.AGOUZ_PG_BIN;
if(!pg)throw new Error('POSTGRES_TOOLS_NOT_CONFIGURED');
const nonce=randomBytes(6).toString('hex'),prefix='agouz-restore-'+nonce;
const dbContainer=prefix+'-db',authContainer=prefix+'-auth',network=prefix;
const volume=prefix+'-data';
const database='agouz_recovery_'+nonce,password=randomBytes(32).toString('hex');
const jwtSecret=randomBytes(48).toString('hex');
const restore=join(work,'restore-'+nonce);mkdirSync(restore,{mode:0o700});
const pgdata=join(restore,'pgdata');mkdirSync(pgdata,{mode:0o700});
const receipt=JSON.parse(readFileSync(join(work,'receipt.json'),'utf8'));
let manifest,proof;
const inputs=join(restore,'inputs');mkdirSync(inputs,{mode:0o700});
let pgEnv,createdNetwork=false,createdDB=false,createdAuth=false,createdVolume=false;
function run(exe,args,env=process.env,input){
  try{return execFileSync(exe,args,{encoding:'utf8',env,input,windowsHide:true,timeout:180000,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});}
  catch(error){writeFileSync(join(restore,'failure.private.log'),error.stderr || String(error.code),{mode:0o600});throw new Error('RESTORE_TOOL_FAILED: '+exe.split(/[\\/]/).pop());}
}
const pgTool=(name)=>join(pg,name+(process.platform==='win32'?'.exe':''));
function sql(query,db=database){return run(pgTool('psql'),['-XqAt','-v','ON_ERROR_STOP=1','-d',db],pgEnv,query).trim();}
const literal=(s)=>"'"+s.replaceAll("'","''")+"'";
function port(container,internal){
  const value=run('docker',['port',container,internal+'/tcp']).trim();
  const match=value.match(/^127\.0\.0\.1:(\d+)$/);
  if(!match)throw new Error('RESTORE_PORT_NOT_LOOPBACK');return match[1];
}
async function waitUntil(check){
  for(let i=0;i<180;i++){if(await check())return;await new Promise((resolve)=>setTimeout(resolve,1000));}
  throw new Error('RESTORE_START_TIMEOUT');
}
function copies(text){
  const result={};const lines=text.replaceAll('\r\n','\n').split('\n');
  for(let i=0;i<lines.length;i++){
    if(!/^COPY .* FROM stdin;$/.test(lines[i]))continue;
    const heading=lines[i],rows=[];
    while(++i<lines.length&&lines[i]!=='\\.')rows.push(lines[i]);
    if(i===lines.length)throw new Error('RESTORE_COPY_BLOCK_INVALID');
    result[heading]={rows:rows.length,sha256:createHash('sha256').update(rows.sort().join('\n')).digest('hex')};
  }
  result['SEQUENCES']=lines.filter((line)=>/^SELECT pg_catalog\.setval\(/.test(line)).sort();
  return result;
}
function jwt(){
  const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body=Buffer.from(JSON.stringify({role:'service_role',aud:'authenticated',iss:'supabase',iat:now,exp:now+3600})).toString('base64url');
  return header+'.'+body+'.'+createHmac('sha256',jwtSecret).update(header+'.'+body).digest('base64url');
}
try{
  if(await sha256(join(work,'downloaded.agouz'))!==receipt.encryptedSha256)throw new Error('RESTORE_ENCRYPTED_HASH_MISMATCH');
  const decrypted=join(restore,'downloaded.tar.gz');
  await decryptFile(join(work,'downloaded.agouz'),decrypted,Buffer.from(readFileSync(join(root,'recovery-key.base64'),'utf8').trim(),'base64'));
  const entries=run('tar',['-tzf',decrypted]).trim().split(/\r?\n/).sort();
  if(JSON.stringify(entries)!==JSON.stringify(['database.dump','manifest.json','roles.sql','source.tar']))throw new Error('RESTORE_ARCHIVE_ENTRIES_REFUSED');
  run('tar',['-xzf',decrypted,'-C',inputs]);
  manifest=JSON.parse(readFileSync(join(inputs,'manifest.json'),'utf8'));
  if(manifest.project!=='srinizbfqozvdqsuvvbc'||manifest.generation!==receipt.generation)throw new Error('RESTORE_MANIFEST_MISMATCH');
  for(const [name,hash]of Object.entries(manifest.files)){
    if(!['database.dump','roles.sql','source.tar'].includes(name)||await sha256(join(inputs,name))!==hash)throw new Error('RESTORE_INPUT_HASH_MISMATCH');
  }
  console.log('Starting isolated restore on the Docker data disk.');
  run('docker',['network','create','--label','app.agouz.purpose=isolated-recovery',network]);createdNetwork=true;
  run('docker',['volume','create','--label','app.agouz.purpose=isolated-recovery',volume]);createdVolume=true;
  const dbEnv=join(restore,'database.env');writeFileSync(dbEnv,'POSTGRES_PASSWORD='+password+'\nPOSTGRES_USER=supabase_admin\n',{mode:0o600});
  run('docker',['run','-d','--pull','never','--name',dbContainer,'--label','app.agouz.purpose=isolated-recovery','--network',network,'--env-file',dbEnv,'--mount','type=volume,source='+volume+',target=/var/lib/postgresql/data','--publish','127.0.0.1::5432','public.ecr.aws/supabase/postgres:17.11.0.004']);createdDB=true;
  pgEnv={...process.env,PGHOST:'127.0.0.1',PGPORT:port(dbContainer,5432),PGUSER:'supabase_admin',PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'3',PGOPTIONS:'-c timezone=UTC'};
  await waitUntil(()=>{try{sql('select 1;','postgres');return true;}catch{return false;}});
  if(!/^agouz_recovery_[a-f0-9]{12}$/.test(database))throw new Error('RESTORE_DATABASE_REFUSED');
  sql('create database '+database+' template template0;','postgres');
  const roles=Array.from(readFileSync(join(inputs,'roles.sql'),'utf8').matchAll(/^CREATE ROLE (.+);$/gm),m=>m[1].replace(/^"|"$/g,'').replaceAll('""','"'));
  for(const role of roles){
    sql(`do $$begin if not exists(select 1 from pg_roles where rolname=${literal(role)})then execute format('create role %I nologin',${literal(role)});end if;end$$;`);
  }
  run(pgTool('pg_restore'),['--exit-on-error','--no-owner','--dbname',database,join(inputs,'database.dump')],pgEnv);
  console.log('Database restored; comparing every COPY table and sequence before testing login.');
  const original=join(restore,'original-data.sql'),restored=join(restore,'restored-data.sql');
  run(pgTool('pg_restore'),['--data-only','--file',original,join(inputs,'database.dump')]);
  run(pgTool('pg_dump'),['--data-only','--no-owner','--dbname',database,'--file',restored],pgEnv);
  const expected=copies(readFileSync(original,'utf8')),actual=copies(readFileSync(restored,'utf8'));
  if(JSON.stringify(Object.keys(expected).sort())!==JSON.stringify(Object.keys(actual).sort()))throw new Error('RESTORE_TABLE_SET_MISMATCH');
  for(const name of Object.keys(expected))if(JSON.stringify(expected[name])!==JSON.stringify(actual[name]))throw new Error('RESTORE_TABLE_DATA_MISMATCH: '+name.split('(')[0]);
  const authUsers=Number(sql('select count(*) from auth.users;'));
  if(authUsers!==manifest.inventory.auth_users)throw new Error('RESTORE_AUTH_USER_COUNT_MISMATCH');
  const authEnv=join(restore,'auth.env');
  writeFileSync(authEnv,[
    'GOTRUE_DB_DRIVER=postgres','GOTRUE_DB_DATABASE_URL=postgres://supabase_admin:'+password+'@'+dbContainer+':5432/'+database+'?sslmode=disable',
    'GOTRUE_DB_NAMESPACE=auth','GOTRUE_API_HOST=0.0.0.0','GOTRUE_API_PORT=9999','API_EXTERNAL_URL=http://localhost:9999',
    'GOTRUE_SITE_URL=http://localhost','GOTRUE_JWT_SECRET='+jwtSecret,'GOTRUE_JWT_ADMIN_ROLES=service_role','GOTRUE_JWT_AUD=authenticated',
    'GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','GOTRUE_MAILER_AUTOCONFIRM=true','GOTRUE_DISABLE_SIGNUP=false',
  ].join('\n')+'\n',{mode:0o600});
  run('docker',['run','-d','--pull','never','--name',authContainer,'--label','app.agouz.purpose=isolated-recovery','--network',network,'--env-file',authEnv,'--publish','127.0.0.1::9999','public.ecr.aws/supabase/gotrue:v2.197.0']);createdAuth=true;
  const authURL='http://127.0.0.1:'+port(authContainer,9999);
  await waitUntil(async()=>{try{return(await fetch(authURL+'/health',{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}});
  const testEmail='restore-'+nonce+'@example.test',testPassword=randomBytes(24).toString('base64url');
  const created=await fetch(authURL+'/admin/users',{method:'POST',headers:{Authorization:'Bearer '+jwt(),'Content-Type':'application/json'},body:JSON.stringify({email:testEmail,password:testPassword,email_confirm:true}),signal:AbortSignal.timeout(15000)});
  if(!created.ok)throw new Error('RESTORE_SYNTHETIC_USER_FAILED');
  const login=await fetch(authURL+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:testEmail,password:testPassword}),signal:AbortSignal.timeout(15000)});
  const session=await login.json();
  if(!login.ok||!session.access_token||session.user?.email!==testEmail)throw new Error('RESTORE_LOGIN_FAILED');
  const generated=await fetch(authURL+'/admin/generate_link',{method:'POST',headers:{Authorization:'Bearer '+jwt(),'Content-Type':'application/json'},body:JSON.stringify({type:'recovery',email:testEmail}),signal:AbortSignal.timeout(15000)});
  const recovery=await generated.json();
  if(!generated.ok||!recovery.hashed_token)throw new Error('RESTORE_RECOVERY_LINK_FAILED');
  const verified=await fetch(authURL+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'recovery',token_hash:recovery.hashed_token}),signal:AbortSignal.timeout(15000)});
  const recovered=await verified.json();
  if(!verified.ok||!recovered.access_token)throw new Error('RESTORE_RECOVERY_TOKEN_FAILED');
  const newPassword=randomBytes(24).toString('base64url');
  const changed=await fetch(authURL+'/user',{method:'PUT',headers:{Authorization:'Bearer '+recovered.access_token,'Content-Type':'application/json'},body:JSON.stringify({password:newPassword}),signal:AbortSignal.timeout(15000)});
  if(!changed.ok)throw new Error('RESTORE_RECOVERY_PASSWORD_FAILED');
  const logout=await fetch(authURL+'/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+recovered.access_token},signal:AbortSignal.timeout(15000)});
  if(!logout.ok)throw new Error('RESTORE_RECOVERY_LOGOUT_FAILED');
  const refresh=await fetch(authURL+'/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:recovered.refresh_token}),signal:AbortSignal.timeout(15000)});
  if(refresh.ok)throw new Error('RESTORE_RECOVERY_SESSION_NOT_REVOKED');
  const oldLogin=await fetch(authURL+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:testEmail,password:testPassword}),signal:AbortSignal.timeout(15000)});
  const newLogin=await fetch(authURL+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:testEmail,password:newPassword}),signal:AbortSignal.timeout(15000)});
  if(oldLogin.ok||!newLogin.ok)throw new Error('RESTORE_RECOVERY_NEW_LOGIN_FAILED');
  proof={generation:receipt.generation,verifiedAt:new Date().toISOString(),encryptedSha256:receipt.encryptedSha256,allTableDataMatched:true,tablesCompared:Object.keys(expected).length-1,authUsersRestored:authUsers,syntheticAuthLoginVerified:true,syntheticPasswordRecoveryVerified:true,restoredFromDownloadedArchive:true,productionWrites:false,restoreVerified:true};
}catch(error){
  for(const name of [dbContainer,authContainer]){try{const logs=spawnSync('docker',['logs','--tail','100',name],{encoding:'utf8',windowsHide:true,timeout:15000});writeFileSync(join(restore,name+'.private.log'),(logs.stdout||'')+(logs.stderr||''),{mode:0o600});}catch{}}
  console.error(error.message);process.exitCode=1;
}
finally{
  for(const [name,created]of [[authContainer,createdAuth],[dbContainer,createdDB]]){
    if(!created)continue;
    try{const label=run('docker',['inspect','--format','{{index .Config.Labels "app.agouz.purpose"}}',name]).trim();if(label!=='isolated-recovery'||!name.startsWith(prefix))throw new Error('RESTORE_CLEANUP_REFUSED');run('docker',['rm','-f',name]);}catch{console.error('RESTORE_CLEANUP_FAILED');process.exitCode=1;}
  }
  if(createdNetwork){try{run('docker',['network','rm',network]);}catch{console.error('RESTORE_NETWORK_CLEANUP_FAILED');process.exitCode=1;}}
  if(createdVolume){try{const label=run('docker',['volume','inspect','--format','{{index .Labels "app.agouz.purpose"}}',volume]).trim();if(label!=='isolated-recovery'||!volume.startsWith(prefix))throw new Error('RESTORE_VOLUME_REFUSED');run('docker',['volume','rm',volume]);}catch{console.error('RESTORE_VOLUME_CLEANUP_FAILED');process.exitCode=1;}}
}
if(proof&&!process.exitCode){
  proof.cleanupComplete=true;
  writeFileSync(join(work,'restore-proof.json'),JSON.stringify(proof,null,2),{mode:0o600});
  console.log(JSON.stringify(proof));
}
