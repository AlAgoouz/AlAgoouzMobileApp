import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, RefreshCw } from 'lucide-react';
import { AuthenticationLayout } from './AuthenticationLayout';

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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusNewMode = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!focusNewMode.current) return;
    headingRef.current?.focus();
    focusNewMode.current = false;
  }, [mode]);

  const changeMode = (next: typeof mode) => {
    if (inFlight.current) return;
    focusNewMode.current = true;
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
  return <AuthenticationLayout>
      <form method="post" onSubmit={submit} className="login-form" aria-labelledby="login-title" aria-busy={busy}>
        <div className="login-heading"><h1 id="login-title" ref={headingRef} tabIndex={-1}>{title}</h1>
          {mode !== 'login' && <p className="login-intro">{mode === 'reset' ? 'أدخل بريد حسابك لإرسال رابط استعادة كلمة المرور.' : 'أدخل بريد حسابك لإعادة إرسال رسالة التأكيد.'}</p>}
        </div>
        {notice && <p role="status" className="login-notice">{notice}</p>}
        {(error || (mode === 'login' && authError)) && <p role="alert" className="login-error">{error || authError}</p>}
        <div className="login-field">
          <label className="login-label" htmlFor="login-email">البريد الإلكتروني</label>
          <div className="login-input">
            <span className="login-field-icon" aria-hidden="true"><Mail size={17} /></span>
            <input id="login-email" name="email" type="email" dir="ltr" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint={mode === 'login' ? 'next' : 'send'} required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
          </div>
        </div>
        {mode === 'login' && <>
          <div className="login-field">
            <label className="login-label" htmlFor="login-password">كلمة المرور</label>
            <div className="login-input">
              <span className="login-field-icon" aria-hidden="true"><Lock size={17} /></span>
              <input id="login-password" name="password" dir="ltr" type={visible ? 'text' : 'password'} autoComplete="current-password" enterKeyHint="go" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
              <button type="button" className="login-eye" aria-label="إظهار كلمة المرور" aria-pressed={visible} disabled={busy} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
            </div>
          </div>
          <label className="login-remember"><input type="checkbox" name="remember" checked={remember} disabled={busy} onChange={e => setRemember(e.target.checked)} />تذكر دخولي على هذا الجهاز</label>
        </>}
        <button className="login-submit" disabled={busy} type="submit">{busy ? <><Loader2 aria-hidden="true" size={18} className="animate-spin" /><span>{mode === 'login' ? 'جارٍ تسجيل الدخول…' : 'جارٍ إرسال الرسالة…'}</span></> : <><span>{mode === 'login' ? 'تسجيل الدخول' : 'إرسال الرسالة'}</span><ArrowLeft className="login-submit-arrow" aria-hidden="true" size={18} /></>}</button>
        {mode !== 'login' && <button className="login-back" type="button" disabled={busy} onClick={() => changeMode('login')}>العودة لتسجيل الدخول</button>}
        {mode === 'login' && (onRequestPasswordReset || onResendConfirmation) && (
          <div className="login-help">
            {onRequestPasswordReset && <button className="login-text-button" type="button" disabled={busy} onClick={() => changeMode('reset')}>نسيت كلمة المرور؟</button>}
            {onResendConfirmation && <button className="login-text-button" type="button" disabled={busy} onClick={() => changeMode('resend')}><RefreshCw size={14} aria-hidden="true" />إعادة إرسال تأكيد البريد</button>}
          </div>
        )}
      </form>
  </AuthenticationLayout>;
}
