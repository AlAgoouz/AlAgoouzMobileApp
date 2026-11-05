import {z} from 'zod';
import {getSupabaseClient} from './supabaseSync';
export type ImportKind='financial'|'items';
const resultSchema=z.object({rows:z.array(z.record(z.string(),z.unknown())).max(10000),sha256:z.string().regex(/^[a-f0-9]{64}$/),warnings:z.array(z.string()).optional(),suggestions:z.array(z.object({row:z.number().int().nonnegative(),candidates:z.array(z.object({itemId:z.string(),name:z.string(),code:z.string(),score:z.number().min(0).max(100)})).max(3)})).max(500).optional()});
const jobSchema=z.object({id:z.string().uuid(),file_name:z.string(),sale_date:z.string(),kind:z.enum(['financial','items']),status:z.enum(['uploading','queued','processing','ready','failed','cancelled']),created_at:z.string(),updated_at:z.string(),error_code:z.string().nullable(),reviewed:z.boolean(),queue_id:z.string().uuid().nullable(),result:resultSchema.nullable().optional()});
export type ImportJob=z.infer<typeof jobSchema>;
const messages:Record<string,string>={BEGUN_NOT_FOUND:'لم يظهر سطر Begun في ملف المبيعات؛ اختر التقرير الصحيح.',BEGUN_AMBIGUOUS:'يوجد أكثر من سطر Begun؛ ارفع تقرير يوم واحد واضح.',BEGUN_AMOUNT_INVALID:'قيمة Begun غير صالحة؛ لا يمكن اعتماد رقم بديل.',BEGUN_REPORT_DATE_INVALID:'تاريخ تقرير المبيعات غير صالح أو يشمل أكثر من يوم.',BEGUN_REPORT_DATE_MISMATCH:'تاريخ الملف لا يطابق يوم العمل المختار؛ حدّد يوم البيع الصحيح وأعد رفعه.',CASHIER_IMPORT_ALREADY_PENDING:'يوجد ملف من نفس النوع لهذا اليوم؛ راجعه أو ألغِ الملف الخطأ أولًا.',CASHIER_REPORT_ALREADY_EXISTS:'هذا التقرير مسجل بالفعل لهذا اليوم.',IMPORT_RATE_LIMIT:'وصلت للحد المؤقت للرفع؛ حاول لاحقًا.',IMPORT_STORAGE_LIMIT:'مساحة التقارير المخصصة ممتلئة؛ تواصل مع المالك.',DUPLICATE_IMPORT_FILE:'هذا الملف وصل بالفعل. استخدم التقرير المسجل.',IMPORT_ALREADY_REVIEWED:'التقرير مرتبط بيوم مسجل، ولا يمكن إلغاء ملفه هنا.'};
const uwsMessages:Record<string,string>={UWS_REPORT_DATE_INVALID:'تقرير الأصناف يحتاج تاريخ يوم واحد صحيح داخل Date Range.',UWS_REPORT_DATE_MISMATCH:'تاريخ تقرير الأصناف لا يطابق يوم العمل؛ اختر الملف مجددًا لقراءة تاريخه.',UWS_TOTALS_MISMATCH:'تفاصيل التقرير لا تطابق مجاميعه؛ أعد تصدير التقرير كاملًا من الكاشير.',UWS_TOTALS_MISSING:'مجاميع تقرير الأصناف ناقصة؛ أعد تصدير التقرير كاملًا.',UWS_DUPLICATE_ITEM_CODE:'كود منتج مكرر في مواضع منفصلة بالتقرير؛ راجع تقرير الكاشير.',UWS_ITEM_AMOUNT_MISSING:'تفاصيل أحد بنود تقرير الأصناف ناقصة؛ أعد تصديره.',UWS_UNRECOGNIZED_LINE:'يوجد سطر غير معروف في تنسيق تقرير الأصناف؛ يلزم مراجعته قبل الاعتماد.',UWS_NUMBER_INVALID:'يوجد عدد أو وزن غير صالح في تقرير الأصناف.'};
export function importError(code:string){return messages[code]??uwsMessages[code]??(code==='UWS_VARIANT_PARENT_REQUIRED'?'اختيارات نوع البن غير مرتبطة بوزن واضح في التقرير؛ ارفع تقريرًا تفصيليًا.':'تعذرت معالجة التقرير. راجع الملف ثم أعد المحاولة.');}
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

export async function queuedRows(id:string){
 const {data,error}=await client().from('cashier_sync_queue').select('raw_rows').eq('id',id).eq('processed',false).single();
 if(error)throw Error('تعذر فتح الملف؛ حدّث القائمة وأعد المحاولة.');
 return z.array(z.record(z.string(),z.unknown())).max(10000).parse(data.raw_rows);
}
