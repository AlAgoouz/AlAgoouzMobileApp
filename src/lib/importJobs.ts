import {z} from 'zod';
import {getSupabaseClient} from './supabaseSync';
export type ImportKind='financial'|'items';
const resultSchema=z.object({rows:z.array(z.record(z.string(),z.unknown())).max(10000),sha256:z.string().regex(/^[a-f0-9]{64}$/),warnings:z.array(z.string()).optional()});
const jobSchema=z.object({id:z.string().uuid(),file_name:z.string(),sale_date:z.string(),kind:z.enum(['financial','items']),status:z.enum(['uploading','queued','processing','ready','failed','cancelled']),created_at:z.string(),updated_at:z.string(),error_code:z.string().nullable(),reviewed:z.boolean(),queue_id:z.string().uuid().nullable(),result:resultSchema.nullable().optional()});
export type ImportJob=z.infer<typeof jobSchema>;
const messages:Record<string,string>={CASHIER_IMPORT_ALREADY_PENDING:'يوجد ملف من نفس النوع لهذا اليوم؛ راجعه أو ألغِ الملف الخطأ أولًا.',CASHIER_REPORT_ALREADY_EXISTS:'هذا التقرير مسجل بالفعل لهذا اليوم.',IMPORT_RATE_LIMIT:'وصلت للحد المؤقت للرفع؛ حاول لاحقًا.',IMPORT_STORAGE_LIMIT:'مساحة التقارير المخصصة ممتلئة؛ تواصل مع المالك.',DUPLICATE_IMPORT_FILE:'هذا الملف وصل بالفعل. استخدم التقرير المسجل.',IMPORT_ALREADY_REVIEWED:'التقرير مرتبط بيوم مسجل، ولا يمكن إلغاء ملفه هنا.'};
export function importError(code:string){return messages[code]??'تعذرت معالجة التقرير. راجع الملف ثم أعد المحاولة.';}
function client(){const sb=getSupabaseClient();if(!sb)throw Error('تعذر الاتصال؛ سجّل الدخول مجددًا.');return sb;}
async function rpc(name:string,args:Record<string,unknown>={}){const {data,error}=await client().rpc(name,args);if(error)throw Error(importError(Object.keys(messages).find(code=>error.message.includes(code))??''));return data;}
export async function listImports(){return z.array(jobSchema).max(20).parse(await rpc('bon_erp_read_import'));}
export async function readImport(id:string){return jobSchema.parse(await rpc('bon_erp_read_import',{p_id:id}));}
export async function enqueueImport(id:string){
 const {data,error}=await client().auth.getSession();if(error||!data.session)throw Error('انتهت الجلسة؛ سجّل الدخول مجددًا.');
 const response=await fetch(`/api/imports/${encodeURIComponent(id)}/enqueue`,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store'});
 if(!response.ok)throw Error('الملف محفوظ، لكن لم يتأكد بدء المعالجة. اضغط إعادة المحاولة.');
}
export async function cancelImport(id:string){await rpc('bon_erp_cancel_import',{p_id:id});}
export async function uploadImport(file:File,kind:ImportKind,date:string){
 if(!file.size||file.size>10*1024*1024)throw Error('اختر ملفًا غير فارغ، بحد أقصى 10 ميجابايت.');
 if(!/\.(csv|xls|xlsx)$/i.test(file.name))throw Error('الصيغ المقبولة: CSV وXLS وXLSX.');
 const job=z.object({id:z.string().uuid(),path:z.string()}).parse(await rpc('bon_erp_new_import',{p_name:file.name,p_kind:kind,p_date:date,p_bytes:file.size}));
 const mime=/\.xlsx$/i.test(file.name)?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':/\.xls$/i.test(file.name)?'application/vnd.ms-excel':'text/csv';
 const {error}=await client().storage.from('agouz-cashier-imports').upload(job.path,file,{contentType:mime,upsert:false});
 if(error){await cancelImport(job.id).catch(()=>{});throw Error('لم يتأكد رفع الملف؛ حدّث قائمة الملفات قبل تكرار الرفع.');}
 await enqueueImport(job.id);return job.id;
}
