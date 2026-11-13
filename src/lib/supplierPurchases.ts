import type {PurchaseInvoice,SupplierPriceRecord} from '../types/erp';
export function latestSupplierPrices(prices:SupplierPriceRecord[]){
 const sorted=[...prices].sort((a,b)=>b.date.localeCompare(a.date));
 return sorted.filter((p,index)=>sorted.findIndex(other=>other.supplierId===p.supplierId)===index);
}
export function supplierPurchaseHistory(invoices:PurchaseInvoice[],supplierId:string){
 const purchases=invoices.filter(i=>i.supplierId===supplierId&&!i.isCancelled).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt??'').localeCompare(a.createdAt??''));
 const history=purchases.flatMap(invoice=>invoice.items.map(line=>({invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,date:invoice.date,...line})));
 const seenItems=new Set<string>();
 const latest=history.filter(line=>{
  if(seenItems.has(line.itemId))return false;
  seenItems.add(line.itemId);
  return true;
 });
 return {purchases,history,latest,total:purchases.reduce((s,i)=>s+i.totalAmount,0)};
}
