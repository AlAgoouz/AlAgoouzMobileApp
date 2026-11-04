import {useEffect,useState} from 'react';
import {dashboardSchema,readRpc,type DashboardModel} from '../lib/readModels';
import {reportRange,type PeriodSelection} from '../lib/reporting';
import {getSupabaseClient} from '../lib/supabaseSync';

export function useDashboardRead(userId:string|undefined,enabled:boolean,period:PeriodSelection){
 const range=reportRange(period),key=JSON.stringify([userId,range.from,range.to]);
 const [revision,setRevision]=useState(0),[result,setResult]=useState<{key:string;data:DashboardModel|null;error:string}>({key:'',data:null,error:''});
 useEffect(()=>{
  if(!userId||!enabled)return;
  let alive=true,version:number|undefined,queueCount:number|undefined,checking=false;
  setResult({key,data:null,error:''});
  const load=async()=>{
   try{const data=dashboardSchema.parse(await readRpc('bon_erp_dashboard',{p_from:range.from,p_to:range.to}));if(alive){version=data.version;queueCount=data.queued;setResult({key,data,error:''});}}
   catch{if(alive)setResult({key,data:null,error:'تعذر تحميل ملخص المحل. أعد المحاولة؛ الأرقام لم تُحمّل بعد.'});}
  };
  const check=async()=>{
   if(!alive||checking||document.visibilityState==='hidden'||!navigator.onLine)return;
   checking=true;
   try{const sb=getSupabaseClient();if(!sb)return;const [response,queue]=await Promise.all([sb.from('bon_elagouz_store').select('version').eq('id','main_store').single(),sb.from('cashier_sync_queue').select('id',{count:'exact',head:true}).eq('processed',false)]);if(response.error||queue.error||queue.count===null)throw Error('VERSION_CHECK_FAILED');if(alive&&version!==undefined&&(Number(response.data.version)!==version||queue.count!==queueCount))await load();}
   catch{if(alive)setResult(previous=>previous.key===key?{...previous,error:'تعذر التحقق من أحدث البيانات؛ المعروض هو آخر ملخص وصل بنجاح.'}:previous);}
   finally{checking=false;}
  };
  void load();const timer=setInterval(()=>void check(),15000);
  window.addEventListener('focus',check);window.addEventListener('online',check);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check);};
 },[userId,enabled,key,revision]);
 return {data:result.key===key?result.data:null,error:result.key===key?result.error:'',retry:()=>setRevision(n=>n+1)};
}
