import React,{useMemo,useState} from 'react';
import {Modal} from './Modal';
import type {StoreState} from '../lib/storeState';
import type {ReportRange} from '../lib/reporting';
import {money} from '../lib/reporting';
import {businessDate} from '../lib/dates';
import {financialPosition} from '../lib/financialOpening';
import {parseLocalizedNumber} from '../lib/cashierRows';
export function FinancialOpeningPanel({state,range,onSave}:{state:StoreState;range:ReportRange;onSave?:(date:string,amount:number,reason:string)=>Promise<void>}){
 const opening=state.financialOpenings[0],today=businessDate(),end=range.to<today?range.to:today;
 const position=useMemo(()=>financialPosition(state,range.from,end),[state,range.from,end]);
 const [editing,setEditing]=useState(false),[date,setDate]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const edit=()=>{setDate(opening?.date??today.slice(0,7)+'-01');setAmount(opening?String(opening.amount):'');setReason('');setError('');setEditing(true);};
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(!onSave||busy)return;setError('');const value=parseLocalizedNumber(amount);if(!amount.trim()||value===undefined){setError('أدخل الرصيد الفعلي؛ الصفر مقبول عند تأكيد عدم وجود رصيد.');return;}setBusy(true);try{await onSave(date,value,reason);setEditing(false);}catch(e){setError(e instanceof Error?e.message:'لم يتأكد حفظ الرصيد.');}finally{setBusy(false);}};
 const display=(value:number|null)=>value===null?'غير متاح':money(value)+' ج.م';
 return <section className="visual-card space-y-4" aria-label="بداية المدة المالية"><div className="record-heading"><div><h2 className="font-bold">بداية المدة المالية والرصيد الدفتري</h2><p className="operation-note">رصيد مرحّل من الفترات التي تمت تسويتها، ويُضاف إلى أموال النشاط. مبيعات الفترة وأرباحها وحصص الشركاء تُحسب بصورة مستقلة.</p></div>{onSave&&<button className="record-action" onClick={edit}>{opening?'تصحيح رصيد البداية':'تحديد رصيد أول المدة'}</button>}</div>
  {!opening?<p className="record-state">رصيد أول المدة لم يُحدد بعد.</p>:<><p>رصيد البداية في خزنة الشركة: <strong>{money(opening.amount)} ج.م</strong> · بدءًا من {opening.date}</p>
   {position?<><dl className="record-facts"><div><dt>رصيد بداية الفترة المعروضة</dt><dd>{display(position.opening)}</dd></div><div><dt>المتحصلات المسجلة</dt><dd>{display(position.inflow)}</dd></div><div><dt>بداية الفترة + المتحصلات</dt><dd>{display(position.resources)}</dd></div><div><dt>المدفوعات والمسحوبات</dt><dd>{display(position.outflow)}</dd></div><div><dt>الرصيد الدفتري حتى {position.to}</dt><dd>{display(position.closing)}</dd></div></dl>
    <p className="operation-note">يشمل حركة أموال النشاط عبر طرق التحصيل المسجلة. المشتريات تُحسب بالمدفوع شامل الضريبة، والرواتب من مصروفاتها مرة واحدة. تكاليف المخزون ومصروفات جيب الشريك لا تُخصم نقديًا مرة ثانية.</p>
    {position.closing!==null&&position.closing<0&&<p role="alert">الرصيد الدفتري بالسالب؛ راجع اكتمال المتحصلات والمدفوعات ورصيد البداية.</p>}
    {!!position.pendingRefunds&&<p>استردادات مشتريات لم يُسجل تحصيلها: {money(position.pendingRefunds)} ج.م، ولا تُضاف للرصيد.</p>}
    {!!position.issues.length&&<div role="alert">تعذر تأكيد الرصيد بسبب: {position.issues.join('، ')}.</div>}</>:<p className="record-state">الفترة المختارة تسبق بداية التشغيل المالي، أو لم تبدأ بعد.</p>}
   <p className="text-xs">يُرحّل رصيد نهاية الشهر تلقائيًا عند عرض الشهر التالي؛ لا تُدخل نفس الفلوس مرة ثانية.</p>
   <details><summary>سجل رصيد البداية ({opening.history.length})</summary>{[...opening.history].reverse().map(h=><p key={h.id}>{h.recordedAt} · {h.actorName} · {money(h.amount)} ج.م · {h.reason}</p>)}</details></>}
  {editing&&<Modal title={opening?'تصحيح رصيد أول المدة':'تحديد بداية المدة المالية'} description="للمالك فقط. يُسجل الرصيد المتبقي في خزنة الشركة بعد تسوية أرباح الفترات السابقة. التصحيح يعدّل رصيد البداية الأصلي؛ أي حركة جديدة تُسجل في قسمها." onClose={()=>setEditing(false)} busy={busy}><form onSubmit={e=>void save(e)} className="space-y-4"><label className="block">تاريخ بداية المدة<input className="operation-input" required type="date" max={today} disabled={busy||!!opening} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="block">الرصيد الافتتاحي في خزنة الشركة<input className="operation-input" required inputMode="decimal" maxLength={24} disabled={busy} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="أدخل المبلغ الفعلي"/></label><label className="block">بيان الرصيد أو سبب التصحيح<textarea className="operation-input" required minLength={6} maxLength={500} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button type="submit" className="record-action" disabled={busy}>{busy?'جارٍ تأكيد الحفظ…':'حفظ رصيد أول المدة'}</button></form></Modal>}
 </section>;
}
