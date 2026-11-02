import {createWriteStream,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import {join} from 'node:path';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {pipeline} from 'node:stream/promises';
import {sha256} from './archive.mjs';

export const project='srinizbfqozvdqsuvvbc';
export const publicKey='sb_publishable_KTZ5q4aKE4Y3wEDdjbjyCQ_GAwL_BmS';
export const storageSnapshotSQL="select jsonb_build_object('buckets',coalesce((select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b),'[]'::jsonb),'objects',coalesce((select jsonb_agg(to_jsonb(o)-'last_accessed_at' order by id) from storage.objects o),'[]'::jsonb));";
export const vaultSnapshotSQL="select bon_erp_private.export_vault_secrets();";
export function storagePath(bucket,name){
  if(typeof bucket!=='string'||!bucket||typeof name!=='string'||!name||name.split('/').some(s=>!s||s==='.'||s==='..')||/[\x00-\x1f]/.test(bucket+name))throw Error('BACKUP_STORAGE_NAME_INVALID');
  return encodeURIComponent(bucket)+'/'+name.split('/').map(encodeURIComponent).join('/');
}
export function resourceFile(id){if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw Error('BACKUP_STORAGE_ID_INVALID');return 'storage/'+id+'.bin';}
export function validateArchiveEntries(entries){
  if(new Set(entries).size!==entries.length)throw Error('RESTORE_ARCHIVE_DUPLICATE');
  const fixed=['database.dump','manifest.json','roles.sql','source.tar','vault-secrets.json','storage-index.json','recovery-config.json','storage/'];
  for(const entry of entries)if(!fixed.includes(entry)&&!/^storage\/[0-9a-f-]{36}\.bin$/i.test(entry))throw Error('RESTORE_ARCHIVE_ENTRIES_REFUSED');
  for(const entry of ['database.dump','manifest.json','roles.sql','source.tar'])if(!entries.includes(entry))throw Error('RESTORE_ARCHIVE_REQUIRED_ENTRY_MISSING');
}
export async function storageReaderToken(credential){
  if(!credential||credential.project!==project||!credential.userId||!credential.email||!credential.password)throw Error('BACKUP_STORAGE_READER_NOT_CONFIGURED');
  const response=await fetch('https://'+project+'.supabase.co/auth/v1/token?grant_type=password',{method:'POST',redirect:'error',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({email:credential.email,password:credential.password}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('BACKUP_STORAGE_READER_AUTH_FAILED');
  const session=await response.json();if(session.user?.id!==credential.userId||!session.access_token)throw Error('BACKUP_STORAGE_READER_ID_MISMATCH');
  return session.access_token;
}
export async function downloadStorage(objects,work,{baseURL='https://'+project+'.supabase.co/storage/v1',token,apikey=publicKey}){
  const directory=join(work,'storage');mkdirSync(directory,{recursive:true,mode:0o700});
  const files={};
  for(const object of objects){
    if(object.is_delete_marker||object.is_versioned||object.archived_at)throw Error('BACKUP_STORAGE_ARCHIVED_VERSION_REQUIRES_EXPORT');
    const relative=resourceFile(object.id),target=join(work,relative);
    const url=new URL(baseURL+'/object/authenticated/'+storagePath(object.bucket_id,object.name));
    if(!(url.protocol==='https:'&&url.hostname===project+'.supabase.co')&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw Error('BACKUP_STORAGE_SOURCE_REFUSED');
    // Preserve raw object bytes, including files carrying Content-Encoding metadata.
    const response=await new Promise((resolve,reject)=>{
      const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{headers:{Authorization:'Bearer '+token,apikey,'Accept-Encoding':'identity'},signal:AbortSignal.timeout(180000)},resolve);
      req.on('error',reject);req.end();
    });
    if(response.statusCode!==200){response.resume();throw Error('BACKUP_STORAGE_DOWNLOAD_FAILED');}
    await pipeline(response,createWriteStream(target,{flags:'wx',mode:0o600}));
    const bytes=(await stat(target)).size;
    if(object.metadata?.size!==undefined&&Number(object.metadata.size)!==bytes)throw Error('BACKUP_STORAGE_LENGTH_MISMATCH');
    files[relative]=await sha256(target);
  }
  return files;
}
const literal=value=>value===null||value===undefined?'null':"'"+String(value).replaceAll("'","''")+"'";
export function vaultRecoverySQL(secrets){
  const commands=['begin;'];
  for(const secret of secrets){
    if(!/^[0-9a-f-]{36}$/i.test(secret.id)||typeof secret.decrypted_secret!=='string')throw Error('RESTORE_VAULT_RECORD_INVALID');
    commands.push(`insert into vault.secrets(id,secret,name,description,created_at,updated_at) values(${literal(secret.id)},'',${literal(secret.name)},${literal(secret.description)},${literal(secret.created_at)}::timestamptz,${literal(secret.updated_at)}::timestamptz);`);
    commands.push(`update vault.secrets s set secret=encode(vault._crypto_aead_det_encrypt(message:=convert_to(${literal(secret.decrypted_secret)},'utf8'),additional:=convert_to(s.id::text,'utf8'),key_id:=0,context:='pgsodium'::bytea,nonce:=s.nonce),'base64') where id=${literal(secret.id)}::uuid;`);
  }
  commands.push('commit;');return commands.join('\n');
}
export function writeRecoveryConfig(work,providerSettings=null){
  const supplied=process.env.AGOUZ_RECOVERY_CONFIG_JSON?JSON.parse(process.env.AGOUZ_RECOVERY_CONFIG_JSON):{};
  const config={format:'agouz-recovery-config',version:1,project,application:{url:'https://agouz.vercel.app',supabaseURL:'https://'+project+'.supabase.co',publishableKey:publicKey},providerSettings:{supabase:providerSettings,external:supplied},backupConnections:{databaseURL:process.env.AGOUZ_DATABASE_URL||null,storageReader:process.env.AGOUZ_STORAGE_READER_JSON?JSON.parse(process.env.AGOUZ_STORAGE_READER_JSON):null,driveConfig:process.env.AGOUZ_RCLONE_CONFIG?readFileSync(process.env.AGOUZ_RCLONE_CONFIG,'utf8'):null,settingsReadToken:process.env.AGOUZ_SETTINGS_READ_TOKEN||null},encryptionKeyIncluded:false};
  writeFileSync(join(work,'recovery-config.json'),JSON.stringify(config),{mode:0o600});
}
