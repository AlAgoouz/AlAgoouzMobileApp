// Synthetic data only. Never loaded into a hosted project.
export function fixture(count=10000){
  const partner={id:'p1',name:'مالك الاختبار',username:'owner',role:'مدير',avatarLetter:'م',phone:'',sharePercent:100,totalPaidFromPocket:0,totalWithdrawals:0};
  const items=Array.from({length:100},(_,i)=>({id:'item-'+i,code:'P'+i,name:'صنف اختبار '+i,category:'direct_product',baseUnit:'piece',stock:1000,minStock:5,costPrice:20,lastPurchasePrice:20,retailPrice:30,wholesalePrice:25,canSellDirectly:true,hasRecipe:false,supplierPrices:[]}));
  const invoices=Array.from({length:count},(_,i)=>({id:'invoice-'+i,invoiceNumber:'INV-'+String(i).padStart(5,'0'),date:'2026-10-'+String(1+i%28).padStart(2,'0'),saleType:'retail',customerName:'عميل اختبار '+i,items:[{itemId:'item-'+i%100,itemName:'صنف اختبار '+i%100,category:'direct_product',quantity:1,unitLabel:'قطعة',normalizedQtyInBaseUnit:1,unitPrice:30,unitCost:20,totalPrice:30,totalCost:20,profit:10}],subtotal:30,discount:0,totalAmount:30,totalCost:20,netProfit:10,paidAmount:30,remainingAmount:0,paymentMethod:'نقدي',partnerName:partner.name}));
  return {id:'main_store',version:0,items,partners:[partner],sales_invoices:invoices,purchase_invoices:[],production_batches:[],suppliers:[],customers:[],expenses:[],employees:[],employee_transactions:[],stocktaking_records:[],audit_logs:[],shifts:[],account_payments:[]};
}
