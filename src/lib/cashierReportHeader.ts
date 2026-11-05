import type {ImportKind} from './importJobs';
export function cashierReportHeader(matrix:unknown[][]):{date:string|null;kind:ImportKind|null}{
 const lines=matrix.slice(0,20).flatMap(row=>row.slice(0,100).flatMap(value=>String(value??'').split(/\r?\n/).map(line=>line.trim())));
 const kind:ImportKind|null=lines.some(line=>/Menu\s+Item\s+Sales\s+Report\s*\(UWS\)/i.test(line))?'items':lines.some(line=>/System\s+Sales\s+Report\s*\(UWS\)/i.test(line))?'financial':null;
 const dates=new Set<string>();
 for(const line of lines.filter(line=>/^Date Range\b/i.test(line))){
  const match=line.match(/^Date Range\s+(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})\s*-\s*(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})$/i);
  if(!match)throw Error('تاريخ التقرير غير واضح؛ ارفع تقرير يوم واحد.');
  const day=(offset:number)=>{
   const [d,m,rawY]=match.slice(offset,offset+3).map(Number),y=rawY<100?2000+rawY:rawY;
   const value=new Date(Date.UTC(y,m-1,d));
   if(value.getUTCFullYear()!==y||value.getUTCMonth()!==m-1||value.getUTCDate()!==d)throw Error('تاريخ التقرير غير صالح.');
   return value.toISOString().slice(0,10);
  };
  const start=day(1),end=day(4);
  if(start!==end)throw Error('التقرير يشمل أكثر من يوم؛ صدّر تقريرًا مستقلًا لكل يوم.');
  dates.add(start);
 }
 if(dates.size>1)throw Error('يوجد أكثر من تاريخ داخل التقرير.');
 if(kind&&!dates.size)throw Error('تاريخ يوم البيع غير موجود داخل التقرير.');
 return {date:[...dates][0]??null,kind};
}
export async function inspectCashierFile(file:File){
 if(!file.size||file.size>10*1024*1024)throw Error('اختر ملفًا غير فارغ، بحد أقصى 10 ميجابايت.');
 if(!/\.(csv|xls|xlsx)$/i.test(file.name))throw Error('الصيغ المقبولة: CSV وXLS وXLSX.');
 const XLSX=await import('xlsx');
 const book=XLSX.read(await file.arrayBuffer(),{type:'array',sheetRows:20,sheets:0,cellFormula:false,cellHTML:false,cellText:false});
 if(!book.SheetNames.length)throw Error('الملف لا يحتوي ورقة بيانات.');
 return cashierReportHeader(XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]],{header:1,raw:true,defval:''}));
}
