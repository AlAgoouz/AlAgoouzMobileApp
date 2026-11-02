import {createHash} from 'node:crypto';

// Management API reference: https://supabase.com/docs/reference/api/introduction
const paths={project:'',auth:'/config/auth',storage:'/config/storage',realtime:'/config/realtime',dataAPI:'/postgrest',postgres:'/config/database/postgres',pooler:'/config/database/pooler',network:'/network-restrictions',ssl:'/ssl-enforcement',functions:'/functions',secretDigests:'/secrets'};
const generatedSecrets=new Set(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEYS','SUPABASE_SECRET_KEYS','SUPABASE_DB_URL','SUPABASE_JWKS']);
const digest=value=>createHash('sha256').update(value).digest('hex');
async function bytes(response,limit=32*1024*1024){
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('BACKUP_PROVIDER_RESPONSE_TOO_LARGE');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
export function edgeSecretEscrow(secretDigests,vault){
 const result={};
 for(const secret of secretDigests){
  if(generatedSecrets.has(secret.name))continue;
  const saved=vault.find(v=>v.name==='agouz.edge.'+secret.name);
  if(!saved||typeof saved.decrypted_secret!=='string')throw Error('BACKUP_EDGE_SECRET_ESCROW_REQUIRED');
  if(digest(saved.decrypted_secret)!==secret.value)throw Error('BACKUP_EDGE_SECRET_ESCROW_MISMATCH');
  result[secret.name]=saved.decrypted_secret;
 }
 return result;
}
function replaceMaskedSecrets(object,vault,path='auth'){
 for(const [key,value]of Object.entries(object)){
  const location=path+'.'+key;
  if(value&&typeof value==='object'){replaceMaskedSecrets(value,vault,location);continue;}
  if(typeof value==='string'&&/secret|password|smtp_pass|auth_token|api_key/i.test(key)&&/^(?:\*{3,}|\[redacted\])$/i.test(value)){
   const saved=vault.find(v=>v.name==='agouz.provider.'+location);
   if(!saved||typeof saved.decrypted_secret!=='string')throw Error('BACKUP_MASKED_PROVIDER_SECRET_ESCROW_REQUIRED');
   object[key]=saved.decrypted_secret;
  }
 }
}
export async function captureProviderSettings({project,token,vault=[],fetcher=fetch}){
 if(!token?.startsWith('sbp_fc'))throw Error('BACKUP_PROJECT_SCOPED_SETTINGS_TOKEN_REQUIRED');
 if(!/^[a-z]{20}$/.test(project))throw Error('BACKUP_PROVIDER_PROJECT_INVALID');
 const get=async path=>{
  for(let attempt=0;attempt<3;attempt++){
   let response;try{response=await fetcher('https://api.supabase.com/v1/projects/'+project+path,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});}catch{if(attempt===2)throw Error('BACKUP_PROVIDER_SETTINGS_CONNECTION_FAILED');}
   if(response?.ok)return response;
   const status=response?.status;if(response?.body)await response.body.cancel();
   if(status&&status!==429&&status<500||attempt===2)throw Error('BACKUP_PROVIDER_SETTINGS_READ_FAILED_'+(status||'CONNECTION'));
   await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
  }
 };
 const configuration={};
 for(const [name,path]of Object.entries(paths))configuration[name]=JSON.parse((await bytes(await get(path))).toString('utf8'));
 if(configuration.project.ref!==project&&configuration.project.id!==project)throw Error('BACKUP_PROVIDER_SOURCE_MISMATCH');
 replaceMaskedSecrets(configuration.auth,vault);
 const edgeSecrets=edgeSecretEscrow(configuration.secretDigests,vault),functionBundles=[];
 for(const fn of configuration.functions){
  if(!/^[A-Za-z0-9_-]+$/.test(fn.slug))throw Error('BACKUP_FUNCTION_SLUG_INVALID');
  const response=await get('/functions/'+encodeURIComponent(fn.slug)+'/body'),body=await bytes(response);
  if(!body.length)throw Error('BACKUP_FUNCTION_SOURCE_EMPTY');
  functionBundles.push({slug:fn.slug,contentType:response.headers.get('content-type'),sha256:digest(body),bodyBase64:body.toString('base64')});
 }
 const ordered=records=>JSON.stringify([...records].sort((a,b)=>String(a.slug||a.name).localeCompare(String(b.slug||b.name))));
 for(const name of ['functions','secretDigests'])if(ordered(configuration[name])!==ordered(JSON.parse((await bytes(await get(paths[name]))).toString('utf8'))))throw Error('BACKUP_PROVIDER_RESOURCES_CHANGED_DURING_EXPORT');
 const result={format:'agouz-provider-settings',version:1,project,capturedAt:new Date().toISOString(),configuration,edgeSecrets,functionBundles,generatedSecretPolicy:'Recreate SUPABASE_* built-ins with the destination project credentials; do not reuse source database URLs or API keys.'};
 validateProviderSettings(result,project);return result;
}
export function validateProviderSettings(settings,project){
 if(settings?.format!=='agouz-provider-settings'||settings.version!==1||settings.project!==project)throw Error('RESTORE_PROVIDER_CONFIGURATION_INVALID');
 for(const name of Object.keys(paths))if(settings.configuration[name]===undefined)throw Error('RESTORE_PROVIDER_CONFIGURATION_INCOMPLETE');
 if(settings.functionBundles.length!==settings.configuration.functions.length)throw Error('RESTORE_FUNCTION_BUNDLE_COUNT_MISMATCH');
 const slugs=settings.functionBundles.map(bundle=>bundle.slug);
 if(new Set(slugs).size!==slugs.length||JSON.stringify([...slugs].sort())!==JSON.stringify(settings.configuration.functions.map(fn=>fn.slug).sort()))throw Error('RESTORE_FUNCTION_BUNDLE_IDENTITY_MISMATCH');
 for(const bundle of settings.functionBundles)if(!bundle.bodyBase64||digest(Buffer.from(bundle.bodyBase64,'base64'))!==bundle.sha256)throw Error('RESTORE_FUNCTION_BUNDLE_HASH_MISMATCH');
 for(const secret of settings.configuration.secretDigests){if(!generatedSecrets.has(secret.name)&&digest(settings.edgeSecrets[secret.name]??'')!==secret.value)throw Error('RESTORE_EDGE_SECRET_DIGEST_MISMATCH');}
 return true;
}
