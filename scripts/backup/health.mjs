import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {storageReaderToken,project,publicKey} from './resources.mjs';
// The existing storage reader can report only this operational receipt; it
// still cannot write ERP transactions or private files.
export async function reportRecoveryHealth(state,work){
 if(!process.env.GITHUB_RUN_ID)return;
 try{
  const reader=JSON.parse(process.env.AGOUZ_STORAGE_READER_JSON||'null');
  const token=await storageReaderToken(reader);
  let generation=null;
  if(state==='success'){
   const receipt=JSON.parse(readFileSync(join(work,'receipt.json'),'utf8'));
   const proof=JSON.parse(readFileSync(join(work,'restore-proof.json'),'utf8'));
   if(!proof.restoreVerified||!proof.cleanupComplete||!receipt.uploadVerified||proof.generation!==receipt.generation)throw Error('RECOVERY_NOT_VERIFIED');
   generation=receipt.generation;
  }
  const response=await fetch(`https://${project}.supabase.co/rest/v1/rpc/bon_erp_report_recovery_health`,{method:'POST',headers:{apikey:publicKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_state:state,p_run:process.env.GITHUB_RUN_ID,p_sha:process.env.GITHUB_SHA,p_generation:generation}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('RECOVERY_STATUS_UNAVAILABLE');
  console.log('Recovery status receipt:',state);
 }catch{
  // Status delivery must not discard a good capture or its verified pointer.
  console.error('RECOVERY_STATUS_NOT_CONFIRMED');
 }
}
