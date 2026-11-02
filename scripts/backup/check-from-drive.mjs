// Downloads the last verified encrypted backup and restores only into a new isolated test database.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.env.AGOUZ_BACKUP_ROOT||'D:/AgouzPrivateBackups');
const drive=process.env.AGOUZ_RCLONE,config=process.env.AGOUZ_RCLONE_CONFIG;
if(!drive||!config||!/^root_folder_id\s*=\s*1Y0woq-P9w6C5zvPVlgmVTZDGEWOPhig4\s*$/m.test(readFileSync(config,'utf8')))throw new Error('BACKUP_DRIVE_FOLDER_MISMATCH');
function run(args){try{return execFileSync(drive,[...args,'--config',config,'--log-level','ERROR'],{encoding:'utf8',windowsHide:true,timeout:180000,stdio:['ignore','pipe','pipe']});}catch{throw new Error('BACKUP_DRIVE_DOWNLOAD_FAILED');}}
const latest=JSON.parse(run(['cat','agouzdrive:latest-verified.json']));
if(!/^[\dTZ-]+-[a-f0-9]{8}$/.test(latest.generation)||latest.project!=='srinizbfqozvdqsuvvbc'||latest.remote!=='agouzdrive:verified/'+latest.generation+'.agouz'||!latest.restoreVerified)throw new Error('BACKUP_POINTER_INVALID');
const work=join(root,'pending','recheck-'+Date.now());mkdirSync(work,{recursive:true,mode:0o700});
writeFileSync(join(work,'receipt.json'),JSON.stringify(latest),{mode:0o600});
run(['copyto',latest.remote,join(work,'downloaded.agouz'),'--immutable']);
const result=spawnSync(process.execPath,['scripts/backup/verify-restore.mjs',work],{stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
