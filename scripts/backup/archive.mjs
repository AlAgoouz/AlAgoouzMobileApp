import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {open,stat,link,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';

const magic=Buffer.from('AGOUZBK1');
export async function sha256(file){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function checkKey(key){if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('BACKUP_KEY_INVALID');}
export async function encryptFile(source,target,key){
  checkKey(key);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(magic);
  const header=await open(target,'wx',0o600);
  await header.write(Buffer.concat([magic,iv]));await header.close();
  try{
    await pipeline(createReadStream(source),cipher,createWriteStream(target,{flags:'a',mode:0o600}));
    const end=await open(target,'a');await end.write(cipher.getAuthTag());await end.close();
  }catch(error){await rm(target,{force:true});throw error;}
}
export async function decryptFile(source,target,key){
  checkKey(key);
  const length=(await stat(source)).size;
  if(length<36)throw new Error('BACKUP_ARCHIVE_INVALID');
  const file=await open(source,'r'),head=Buffer.alloc(20),tag=Buffer.alloc(16);
  try{await file.read(head,0,20,0);await file.read(tag,0,16,length-16);}finally{await file.close();}
  if(!head.subarray(0,8).equals(magic))throw new Error('BACKUP_ARCHIVE_INVALID');
  const decipher=createDecipheriv('aes-256-gcm',key,head.subarray(8));
  decipher.setAAD(magic);decipher.setAuthTag(tag);
  // Authenticated plaintext is published only after GCM verification succeeds.
  const partial=target+'.'+randomBytes(8).toString('hex')+'.partial';
  try{
    await pipeline(createReadStream(source,{start:20,end:length-17}),decipher,createWriteStream(partial,{flags:'wx',mode:0o600}));
    await link(partial,target);await rm(partial);
  }catch(error){await rm(partial,{force:true});throw error;}
}
