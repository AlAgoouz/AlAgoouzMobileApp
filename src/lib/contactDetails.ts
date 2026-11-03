import type {Customer,Supplier} from '../types/erp';

export function phoneDigits(value:string){
  return value.replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/[\s()+.-]/g,'');
}
export function checkContactPhone(value:string){
  if(!/^\d{7,15}$/.test(phoneDigits(value).replace(/^00/,'')))throw Error('أدخل رقم تليفون صحيحًا من 7 إلى 15 رقمًا');
}
export function checkCustomerDetails(customer:Pick<Customer,'name'|'phone'|'area'>){
  if(!customer.name.trim()||!customer.area?.trim())throw Error('اسم العميل والمنطقة مطلوبان');
  checkContactPhone(customer.phone);
}
export function checkSupplierDetails(supplier:Pick<Supplier,'name'|'phone'|'address'|'representativeName'>){
  if(!supplier.name.trim()||!supplier.address?.trim()||!supplier.representativeName?.trim())throw Error('اسم المورد والعنوان واسم المندوب مطلوبة');
  checkContactPhone(supplier.phone);
}
export function whatsAppNumber(phone:string){
  checkContactPhone(phone);let digits=phoneDigits(phone);
  if(digits.startsWith('00'))digits=digits.slice(2);
  else if(digits.startsWith('0'))digits='20'+digits.slice(1);
  else if(/^1[0125]\d{8}$/.test(digits))digits='20'+digits;
  return digits;
}
