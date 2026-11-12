// Full logical database export. This stage does NOT mark a backup as restore-verified.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {encryptFile,decryptFile,sha256} from './archive.mjs';
import {storageSnapshotSQL,vaultSnapshotSQL,storageReaderToken,downloadStorage,writeRecoveryConfig,assertStorageCoverage} from './resources.mjs';
import {captureProviderSettings} from './provider-settings.mjs';

const project=process.env.AGOUZ_SUPABASE_PROJECT_REF || 'srinizbfqozvdqsuvvbc';
const expectedDriveFolderId=process.env.AGOUZ_DRIVE_ROOT_FOLDER_ID || '1Y0woq-P9w6C5zvPVlgmVTZDGEWOPhig4';
const root=resolve(process.env.AGOUZ_BACKUP_ROOT || 'D:/AgouzPrivateBackups');
const cli=process.env.AGOUZ_SUPABASE_CLI;
const pg=process.env.AGOUZ_PG_BIN;
const drive=process.env.AGOUZ_RCLONE;
const driveConfig=process.env.AGOUZ_RCLONE_CONFIG;
if((!cli&&!process.env.AGOUZ_DATABASE_URL)||!pg||!drive||!driveConfig) throw new Error('BACKUP_TOOLS_NOT_CONFIGURED');
const config=readFileSync(driveConfig,'utf8');
const escapedFolderId=expectedDriveFolderId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
if(!new RegExp(`^root_folder_id\\s*=\\s*${escapedFolderId}\\s*$`,'m').test(config)) throw new Error('BACKUP_DRIVE_FOLDER_MISMATCH');
const generation=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(4).toString('hex');
const work=join(root,'pending',generation);
mkdirSync(work,{recursive:true,mode:0o700});
let sourceEnv;
function run(exe,args,env=process.env){
  try{return execFileSync(exe,args,{encoding:'utf8',env,windowsHide:true,timeout:180000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});}
  catch(error){
    // Tool stderr can include connection details. Keep it private and report a fixed code.
    writeFileSync(join(work,'failure.private.log'),error.stderr || String(error.code),{mode:0o600});
    throw new Error('BACKUP_TOOL_FAILED: '+exe.split(/[\\/]/).pop());
  }
}
function parseEnvironment(script){
  const values={};
  for(const match of script.matchAll(/^export\s+(PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=(.*)$/gm)){
    let value=match[2].trim();
    if(value.startsWith('"')&&value.endsWith('"')) value=value.slice(1,-1).replace(/\\([\\"$`])/g,'$1');
    else if(value.startsWith("'")&&value.endsWith("'")) value=value.slice(1,-1).replaceAll("'\"'\"'","'");
    else if(!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error('BACKUP_CONNECTION_FORMAT_UNSUPPORTED');
    values[match[1]]=value;
  }
  if(Object.keys(values).length!==5||!(values.PGHOST.includes(project)||values.PGUSER.includes(project))) throw new Error('BACKUP_SOURCE_MISMATCH');
  return {...process.env,...values,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20',PGOPTIONS:'-c role=postgres -c default_transaction_read_only=on'};
}
try{
  let roleArgs=['--role=postgres'];
  if(process.env.AGOUZ_DATABASE_URL){
    const url=new URL(process.env.AGOUZ_DATABASE_URL);
    if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.username)!=='agouz_backup.'+project||!url.hostname.endsWith('.pooler.supabase.com'))throw new Error('BACKUP_SOURCE_MISMATCH');
    sourceEnv={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'postgres',PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20',PGOPTIONS:'-c default_transaction_read_only=on'};
    delete sourceEnv.AGOUZ_DATABASE_URL;
    roleArgs=[];
  }else{
    const connectionScript=run(cli,['db','dump','--project-ref',project,'--dry-run']);
    sourceEnv=parseEnvironment(connectionScript);
  }
  const pgTool=(name)=>join(pg,name+(process.platform==='win32'?'.exe':''));
  const query=(sql)=>JSON.parse(run(pgTool('psql'),['-XqAt','-v','ON_ERROR_STOP=1','-c',(roleArgs.length?'set role postgres; ':'')+sql],sourceEnv));
  const storage=query(storageSnapshotSQL),vault=query(vaultSnapshotSQL);
  assertStorageCoverage(query);
  run(pgTool('pg_dump'),[...roleArgs,'--exclude-table-data=vault.secrets','--format=custom','--file',join(work,'database.dump')],sourceEnv);
  run(pgTool('pg_dumpall'),[...roleArgs,'--roles-only','--no-role-passwords','--file',join(work,'roles.sql')],sourceEnv);
  const inventory=JSON.parse(run(pgTool('psql'),['-XqAt','-v','ON_ERROR_STOP=1','-c',(roleArgs.length?'set role postgres; ':'')+"select json_build_object('auth_users',(select count(*) from auth.users),'storage_objects',(select count(*) from storage.objects),'vault_secrets',(select count(*) from vault.secrets),'large_objects',(select count(*) from pg_largeobject_metadata),'store_version',(select version from public.bon_elagouz_store where id='main_store'),'postgres_version',current_setting('server_version'));"],sourceEnv));
  if(inventory.large_objects!==0)throw new Error('BACKUP_LARGE_OBJECT_EXPORT_REQUIRED');
  if(storage.objects.length!==inventory.storage_objects||vault.length!==inventory.vault_secrets)throw new Error('BACKUP_RESOURCE_SNAPSHOT_CHANGED');
  const reader=process.env.AGOUZ_STORAGE_READER_JSON?JSON.parse(process.env.AGOUZ_STORAGE_READER_JSON):null;
  const token=reader?await storageReaderToken(reader):null;
  if(storage.objects.length&&!token)throw new Error('BACKUP_STORAGE_READER_NOT_CONFIGURED');
  const storageHashes=await downloadStorage(storage.objects,work,{token});
  if(JSON.stringify(storage)!==JSON.stringify(query(storageSnapshotSQL))||JSON.stringify(vault)!==JSON.stringify(query(vaultSnapshotSQL)))throw new Error('BACKUP_RESOURCES_CHANGED_DURING_EXPORT');
  writeFileSync(join(work,'storage-index.json'),JSON.stringify(storage),{mode:0o600});
  writeFileSync(join(work,'vault-secrets.json'),JSON.stringify(vault),{mode:0o600});
  const providerSettings=process.env.AGOUZ_SETTINGS_READ_TOKEN?await captureProviderSettings({project,token:process.env.AGOUZ_SETTINGS_READ_TOKEN,vault}):null;
  if(process.env.AGOUZ_REQUIRE_PROVIDER_SETTINGS==='true'&&!providerSettings)throw Error('BACKUP_PROVIDER_SETTINGS_NOT_CONFIGURED');
  writeRecoveryConfig(work,providerSettings);
  const listing=run(pgTool('pg_restore'),['--list',join(work,'database.dump')]);
  if(!listing.includes('TABLE DATA auth users')||!listing.includes('TABLE DATA public bon_elagouz_store')) throw new Error('BACKUP_REQUIRED_TABLES_MISSING');
  run('git',['archive','--format=tar','--output',join(work,'source.tar'),'HEAD']);
  const hashes={...storageHashes};for(const file of ['database.dump','roles.sql','source.tar','storage-index.json','vault-secrets.json','recovery-config.json']) hashes[file]=await sha256(join(work,file));
  const manifest={format:'agouz-full-logical-backup',version:2,project,generation,createdAt:new Date().toISOString(),sourceCommit:run('git',['rev-parse','HEAD']).trim(),inventory,files:hashes,restoreVerified:false,coverage:['PostgreSQL schema and data including Supabase Auth','database roles without database-role passwords','committed application source','Storage object bytes, bucket metadata and file ownership','portable Vault secrets re-encrypted with the restore target key','recovery configuration and Storage reader identity when configured'],limitations:['Supply the archive encryption key and backup connection credentials separately.','Provider settings require a configured settings export; secret values unavailable from a provider must have an escrow source.','Versioned or archived Storage objects and PostgreSQL large objects fail closed until supported.']};
  manifest.providerSettingsIncluded=!!providerSettings;
  if(providerSettings)manifest.coverage.push('Live Supabase service settings, Edge Function source bundles and digest-verified custom-secret escrow');
  writeFileSync(join(work,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  const plain=join(work,'archive.tar.gz');
  run('tar',['-czf',plain,'-C',work,'database.dump','roles.sql','source.tar','manifest.json','storage-index.json','vault-secrets.json','recovery-config.json','storage']);
  const keyPath=join(root,'recovery-key.base64');
  if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32).toString('base64'),{flag:'wx',mode:0o600});
  const key=Buffer.from(readFileSync(keyPath,'utf8').trim(),'base64');
  const encrypted=join(work,generation+'.agouz');
  await encryptFile(plain,encrypted,key);
  const remote='agouzdrive:pending-verification/'+generation+'.agouz';
  run(drive,['copyto',encrypted,remote,'--config',driveConfig,'--immutable','--log-level','ERROR']);
  const downloaded=join(work,'downloaded.agouz');
  run(drive,['copyto',remote,downloaded,'--config',driveConfig,'--immutable','--log-level','ERROR']);
  if(await sha256(encrypted)!==await sha256(downloaded))throw new Error('BACKUP_REMOTE_HASH_MISMATCH');
  const decrypted=join(work,'downloaded.tar.gz');await decryptFile(downloaded,decrypted,key);
  if(await sha256(plain)!==await sha256(decrypted))throw new Error('BACKUP_DECRYPTED_HASH_MISMATCH');
  const receipt={...manifest,encryptedSha256:await sha256(encrypted),remote,uploadVerified:true,decryptionVerified:true,restoreVerified:false};
  writeFileSync(join(work,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});
  console.log(JSON.stringify({status:'uploaded-pending-restore-verification',generation,work,authUsers:inventory.auth_users,uploadVerified:true,decryptionVerified:true,restoreVerified:false}));
}catch(error){console.error(error.message);process.exitCode=1;}
