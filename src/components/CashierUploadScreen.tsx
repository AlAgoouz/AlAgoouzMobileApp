import React from 'react';
import {FolderSync} from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {ImportJobsPanel} from './ImportJobsPanel';
export function CashierUploadScreen({name,onLogout}:{name:string;onLogout:()=>void}){
 return <main dir="rtl" className="operation-screen max-w-3xl mx-auto p-4 space-y-4 min-h-screen bg-[#FAF8F4]">
  <OperationHeader title="رفع تقارير الكاشير" description={`أهلًا ${name} — حساب رفع ملفات فقط`} icon={FolderSync} onBack={onLogout} backLabel="خروج"/>
  <p className="operation-note">ارفع التقرير المالي وتقرير الأصناف لنفس يوم العمل. يراجع المالك الملفات ويعتمدها؛ هذا الحساب لا يطّلع على حسابات المحل.</p><ImportJobsPanel/>
  <button type="button" onClick={onLogout} className="login-back w-full">تسجيل الخروج</button>
 </main>;
}
