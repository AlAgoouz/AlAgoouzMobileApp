import React,{useState} from 'react';
import {downloadReport} from '../lib/reportExports';
import type {ReportRange} from '../lib/reporting';
export function ReportExportButtons({range}:{range:ReportRange}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const run=async(format:'xlsx'|'pdf')=>{if(busy)return;setBusy(true);setError('');try{await downloadReport(format,range.from,range.to);}catch(e){setError(e instanceof Error?e.message:'تعذر تجهيز التقرير.');}finally{setBusy(false);}};
 return <section className="visual-card space-y-3" aria-label="تنزيل تقارير الفترة"><h2 className="font-bold">تنزيل تقارير الفترة</h2><p className="operation-note">ملفات من البيانات المسجلة على السيرفر للفترة المختارة. Excel يشمل المبيعات والمصروفات والمشتريات، مع الأرصدة الحالية للمخزون والعملاء والموردين والشركاء.</p><div className="record-actions"><button className="record-action" disabled={busy||!range.valid} onClick={()=>void run('xlsx')}>تصدير Excel</button><button className="record-action" disabled={busy||!range.valid} onClick={()=>void run('pdf')}>PDF للفترة</button></div>{busy&&<p role="status">جارٍ تجهيز التقرير من السيرفر…</p>}{error&&<p role="alert">{error}</p>}</section>;
}
