import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {sha256} from './archive.mjs';

const root=resolve(process.env.AGOUZ_BACKUP_ROOT||'D:/AgouzPrivateBackups');
const work=resolve(process.argv[2]||'');
if(!work.startsWith(resolve(root,'pending')+sep))throw new Error('BACKUP_WORKSPACE_REFUSED');
const receipt=JSON.parse(readFileSync(join(work,'receipt.json'),'utf8'));
const proof=JSON.parse(readFileSync(join(work,'restore-proof.json'),'utf8'));
if(!proof.restoreVerified||!proof.cleanupComplete||!proof.restoredFromDownloadedArchive||!proof.syntheticAuthLoginVerified||!proof.allTableDataMatched||proof.generation!==receipt.generation||proof.encryptedSha256!==receipt.encryptedSha256)throw new Error('BACKUP_RESTORE_PROOF_REQUIRED');
if(!/^[\dTZ-]+-[a-f0-9]{8}$/.test(receipt.generation))throw new Error('BACKUP_GENERATION_INVALID');
if(await sha256(join(work,'downloaded.agouz'))!==proof.encryptedSha256)throw new Error('BACKUP_ARCHIVE_CHANGED');
const drive=process.env.AGOUZ_RCLONE,config=process.env.AGOUZ_RCLONE_CONFIG;
if(!drive||!config||!/^root_folder_id\s*=\s*1Y0woq-P9w6C5zvPVlgmVTZDGEWOPhig4\s*$/m.test(readFileSync(config,'utf8')))throw new Error('BACKUP_DRIVE_FOLDER_MISMATCH');
function run(args){try{return execFileSync(drive,[...args,'--config',config,'--log-level','ERROR'],{encoding:'utf8',windowsHide:true,timeout:180000,stdio:['ignore','pipe','pipe']});}catch{throw new Error('BACKUP_PROMOTION_FAILED');}}
const remote='agouzdrive:verified/'+receipt.generation+'.agouz';
run(['copyto',join(work,'downloaded.agouz'),remote,'--immutable']);
const checkDir=join(work,'promotion-'+Date.now());mkdirSync(checkDir,{mode:0o700});
const checked=join(checkDir,'verified.agouz');run(['copyto',remote,checked,'--immutable']);
if(await sha256(checked)!==proof.encryptedSha256)throw new Error('BACKUP_VERIFIED_REMOTE_HASH_MISMATCH');
const latest={...proof,project:receipt.project,sourceCommit:receipt.sourceCommit,remote};
const pointer=join(checkDir,'latest-verified.json');writeFileSync(pointer,JSON.stringify(latest,null,2),{mode:0o600});
// Replace the pointer only after the independently downloaded verified archive passes.
run(['copyto',pointer,'agouzdrive:latest-verified.json']);
const readback=JSON.parse(run(['cat','agouzdrive:latest-verified.json']));
if(JSON.stringify(readback)!==JSON.stringify(latest))throw new Error('BACKUP_POINTER_READBACK_MISMATCH');
writeFileSync(join(root,'latest-verified.json'),JSON.stringify(latest,null,2),{mode:0o600});
console.log(JSON.stringify({status:'verified-off-device',generation:latest.generation,tablesCompared:latest.tablesCompared,remote}));
