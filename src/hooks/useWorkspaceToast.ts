import {useEffect,useRef,useState} from 'react';

export function useWorkspaceToast() {
  const [toastNotification, setToastNotification] = useState<{
    id: number;
    message: string;
    tone: 'ok' | 'warn' | 'danger' | 'info';
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const scheduleToastDismiss = (id: number) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastNotification((prev) => (prev?.id === id ? null : prev));
    }, 5000);
  };

  const pauseToastDismiss = () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const showToast = (msg: string, explicitTone?: 'ok' | 'warn' | 'danger' | 'info') => {
    const inferredTone: 'ok' | 'warn' | 'danger' | 'info' =
      explicitTone ??
      (/^(?:تعذر|فشل|خطأ)/.test(msg.trim())
        ? 'danger'
        : /^(?:لا يمكن|حساب المورد مرتبط|حساب العميل مرتبط|أُلغيت|هذه فاتورة معتمدة)/.test(msg.trim())
          ? 'warn'
          : 'ok');
    const id = Date.now();
    setToastNotification({ id, message: msg, tone: inferredTone });
    scheduleToastDismiss(id);
  };

  useEffect(() => () => {
    if(toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);
  return {toastNotification,setToastNotification,scheduleToastDismiss,pauseToastDismiss,showToast};
}
