import {useId, useRef, useState} from 'react';
import {Download, FileSpreadsheet, Upload} from 'lucide-react';
import {Modal} from './Modal';
import {downloadExcelWorkbook, readExcelWorkbook, sheetSection, type ExcelSection} from '../lib/excelWorkbook';
import {planExcel, writableExcelSheets, type ExcelPlan} from '../lib/excelPlan';
import {findExcelReceipt, loadExcelSnapshot, submitExcelPlan} from '../lib/excelService';
import type {UserAccess} from '../lib/userAccess';
import type {Partner} from '../types/erp';
import './excel-section-tools.css';

type Props={section:ExcelSection; member:UserAccess; partners:Partner[]; selectedPartnerId?:string; hasPending:()=>boolean; refresh:()=>Promise<void>; openStocktaking:()=>void};
type Staged={id:string;version:number;plan:ExcelPlan;checked:boolean};
export function ExcelSectionTools(props:Props){
  const {section,member,partners,selectedPartnerId,hasPending,refresh,openStocktaking}=props;
  const config=sheetSection(section);
  const writable=writableExcelSheets(section,member);
  const dated=Object.values(config.sheets).some(sheet=>sheet.dated);
  const [open,setOpen]=useState(false);
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [partnerId,setPartnerId]=useState(selectedPartnerId??'');
  const [file,setFile]=useState<File|null>(null);
  const [staged,setStaged]=useState<Staged|null>(null);
  const [receipt,setReceipt]=useState<Awaited<ReturnType<typeof findExcelReceipt>>>(null);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const feedback=useRef<HTMLDivElement>(null);
  const id=useId();
  const execute=async(action:()=>Promise<void>)=>{
    if(lock.current)return;
    lock.current=true;
    setBusy(true);
    setError('');
    setStatus('');
    try{await action();}catch(failure){setError(failure instanceof Error?failure.message:'تعذر تجهيز ملف Excel. حاول مرة تانية.');}
    finally{lock.current=false;setBusy(false);requestAnimationFrame(()=>feedback.current?.focus());}
  };
  const download=() => execute(async()=>{
    if(from&&to&&from>to)throw Error('تاريخ البداية لازم يسبق تاريخ النهاية.');
    const {state}=await loadExcelSnapshot();
    await downloadExcelWorkbook(section,state,{from,to},writable);
    setStatus('اتجهز ملف Excel للتنزيل.');
  });
  const preview=()=>execute(async()=>{
    if(!file)return;
    setStaged(null);
    setReceipt(null);
    if(hasPending())throw Error('استنى تأكيد الحفظ الجاري قبل معاينة الملف.');
    const parsed=await readExcelWorkbook(file,section,writable);
    const previous=await findExcelReceipt(parsed.id);
    if(previous){setReceipt(previous);return;}
    const {state,version}=await loadExcelSnapshot();
    const plan=planExcel(parsed,state,member,partnerId||undefined);
    setStaged({id:parsed.id,version,plan,checked:false});
    if(plan.issues.length)return;
    if(!plan.effects.length){setStatus('الملف مفيهوش تغييرات جديدة.');return;}
    await submitExcelPlan('preview',parsed.id,version,plan);
    setStaged({id:parsed.id,version,plan,checked:true});
    setStatus('المعاينة جاهزة للاعتماد.');
  });
  const approve=()=>execute(async()=>{
    if(!staged?.checked)return;
    if(hasPending())throw Error('استنى تأكيد الحفظ الجاري قبل اعتماد الملف.');
    const prior=await findExcelReceipt(staged.id);
    if(prior){setReceipt(prior);setStaged(null);return;}
    try{
      await submitExcelPlan('approve',staged.id,staged.version,staged.plan);
    }catch(failure){
      const confirmed=await findExcelReceipt(staged.id).catch(()=>null);
      if(!confirmed){setStaged({...staged,checked:false});throw failure;}
    }
    const confirmed=await findExcelReceipt(staged.id);
    if(!confirmed)throw Error('لسه ما وصلش إيصال الاعتماد. تقدر تراجع حالة الملف من المعاينة.');
    setReceipt(confirmed);
    setStaged(null);
    setStatus('تم اعتماد الدفعة وحفظها.');
    await refresh();
  });
  const loadFile=(uploaded:File|null)=>{
    setFile(uploaded);setStaged(null);setReceipt(null);setError('');setStatus('');
  };
  const eligible=!!staged?.checked&&!receipt;
  return <>
    <div className="excel-tools-bar">
      <button type="button" className="record-action excel-tools-trigger" onClick={()=>setOpen(true)}><FileSpreadsheet size={17} aria-hidden="true"/> Excel</button>
    </div>
    {open&&<Modal title={'Excel — '+config.title} wide busy={busy} onClose={()=>setOpen(false)} footer={eligible&&<button className="action-button excel-approve" disabled={busy} type="button" onClick={()=>void approve()}>اعتماد وحفظ الدفعة</button>}>
      <div className="excel-tools">
        <form className="excel-tools-block" aria-labelledby={id+'-export'} method="post" onSubmit={event=>{event.preventDefault();void download();}}>
          <h3 id={id+'-export'}>تنزيل بيانات القسم</h3>
          {dated&&<fieldset className="excel-tools-dates">
            <legend>فترة الحركات · اختياري</legend>
            <label htmlFor={id+'-from'}>من تاريخ<input className="operation-input" type="date" id={id+'-from'} name="from" value={from} onChange={e=>setFrom(e.target.value)}/></label>
            <label htmlFor={id+'-to'}>إلى تاريخ<input className="operation-input" type="date" id={id+'-to'} name="to" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
          </fieldset>}
          <button disabled={busy} type="submit" className="record-action"><Download size={17} aria-hidden="true"/> تنزيل Excel</button>
        </form>
        {writable.size>0&&<form className="excel-tools-block" method="post" aria-labelledby={id+'-upload'} onSubmit={event=>{event.preventDefault();void preview();}}>
          <h3 id={id+'-upload'}>رفع Excel للمراجعة</h3>
          <label htmlFor={id+'-file'}>ملف القسم <span>(مطلوب)</span></label>
          <input className="operation-input" type="file" id={id+'-file'} name="workbook" accept=".xlsx" aria-describedby={id+'-hint'} required disabled={busy}
            onChange={event=>loadFile(event.target.files?.[0]??null)}/>
          <small id={id+'-hint'}>صيغة XLSX من نفس القسم · حتى 4 ميجابايت و2000 صف لكل تبويب قابل للرفع.</small>
          <small>التبويبات القابلة للرفع: {[...writable].map(key=>config.sheets[key].name).join('، ')}.</small>
          {(section==='expenses'||section==='staff_payroll')&&<label htmlFor={id+'-partner'}>الشريك المالي للحركات
            <select className="operation-input" id={id+'-partner'} name="partner" disabled={busy} value={partnerId} onChange={event=>{setPartnerId(event.target.value);setStaged(null);setStatus('');}}>
              <option value="">اختر شريكًا</option>
              {partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>}
          <button disabled={busy} type="submit" className="record-action"><Upload size={17} aria-hidden="true"/> معاينة الملف</button>
        </form>}
        {section==='inventory'&&<div className="excel-tools-block"><p>رفع الكميات الفعلية واعتماد فروق المخزون من جرد الميزان.</p><button className="record-action" type="button" onClick={openStocktaking}>فتح جرد الميزان</button></div>}
        {section==='cashier_sync'&&<p className="operation-note">التقرير المالي وتقرير الأصناف يترفعوا من شاشة يوم الكاشير.</p>}
        <div tabIndex={-1} ref={feedback}>
          {busy&&<p role="status">جارٍ معالجة الطلب…</p>}
          {error&&<p role="alert" className="excel-tools-error">{error}</p>}
          {status&&<p role="status">{status}</p>}
          {receipt&&<div className="excel-tools-receipt">
            <strong>الدفعة مسجلة</strong>
            <p>تاريخ الاعتماد {new Date(receipt.approvedAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'})}</p>
            <p>رقم الإيصال <bdi>{receipt.reference}</bdi></p>
          </div>}
          {staged?.plan.issues.length ? <ul aria-label="أخطاء الملف" className="excel-tools-errors">
            {staged.plan.issues.map((issue,index)=><li key={index}><strong>{issue.sheet}{issue.line?' · صف '+issue.line:''}{issue.column?' · '+issue.column:''}</strong><p>{issue.message}</p></li>)}
          </ul> : null}
        </div>
        {staged&&staged.plan.effects.length>0&&<>
          <h3 id={id+'-changes'}>التغييرات المتوقعة</h3>
          <p>{staged.plan.added} سجل جديد · {staged.plan.updated} سجل محدّث</p>
          <div className="excel-changes" tabIndex={0} role="region" aria-labelledby={id+'-changes'}>
            <table>
              <thead><tr><th scope="col">السجل</th><th scope="col">البيان</th><th scope="col">قبل</th><th scope="col">بعد</th></tr></thead>
              <tbody>{staged.plan.effects.map((effect,index)=><tr key={index}>
                <th scope="row"><small>{effect.section}</small>{effect.label}</th>
                <td>{effect.field}</td><td><bdi>{effect.before}</bdi></td><td><bdi>{effect.after}</bdi></td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
      </div>
    </Modal>}
  </>;
}
