import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureProviderSettings,edgeSecretEscrow,validateProviderSettings} from '../../scripts/backup/provider-settings.mjs';
const project='srinizbfqozvdqsuvvbc',hash=x=>createHash('sha256').update(x).digest('hex');
test('provider export uses project-only GETs, preserves a function bundle and verifies escrow digests',async()=>{
 const vault=[{name:'agouz.edge.PAYMENT_KEY',decrypted_secret:'synthetic secret'},{name:'agouz.provider.auth.smtp_pass',decrypted_secret:'synthetic SMTP'}];
 const fetcher=async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(url.startsWith('https://api.supabase.com/v1/projects/'+project));
  const path=url.slice(('https://api.supabase.com/v1/projects/'+project).length);
  if(path==='/functions/check/body')return new Response('synthetic function source',{headers:{'Content-Type':'application/octet-stream'}});
  const body=path===''?{ref:project}:path==='/functions'?[{slug:'check',version:1}]:path==='/secrets'?[{name:'SUPABASE_URL',value:'generated'},{name:'PAYMENT_KEY',value:hash('synthetic secret')}]:path==='/config/auth'?{smtp_pass:'***'}:{};
  return Response.json(body);
 };
 const exported=await captureProviderSettings({project,token:'sbp_fc_fixture',vault,fetcher});
 assert.equal(exported.configuration.auth.smtp_pass,'synthetic SMTP');assert.equal(exported.edgeSecrets.PAYMENT_KEY,'synthetic secret');assert.equal(exported.functionBundles.length,1);
 assert.equal(validateProviderSettings(exported,project),true);
 exported.functionBundles[0].bodyBase64=Buffer.from('changed').toString('base64');
 assert.throws(()=>validateProviderSettings(exported,project),/HASH_MISMATCH/);
});
test('unavailable or stale custom function secrets refuse completion instead of producing an incomplete backup',()=>{
 const secrets=[{name:'PAYMENT_KEY',value:hash('new')}];
 assert.throws(()=>edgeSecretEscrow(secrets,[]),/ESCROW_REQUIRED/);
 assert.throws(()=>edgeSecretEscrow(secrets,[{name:'agouz.edge.PAYMENT_KEY',decrypted_secret:'old'}]),/ESCROW_MISMATCH/);
});
test('provider authorization and malformed sources fail closed',async()=>{
 await assert.rejects(captureProviderSettings({project,token:'legacy'}),/SCOPED/);
 await assert.rejects(captureProviderSettings({project,token:'sbp_fc_fixture',fetcher:async()=>new Response('',{status:403})}),/READ_FAILED_403/);
 await assert.rejects(captureProviderSettings({project,token:'sbp_fc_fixture',fetcher:async()=>Response.json({ref:'different'})}),/SOURCE_MISMATCH/);
});
