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
    <form method="post" onSubmit={submit} className="login-form" aria-labelledby="login-title" aria-busy={busy}>
      <div className="login-heading">
        <h1 id="login-title">{passwordUpdated ? 'تم تحديث كلمة المرور' : 'اختر كلمة مرور جديدة'}</h1>
        <p id="recovery-instructions" className="login-intro">{passwordUpdated ? 'أكمل إنهاء الجلسات للعودة إلى تسجيل الدخول.' : '12 حرفًا على الأقل. بعد التحديث ستعود لتسجيل الدخول بكلمة المرور الجديدة.'}</p>
      </div>
      {error && <p role="alert" className="login-error">{error}</p>}
      {!passwordUpdated && <>
        <div className="login-field">
          <label className="login-label" htmlFor="recovery-password">كلمة المرور الجديدة</label>
          <div className="login-input"><input id="recovery-password" aria-describedby="recovery-instructions" name="new-password" dir="ltr" disabled={busy} required minLength={12} type="password" autoComplete="new-password" enterKeyHint="next" value={password} onChange={event => setPassword(event.target.value)} /></div>
        </div>
        <div className="login-field">
          <label className="login-label" htmlFor="recovery-confirm">تأكيد كلمة المرور الجديدة</label>
          <div className="login-input"><input id="recovery-confirm" name="confirm-password" dir="ltr" disabled={busy} required minLength={12} type="password" autoComplete="new-password" enterKeyHint="done" value={confirm} onChange={event => setConfirm(event.target.value)} /></div>
        </div>
      </>}
      <button type="submit" disabled={busy} className="login-submit">{busy ? 'جارٍ التحديث…' : passwordUpdated ? 'إنهاء الجلسات والعودة للدخول' : 'تأكيد كلمة المرور الجديدة'}</button>
      {onCancel && <button type="button" disabled={busy} className="login-back" onClick={async()=>{setBusy(true);try{await onCancel();}catch(failure){setError((failure as Error).message);}finally{setBusy(false);}}}>العودة لطلب رابط جديد</button>}
    </form>
  </AuthenticationLayout>;
}
