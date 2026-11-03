import React, { useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, RefreshCw } from 'lucide-react';

interface LoginScreenProps {
  onSignIn: (email: string, password: string, remember: boolean) => Promise<void>;
  authError?: string;
  onRequestPasswordReset?: (email: string) => Promise<void>;
  onResendConfirmation?: (email: string) => Promise<void>;
}

export function LoginScreen({ onSignIn, authError, onRequestPasswordReset, onResendConfirmation }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'reset' | 'resend'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const changeMode = (next: typeof mode) => {
    if (inFlight.current) return;
    setMode(next); setError(''); setNotice(''); setPassword(''); setVisible(false);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'login') await onSignIn(email.trim(), password, remember);
      else {
        const action = mode === 'reset' ? onRequestPasswordReset : onResendConfirmation;
        if (!action) throw new Error('هذه الخدمة غير متاحة حاليًا');
        await action(email.trim());
        setNotice('إذا كان البريد مسجلًا ومؤهلًا، ستصلك رسالة. راجع البريد الوارد والرسائل غير المرغوبة.');
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر إتمام الطلب؛ حاول مرة أخرى'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const title = mode === 'login' ? 'أهلًا برجوعك' : mode === 'reset' ? 'استعادة كلمة المرور' : 'تأكيد بريد الحساب';
  return <main dir="rtl" className="agouz-login">
    <div aria-hidden="true" className="login-orbit" />
    <section className="login-panel" aria-labelledby="login-title">
      <header className="login-brand">
        <img src="/logo.png" alt="بُن العجوز - أصل المزاج" width="112" height="112" />
        <span className="login-wordmark">بُن العجوز</span>
        <p>أصل المزاج • نظام الإدارة والحسابات</p>
      </header>
      <form onSubmit={submit} className="login-form" aria-busy={busy}>
        <div className="space-y-2"><h1 id="login-title">{title}</h1>
          <p className="login-intro">{mode === 'login' ? 'كل تفاصيل شغلك، في مكان واحد.' : mode === 'reset' ? 'أدخل بريد حسابك لإرسال رابط استعادة كلمة المرور.' : 'أدخل بريد حسابك لإعادة إرسال رسالة التأكيد.'}</p>
        </div>
        {notice && <p role="status" className="login-notice">{notice}</p>}
        {(error || (mode === 'login' && authError)) && <p role="alert" className="login-error">{error || authError}</p>}
        <label className="login-label" htmlFor="login-email">البريد الإلكتروني</label>
        <div className="login-input"><Mail aria-hidden="true" size={19} /><input id="login-email" type="email" dir="ltr" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="أدخل البريد الإلكتروني للحساب" disabled={busy} /></div>
        {mode === 'login' && <>
          <div className="login-password-row"><label className="login-label" htmlFor="login-password">كلمة المرور</label>
            {onRequestPasswordReset && <button className="login-text-button" type="button" disabled={busy} onClick={() => changeMode('reset')}>نسيت كلمة المرور؟</button>}
          </div>
          <div className="login-input"><Lock aria-hidden="true" size={19} /><input id="login-password" dir="ltr" type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" disabled={busy} />
            <button type="button" className="login-eye" aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          <label className="login-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={e => setRemember(e.target.checked)} />تذكر دخولي على هذا الجهاز</label>
        </>}
        <button className="login-submit" disabled={busy} type="submit">{busy ? <><Loader2 size={18} className="animate-spin" /><span>{mode === 'login' ? 'جارٍ تسجيل الدخول…' : 'جارٍ إرسال الرسالة…'}</span></> : <><span>{mode === 'login' ? 'تسجيل الدخول' : 'إرسال الرسالة'}</span><ArrowLeft size={18} /></>}</button>
        {mode !== 'login' && <button className="login-back" type="button" disabled={busy} onClick={() => changeMode('login')}>العودة لتسجيل الدخول</button>}
        {mode === 'login' && onResendConfirmation && <div className="login-help"><span>لم تصلك رسالة تأكيد البريد؟</span><button className="login-text-button" type="button" disabled={busy} onClick={() => changeMode('resend')}><RefreshCw size={14} aria-hidden="true" />إعادة إرسال تأكيد البريد</button></div>}
      </form>
    </section>
    <footer className="login-footer">بُن العجوز — أصل المزاج © {new Date().getFullYear()}</footer>
  </main>;
}
