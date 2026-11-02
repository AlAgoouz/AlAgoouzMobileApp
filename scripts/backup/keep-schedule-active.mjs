// Public repositories lose inactive schedules after 60 days. Record only a monthly maintenance marker.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
if(process.env.GITHUB_REPOSITORY!=='AlAgoouz/AlAgoouzMobileApp'||process.env.GITHUB_REF!=='refs/heads/main')throw new Error('SCHEDULE_MAINTENANCE_TARGET_REFUSED');
const file='audit/backup-schedule-heartbeat.json',month=new Date().toISOString().slice(0,7);
if(existsSync(file)&&JSON.parse(readFileSync(file,'utf8')).month===month){console.log('Monthly schedule maintenance already recorded.');process.exit(0);}
function git(args){return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
const origin=git(['remote','get-url','origin']).trim();
if(!/^https:\/\/github\.com\/AlAgoouz\/AlAgoouzMobileApp(?:\.git)?$/i.test(origin))throw new Error('SCHEDULE_MAINTENANCE_REMOTE_REFUSED');
writeFileSync(file,JSON.stringify({month,purpose:'Keep the public repository backup schedule active'},null,2)+'\n');
git(['config','user.name','github-actions[bot]']);
git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
git(['add','--',file]);
git(['commit','--only','-m','Maintain automatic backup schedule for '+month,'--',file]);
// Refuse to overwrite concurrent changes: ordinary push only, never force.
git(['push','origin','HEAD:main']);
console.log('Monthly schedule maintenance recorded without business data.');
