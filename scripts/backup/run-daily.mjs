import {spawnSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync,unlinkSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.env.AGOUZ_BACKUP_ROOT||'D:/AgouzPrivateBackups');
mkdirSync(root,{recursive:true,mode:0o700});
mkdirSync(join(root,'pending'),{recursive:true,mode:0o700});
const lock=join(root,'daily.lock');let handle;
try{handle=openSync(lock,'wx',0o600);}catch{console.error('يوجد تشغيل للنسخ قائم أو قفل يحتاج مراجعة؛ لم يتم تجاوزه.');process.exit(1);}
writeFileSync(handle,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
try{
  const before=new Set(readdirSync(join(root,'pending'),{withFileTypes:true}).map(x=>x.name));
  for(const stage of ['export-full','verify-restore','promote-verified']){
    let work;
    if(stage!=='export-full'){
      const created=readdirSync(join(root,'pending'),{withFileTypes:true}).filter(x=>x.isDirectory()&&!before.has(x.name));
      if(created.length!==1)throw new Error('BACKUP_GENERATION_AMBIGUOUS');
      work=join(root,'pending',created[0].name);
      if(!JSON.parse(readFileSync(join(work,'receipt.json'),'utf8')).uploadVerified)throw new Error('BACKUP_EXPORT_NOT_CONFIRMED');
    }
    const result=spawnSync(process.execPath,['scripts/backup/'+stage+'.mjs',...(work?[work]:[])],{stdio:'inherit',windowsHide:true});
    if(result.status!==0)throw new Error('BACKUP_STAGE_FAILED: '+stage);
  }
}catch(error){console.error('فشل النسخ أو التحقق؛ تم الاحتفاظ بآخر نسخة موثّقة. '+error.message);process.exitCode=1;}
finally{closeSync(handle);unlinkSync(lock);}
