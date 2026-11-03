import type {StoreState} from './storeState';

export const writePermissions = [
  {id:'catalog',label:'تعريف المنتجات والأسعار والوصفات'},
  {id:'purchases',label:'فواتير المشتريات'},
  {id:'sales',label:'فواتير الجملة والمرتجعات'},
  {id:'cashier',label:'اعتماد تقارير الكاشير'},
  {id:'production',label:'إنتاج التوليفات'},
  {id:'stocktaking',label:'اعتماد الجرد'},
  {id:'contacts',label:'بيانات العملاء والموردين'},
  {id:'collections',label:'التحصيل وعكس الدفعات'},
  {id:'staff',label:'العمال والرواتب'},
  {id:'expenses',label:'المصاريف'},
  {id:'partners',label:'بيانات الشركاء المالية'},
] as const;
export type WritePermission=typeof writePermissions[number]['id'];
export type UserPermissions=Partial<Record<WritePermission|'view',boolean>>;
export interface UserAccess {userId:string;partnerId:string|null;username:string;displayName:string;role:'partner'|'cashier';isOwner:boolean;permissions:UserPermissions;}
export interface ManagedUser extends UserAccess {email:string;disabled:boolean;deleted:boolean;createdAt:string;}
export const canWrite=(access:UserAccess|null,key:WritePermission)=>!!access&&(access.isOwner||access.role==='partner'&&access.permissions.view===true&&access.permissions[key]===true);
export const canView=(access:UserAccess|null)=>!!access&&(access.isOwner||access.role==='partner'&&access.permissions.view===true);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function metadataChanged(before:readonly {id:string}[],after:readonly {id:string}[],businessFields:string[]){
 const strip=(value:object)=>Object.fromEntries(Object.entries(value).filter(([key])=>!businessFields.includes(key)));
 return before.length!==after.length||after.some(row=>{const previous=before.find(p=>p.id===row.id);return !previous||!same(strip(previous),strip(row));});
}
// This early guard preserves the local draft. The independent database guard is
// authoritative and checks permissions again with the current membership.
export function assertUserChanges(before:StoreState,after:StoreState,access:UserAccess|null){
 if(access?.isOwner)return;
 if(!canView(access))throw Error('ليس لديك تصريح للاطلاع على بيانات المحل');
 if(!writePermissions.some(p=>canWrite(access,p.id)))throw Error('الحساب للعرض فقط؛ لا يمكن حفظ تعديلات');
 const require=(key:WritePermission)=>{if(!canWrite(access,key))throw Error('ليس لديك تصريح لتنفيذ هذه العملية؛ راجع المالك');};
 const changed=(key:keyof StoreState)=>!same(before[key],after[key]);
 const direct:Partial<Record<keyof StoreState,WritePermission>>={purchaseInvoices:'purchases',salesInvoices:'sales',cashierDays:'cashier',productionBatches:'production',stocktakingRecords:'stocktaking',accountPayments:'collections',employees:'staff',employeeTransactions:'staff'};
 for(const [field,permission] of Object.entries(direct))if(changed(field as keyof StoreState))require(permission!);
 if(changed('items')){
   const stockFields=['stock','lastSoldDate','costPrice','lastPurchasePrice','costHistory','costingVersion','supplierPrices'];
   if(changed('purchaseInvoices'))stockFields.push('retailPrice','wholesalePrice');
   if(metadataChanged(before.items,after.items,stockFields))require('catalog');
   else if(!['purchaseInvoices','salesInvoices','cashierDays','productionBatches','stocktakingRecords'].some(k=>changed(k as keyof StoreState)))require('catalog');
 }
 if(changed('suppliers')&&(metadataChanged(before.suppliers,after.suppliers,['balance','totalPurchases','invoicesCount'])||!changed('purchaseInvoices')&&!changed('accountPayments')))require('contacts');
 if(changed('customers')&&(metadataChanged(before.customers,after.customers,['balance','totalSales','invoicesCount','lastPurchaseDate'])||!changed('salesInvoices')&&!changed('accountPayments')))require('contacts');
 if(changed('expenses')){
  const modified=after.expenses.filter(e=>!same(before.expenses.find(p=>p.id===e.id),e));
  if(after.expenses.length<before.expenses.length||modified.some(e=>!(e.sourceEmployeeTransactionId&&canWrite(access,'staff')&&changed('employeeTransactions'))&&!(e.sourceInvoiceId&&canWrite(access,'sales')&&changed('salesInvoices')&&e.paidFrom==='تسوية مخزون (بدون نقدية)')))require('expenses');
 }
 if(changed('partners')&&(metadataChanged(before.partners,after.partners,['totalPaidFromPocket','totalWithdrawals'])||!changed('expenses')))require('partners');
 if(changed('shifts'))throw Error('إدارة البيانات القديمة متاحة للمالك فقط');
 if(changed('auditLogs')&&!writePermissions.some(p=>canWrite(access,p.id)))throw Error('الحساب للعرض فقط');
}
