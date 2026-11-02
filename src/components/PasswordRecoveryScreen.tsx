import React, { useState } from 'react';

export function PasswordRecoveryScreen({onUpdatePassword,onCancel,passwordUpdated=false}: {onUpdatePassword:(password:string)=>Promise<void>;onCancel?:()=>Promise<void>;passwordUpdated?:boolean}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event:React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!passwordUpdated && password.length < 12) { setError('اختر كلمة مرور من 12 حرفًا على الأقل'); return; }
    if (!passwordUpdated && password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return; }
    setBusy(true); setError('');
    try { await onUpdatePassword(password); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر تحديث كلمة المرور'); }
    finally { setBusy(false); }
  };
  return <main dir="rtl" className="min-h-screen bg-[#1E1612] p-5 flex items-center justify-center">
    <form onSubmit={submit} className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4">
      <h1 className="text-xl font-bold">{passwordUpdated ? 'تم تحديث كلمة المرور' : 'اختر كلمة مرور جديدة'}</h1>
      <p>{passwordUpdated ? 'أكمل إنهاء الجلسات للعودة إلى تسجيل الدخول.' : '12 حرفًا على الأقل. بعد التحديث ستعود لتسجيل الدخول بكلمة المرور الجديدة.'}</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!passwordUpdated && <><label className="block">كلمة المرور الجديدة<input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event)=>setPassword(event.target.value)} className="block w-full border rounded-xl p-3" /></label>
      <label className="block">تأكيد كلمة المرور الجديدة<input required minLength={12} type="password" autoComplete="new-password" value={confirm} onChange={(event)=>setConfirm(event.target.value)} className="block w-full border rounded-xl p-3" /></label></>}
      <button disabled={busy} className="w-full rounded-xl bg-[#1E1612] text-[#FBF5B7] p-3 font-bold">{busy ? 'جارٍ التحديث…' : passwordUpdated ? 'إنهاء الجلسات والعودة للدخول' : 'تأكيد كلمة المرور الجديدة'}</button>
      {onCancel && <button type="button" disabled={busy} className="underline text-sm" onClick={async()=>{setBusy(true);try{await onCancel();}catch(failure){setError((failure as Error).message);}finally{setBusy(false);}}}>العودة لطلب رابط جديد</button>}
    </form>
  </main>;
}
