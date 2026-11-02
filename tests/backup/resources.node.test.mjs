import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import {join,resolve,sep} from 'node:path';
import {gzipSync} from 'node:zlib';
import {storagePath,resourceFile,validateArchiveEntries,downloadStorage,vaultRecoverySQL,assertStorageCoverage} from '../../scripts/backup/resources.mjs';
test('unexported advanced Storage data or incomplete multipart uploads refuse a complete-backup claim',()=>{
 assert.doesNotThrow(()=>assertStorageCoverage(query=>query.includes('information_schema')?['buckets','objects','migrations','buckets_vectors','s3_multipart_uploads']:0));
 assert.throws(()=>assertStorageCoverage(query=>query.includes('information_schema')?['buckets','objects','future_versions']:1),/ADVANCED_STORAGE_EXPORT_REQUIRED/);
});
test('downloads encoded binary bytes unchanged and refuses missing, truncated or unsafe object paths',async()=>{
  const root=await mkdtemp(join(os.tmpdir(),'agouz-resource-test-')),bytes=gzipSync(Buffer.from('اختبار\n'.repeat(1000))),id='11111111-1111-4111-8111-111111111111';
  const server=http.createServer((req,res)=>{if(req.url.includes('/missing')){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Encoding':'gzip'});res.end(bytes);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseURL='http://127.0.0.1:'+server.address().port;
  try{
    const object={id,bucket_id:'private',name:'صور/ملف.gz',metadata:{size:bytes.length}};
    const hashes=await downloadStorage([object],join(root,'good'),{baseURL,token:'synthetic',apikey:'synthetic'});
    assert.equal(Object.keys(hashes).length,1);assert.deepEqual(await readFile(join(root,'good',resourceFile(id))),bytes);
    await assert.rejects(downloadStorage([{...object,name:'missing'}],join(root,'missing'),{baseURL,token:'synthetic'}),/DOWNLOAD_FAILED/);
    await assert.rejects(downloadStorage([{...object,metadata:{size:999}}],join(root,'bad-size'),{baseURL,token:'synthetic'}),/LENGTH_MISMATCH/);
    assert.throws(()=>storagePath('private','../secret'),/NAME_INVALID/);
    assert.throws(()=>resourceFile('../../secret'),/ID_INVALID/);
    assert.throws(()=>validateArchiveEntries(['database.dump','manifest.json','roles.sql','source.tar','../secret']),/ENTRIES_REFUSED/);
  }finally{await new Promise(resolve=>server.close(resolve));if(!resolve(root).startsWith(resolve(os.tmpdir())+sep+'agouz-resource-test-'))throw Error('CLEANUP_REFUSED');await rm(root,{recursive:true,force:true});}
});
test('Vault recovery preserves identifiers and safely quotes a secret while re-encrypting with the destination key',()=>{
  const sql=vaultRecoverySQL([{id:'11111111-1111-4111-8111-111111111111',name:null,description:'test',created_at:'2026-01-01Z',updated_at:'2026-01-01Z',decrypted_secret:"value'; select 1; --\nعربي"}]);
  assert.match(sql,/value''; select 1;/);assert.match(sql,/vault\._crypto_aead_det_encrypt/);assert.match(sql,/additional:=convert_to\(s.id::text/);
  assert.throws(()=>vaultRecoverySQL([{id:'bad',decrypted_secret:'value'}]),/RECORD_INVALID/);
});
