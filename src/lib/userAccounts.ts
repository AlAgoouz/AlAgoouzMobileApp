import {getSupabaseClient} from './supabaseSync';
import type {ManagedUser,UserPermissions} from './userAccess';
export interface UserInput {id?:string;email?:string;password?:string;username:string;displayName:string;role:'partner'|'cashier';partnerId:string|null;permissions:UserPermissions;disabled?:boolean;deleted?:boolean;}
export async function listUserAccounts():Promise<ManagedUser[]>{
 const sb=getSupabaseClient();if(!sb)throw Error('تعذر الاتصال بخدمة المستخدمين');
 const {data,error}=await sb.rpc('bon_erp_list_users');
 if(error)throw Error('إدارة المستخدمين متاحة للمالك الرئيسي فقط، أو تعذر تحميلها');
 return (data??[]).map((u:any)=>({userId:u.user_id,partnerId:u.partner_id,username:u.username,displayName:u.display_name,email:u.email,role:u.role,isOwner:u.is_owner,permissions:u.permissions,disabled:u.disabled,deleted:u.deleted,createdAt:u.created_at}));
}
export async function saveUserAccount(input:UserInput):Promise<void>{
 const sb=getSupabaseClient();if(!sb)throw Error('تعذر الاتصال بخدمة المستخدمين');
 const {data,error}=await sb.functions.invoke('manage-users',{body:input});
 if(error||data?.error)throw Error(data?.error??'تعذر حفظ المستخدم؛ راجع البيانات والاتصال ثم حدّث القائمة قبل إعادة المحاولة');
}
