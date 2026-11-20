import React, { useState } from 'react';
import { AuthenticationLayout } from './AuthenticationLayout';

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
  return <AuthenticationLayout>
    <form onSubmit={submit} className="login-form" aria-busy={busy}>
      <h1 id="login-title">{passwordUpdated ? 'تم تحديث كلمة المرور' : 'اختر كلمة مرور جديدة'}</h1>
      <p className="login-intro">{passwordUpdated ? 'أكمل إنهاء الجلسات للعودة إلى تسجيل الدخول.' : '12 حرفًا على الأقل. بعد التحديث ستعود لتسجيل الدخول بكلمة المرور الجديدة.'}</p>
      {error && <p role="alert" className="login-error">{error}</p>}
      {!passwordUpdated && <><label className="login-label">كلمة المرور الجديدة<input name="new-password" dir="ltr" disabled={busy} required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event)=>setPassword(event.target.value)} className="operation-input" /></label>
      <label className="login-label">تأكيد كلمة المرور الجديدة<input name="confirm-password" dir="ltr" disabled={busy} required minLength={12} type="password" autoComplete="new-password" value={confirm} onChange={(event)=>setConfirm(event.target.value)} className="operation-input" /></label></>}
      <button disabled={busy} className="login-submit">{busy ? 'جارٍ التحديث…' : passwordUpdated ? 'إنهاء الجلسات والعودة للدخول' : 'تأكيد كلمة المرور الجديدة'}</button>
      {onCancel && <button type="button" disabled={busy} className="login-back" onClick={async()=>{setBusy(true);try{await onCancel();}catch(failure){setError((failure as Error).message);}finally{setBusy(false);}}}>العودة لطلب رابط جديد</button>}
    </form>
  </AuthenticationLayout>;
}
