import fs from 'node:fs';
import {loadTs} from './lib/load-ts.mjs';
const {buildInvoicePdf}=loadTs('src/lib/invoicePdf.ts');
const font=fs.readFileSync('public/fonts/Amiri-Regular.ttf').toString('base64');
const line={itemId:'blend',itemName:'توليفة العجوز محوج مخصوص',category:'manufactured_blend',quantity:2.5,unitLabel:'كجم',normalizedQtyInBaseUnit:2.5,unitPrice:400,unitCost:200,totalPrice:1000,totalCost:500,profit:500};
const base={id:'test',invoiceNumber:'WH-TEST-123',date:'2026-11-03',saleType:'wholesale',customerId:'test-customer',customerName:'كافيه العجوز — فرع القاهرة',discount:0,paymentMethod:'آجل',partnerName:'Test'};
fs.mkdirSync('tmp/pdfs',{recursive:true});
for(const count of [3,45]){
 const invoice={...base,items:Array.from({length:count},(_,i)=>({...line,itemId:'blend-'+i,itemName:line.itemName+' '+(i+1)})),subtotal:count*1000,totalAmount:count*1000,totalCost:count*500,netProfit:count*500,paidAmount:count*600,remainingAmount:count*400};
 const doc=buildInvoicePdf(invoice,font);const file=`tmp/pdfs/wholesale-arabic-${count}.pdf`;
 fs.writeFileSync(file,Buffer.from(doc.output('arraybuffer')));
 console.log(JSON.stringify({file,pages:doc.getNumberOfPages(),bytes:fs.statSync(file).size}));
}
