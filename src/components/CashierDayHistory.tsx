import React,{useMemo,useState} from 'react';
import type {CashierDay} from '../types/erp';
import {RecordPagination,useRecordPage} from './RecordPagination';
export function CashierDayHistory({days}:{days:CashierDay[]}){
 const [search,setSearch]=useState('');
 const sorted=useMemo(()=>[...days].filter(d=>d.date.includes(search)).sort((a,b)=>b.date.localeCompare(a.date)),[days,search]);
 const page=useRecordPage(sorted,search);
 return <section className="p-3 space-y-3"><label className="block">البحث بتاريخ يوم الكاشير<input placeholder="YYYY-MM-DD" className="w-full border p-2 rounded-xl" value={search} onChange={e=>setSearch(e.target.value)}/></label><RecordPagination {...page}/>{page.visible.map(d=><article key={d.id} className="border rounded-xl p-3 bg-white space-y-2"><h2 className="font-bold">{d.date} — {d.status==='approved'?'يوم معتمد':'يوم غير مكتمل'}</h2><p>الإيراد: {d.financialReport?.totalRevenue.toLocaleString('ar-EG')??'غير محدد'} ج.م</p><p>التكلفة: {d.status==='approved'?(d.correctedTotalCost??d.totalCost)?.toLocaleString('ar-EG')+' ج.م':'بانتظار اعتماد التقريرين'}</p>{d.status==='approved'&&<p>مجمل الربح: {Number((d.financialReport!.totalRevenue-(d.correctedTotalCost??d.totalCost!)).toFixed(2)).toLocaleString('ar-EG')} ج.م</p>}<p className="text-xs break-words">المالي: {d.financialReport?.fileName??'ناقص'} — الأصناف: {d.itemsReport?.fileName??'ناقص'}</p>{!!d.shortages?.length&&<p className="text-red-700">سُجل عجز في {d.shortages.length} أصناف عند الاعتماد.</p>}</article>)}{!page.total&&<p>لا توجد أيام كاشير مطابقة.</p>}</section>;
}
