import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {encryptFile,decryptFile,sha256} from '../scripts/backup/archive.mjs';
import {acquireBackupLock} from '../scripts/backup/lock.mjs';

test('a running backup keeps its lock and a terminated process releases it', {timeout:10000}, async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agouz-archive-test-'));
  const path=join(dir,'daily.lock.sqlite');
  const moduleUrl=new URL('../scripts/backup/lock.mjs',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`
    import {acquireBackupLock} from ${JSON.stringify(moduleUrl)};
    const release=acquireBackupLock(process.argv[1]);
    process.stdout.write('locked');
    setInterval(()=>{},1000);
  `,path],{windowsHide:true,stdio:['ignore','pipe','inherit']});
  const exited=once(child,'exit');
  try{
    const acquired=once(child.stdout,'data').then(([data])=>data.toString());
    assert.equal(await Promise.race([acquired,exited.then(()=> 'exited')]),'locked');
    assert.throws(()=>acquireBackupLock(path),/locked/u);
    child.kill();
    await exited;
    acquireBackupLock(path)();
  }finally{
    if(child.exitCode===null&&child.signalCode===null)child.kill();
    await exited;
    assert(resolve(dir).startsWith(resolve(tmpdir())+sep+'agouz-archive-test-'));
    await rm(dir,{recursive:true,force:true});
  }
});

test('database bytes survive encryption and restore; altered archives and wrong keys cannot publish plaintext',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agouz-archive-test-'));
  try{
    const source=join(dir,'database'),encrypted=join(dir,'backup.agouz'),restored=join(dir,'restored');
    const key=randomBytes(32),bytes=Buffer.concat([Buffer.from('بيانات المحل وحسابات الدخول\n'),randomBytes(256*1024)]);
    await writeFile(source,bytes);await encryptFile(source,encrypted,key);await decryptFile(encrypted,restored,key);
    assert.equal(await sha256(source),await sha256(restored));
    await assert.rejects(decryptFile(encrypted,restored,key));
    assert(!(await readFile(encrypted)).includes(Buffer.from('بيانات المحل')));
    await assert.rejects(encryptFile(source,encrypted,key));
    await assert.rejects(decryptFile(encrypted,join(dir,'wrong-key'),randomBytes(32)));
    await assert.rejects(access(join(dir,'wrong-key')));
    const tampered=await readFile(encrypted);tampered[30]^=1;await writeFile(join(dir,'tampered'),tampered);
    await assert.rejects(decryptFile(join(dir,'tampered'),join(dir,'tampered-output'),key));
    await assert.rejects(access(join(dir,'tampered-output')));
    await writeFile(join(dir,'truncated'),Buffer.from('AGOUZBK1'));
    await assert.rejects(decryptFile(join(dir,'truncated'),join(dir,'truncated-output'),key));
  }finally{
    assert(resolve(dir).startsWith(resolve(tmpdir())+sep+'agouz-archive-test-'));
    await rm(dir,{recursive:true,force:true});
  }
});
