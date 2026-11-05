import {z} from 'zod';
import {getSupabaseClient} from './supabaseSync';
const number=z.number().finite(),count=number.int().nonnegative();
const activity=z.object({id:z.string(),description:z.string(),partnerName:z.string(),timestamp:z.string(),amount:number.optional()});
export const dashboardSchema=z.object({
 version:count,
 report:z.object({revenue:number,cost:number,gross:number,spent:number,net:number,margin:number,count,
  entries:z.array(z.object({date:z.string(),sales:number,profit:number})),firstDate:z.string().nullable(),lastDate:z.string().nullable()}),
 balances:z.object({inventory:number,debts:number,shortages:count}),pending:count,approved:count,queued:count,
 channels:z.array(z.object({id:z.string(),label:z.string(),value:number})),products:z.array(z.object({id:z.string(),name:z.string(),revenue:number})),activity:z.array(activity),counts:z.record(z.string(),count)
});
export type DashboardModel=z.infer<typeof dashboardSchema>;
export const itemResultsSchema=z.array(z.object({id:z.string(),name:z.string(),code:z.string(),stock:number,baseUnit:z.enum(['kg','piece','count','liter'])}));
export type ItemSearchResult=z.infer<typeof itemResultsSchema>[number];
export type HistoryKind='wholesale'|'cashier'|'legacy';
export const salesPageSchema=z.object({kind:z.enum(['wholesale','cashier','legacy']),version:count,total:count,rows:z.array(z.record(z.string(),z.unknown())).max(50)});
export async function readRpc(name:string,args:Record<string,unknown>){
 const sb=getSupabaseClient();if(!sb)throw Error('إعداد الاتصال غير صالح');
 const {data,error}=await sb.rpc(name,args);
 if(error)throw Error('تعذر تحميل البيانات المطلوبة؛ تحقق من الاتصال وأعد المحاولة');
 return data;
}
