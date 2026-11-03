import type {SalesInvoice} from '../types/erp';
import {jsPDF} from 'jspdf';
let fontPromise:Promise<string>|undefined;
async function font(){
 if(!fontPromise)fontPromise=fetch('/fonts/Amiri-Regular.ttf').then(async response=>{
  if(!response.ok)throw Error('تعذر تحميل الخط العربي؛ أعد المحاولة');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
 }).catch(e=>{fontPromise=undefined;throw e;});
 return fontPromise;
}
export function buildInvoicePdf(invoice:SalesInvoice,fontBase64:string){
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 doc.addFileToVFS('Amiri-Regular.ttf',fontBase64);doc.addFont('Amiri-Regular.ttf','Amiri','normal');doc.setFont('Amiri');
 doc.setProperties({title:`Agouz ${invoice.invoiceNumber}`,author:'Agouz'});
 let y=20;
 const arabic=(value:string,x:number,lineY:number,size=12)=>{doc.setFontSize(size);doc.text(value.replace(/[\u0000-\u001f]/g,' '),x,lineY,{align:'right'});};
 const number=(value:number,x:number,lineY:number)=>{doc.setFontSize(11);doc.text(value.toLocaleString('en-US',{maximumFractionDigits:2}),x,lineY,{align:'right'});};
 const header=()=>{doc.setFillColor(30,22,18);doc.rect(0,0,210,34,'F');doc.setTextColor(251,245,183);arabic('بُن العجوز',196,18,22);doc.setFontSize(11);doc.text('AGOUZ',14,19);doc.setTextColor(30,22,18);y=45;};
 const columns=()=>{doc.setFillColor(246,240,223);doc.rect(14,y-7,182,12,'F');arabic('الصنف',192,y);arabic('الكمية (كجم)',114,y);arabic('سعر الوحدة',80,y);arabic('القيمة',42,y);y+=13;};
 header();arabic('فاتورة مبيعات جملة',196,y,17);y+=10;arabic(`العميل: ${invoice.customerName}`,196,y);y+=8;
 doc.setFontSize(11);doc.text(invoice.invoiceNumber,14,y);arabic(`التاريخ: ${invoice.date}`,196,y);y+=14;columns();
 for(const line of invoice.items){
  const wrapped=doc.splitTextToSize(line.itemName.replace(/[\u0000-\u001f]/g,' '),70) as string[];
  const height=Math.max(13,wrapped.length*7+5);
  if(y+height>270){doc.addPage();header();columns();}
  wrapped.forEach((text,index)=>arabic(text,192,y+index*7));number(line.normalizedQtyInBaseUnit,114,y);number(line.unitPrice,80,y);number(line.totalPrice,42,y);
  doc.setDrawColor(225,218,202);doc.line(14,y+height-5,196,y+height-5);y+=height;
 }
 if(y+61>270){doc.addPage();header();}
 y+=5;arabic('الإجمالي بالجنيه المصري',196,y,14);number(invoice.totalAmount,55,y);y+=10;
 arabic(`طريقة الدفع: ${invoice.paymentMethod}`,196,y);y+=9;arabic('المدفوع',196,y);number(invoice.paidAmount,55,y);y+=9;arabic('المتبقي',196,y);number(invoice.remainingAmount,55,y);y+=13;arabic('شكرًا لتعاملكم مع بُن العجوز',196,y);
 const pages=doc.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);doc.setFontSize(10);doc.setTextColor(110);doc.text(`${page} / ${pages}`,105,286,{align:'center'});}
 return doc;
}
export async function invoicePdfFile(invoice:SalesInvoice){
 const doc=buildInvoicePdf(invoice,await font());const blob=doc.output('blob');
 return new File([blob],`Agouz-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf`,{type:'application/pdf'});
}
export function downloadInvoiceFile(file:File){
 const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
