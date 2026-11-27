import {getSupabaseClient} from './supabaseSync';
import {fromCloud} from './storeState';
import {storeWriteError} from './storeErrors';
import {jsonBytes,STORE_CHANGE_LIMIT} from './storeChanges';
import type {ExcelPlan} from './excelPlan';

type Receipt={reference:string; version:number; approvedAt:string};
function client(){
  const sb=getSupabaseClient();
  if(!sb)throw Error('اتصال قاعدة البيانات غير متاح.');
  return sb;
}
export async function loadExcelSnapshot(){
  const {data,error}=await client().from('bon_elagouz_store').select('*').eq('id','main_store').single();
  const version=Number(data?.version);
  if(error||!data||!Number.isSafeInteger(version)||version<0)throw Error('تعذر تحميل أحدث بيانات المحل. تحقق من الاتصال وصلاحية الحساب.');
  return {state:fromCloud(data),version};
}
export async function findExcelReceipt(id:string):Promise<Receipt|null>{
  const {data,error}=await client().from('bon_erp_store_receipts').select('operation_id,version,created_at').eq('operation_id',id).maybeSingle();
  if(error)throw Error('تعذر التأكد إذا كان الملف اتسجل قبل كده. حاول مرة تانية.');
  return data?{reference:data.operation_id,version:Number(data.version),approvedAt:data.created_at}:null;
}
export async function submitExcelPlan(mode:'preview'|'approve',id:string,version:number,plan:ExcelPlan){
  if(plan.issues.length||!Object.keys(plan.changes).length)throw Error('راجع الملف قبل الاعتماد.');
  if(jsonBytes(plan.changes)>STORE_CHANGE_LIMIT)throw Error('حجم التغييرات أكبر من حد الحفظ. قسّم البيانات على أكثر من ملف.');
  const {data,error}=await client().rpc('bon_erp_apply_excel',{
    p_operation_id:id,p_expected_version:version,p_changes:plan.changes,p_preview:mode==='preview',
  });
  if(error){
    if(error.code==='PGRST202')throw Error('معاينة Excel تحتاج ترقية قاعدة البيانات قبل الاستخدام.');
    if(/STORE_CONFLICT/.test(error.message))throw Error('البيانات اتغيرت بعد المعاينة. اضغط «معاينة الملف» مرة تانية.');
    throw Error(storeWriteError(error.message));
  }
  if(!Number.isSafeInteger(Number(data?.version)))throw Error('تعذر تأكيد العملية مع الخادم.');
}
