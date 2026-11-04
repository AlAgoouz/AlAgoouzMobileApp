import {getSupabaseClient} from './supabaseSync';
async function exportFile(path:string,name:string,mime:string){
 const sb=getSupabaseClient();if(!sb)throw Error('تعذر الاتصال بخدمة التصدير.');
 const {data,error}=await sb.auth.getSession();if(error||!data.session)throw Error('انتهت الجلسة؛ سجّل الدخول مجددًا.');
 const response=await fetch(path,{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store'});
 if(!response.ok||!response.headers.get('content-type')?.startsWith(mime))throw Error('تعذر تجهيز التقرير؛ راجع الاتصال أو اختر نطاقًا أصغر وأعد المحاولة.');
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength>8*1024*1024)throw Error('التقرير أكبر من حد التنزيل؛ اختر نطاقًا أصغر.');
 const header=new Uint8Array(bytes.slice(0,5));
 if(mime==='application/pdf'?!new TextDecoder().decode(header).startsWith('%PDF-'):header[0]!==80||header[1]!==75)throw Error('لم يتأكد اكتمال ملف التقرير؛ أعد المحاولة.');
 return new File([bytes],name,{type:mime});
}
export const serverInvoicePdf=(id:string)=>exportFile(`/api/invoices/${encodeURIComponent(id)}/pdf`,'Agouz-invoice.pdf','application/pdf');
export function downloadExport(file:File){
 const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function downloadReport(format:'xlsx'|'pdf',from:string,to:string){
 const query=new URLSearchParams({from_date:from,to_date:to});
 const mime=format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const file=await exportFile(`/api/reports/${format}?${query}`,`Agouz-${from}-${to}.${format}`,mime);
 downloadExport(file);
}
