import { useEffect, useState } from 'react';
import {downloadRecoverySnapshot} from '../lib/backupExport';
import {listRecoveryDrafts, recoveryDraftState, type RecoveryDraftAccess} from '../lib/recoveryDraft';

export function RecoveryDraftNotice({userId, activeKey, includeLegacy}: RecoveryDraftAccess) {
  const [drafts, setDrafts] = useState<ReturnType<typeof listRecoveryDrafts>>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const refresh = () => setDrafts(listRecoveryDrafts({userId, activeKey, includeLegacy}));
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userId, activeKey, includeLegacy]);

  if (!drafts.length) return null;

  return <details className="operation-note w-full" dir="rtl">
    <summary className="font-bold cursor-pointer py-2">مسودات حفظ سابقة على هذا الجهاز ({drafts.length})</summary>
    <p>نزّل المسودة وقارنها ببيانات المحل قبل استعادتها. قد تكون بعض التعديلات حُفظت على الخادم بالفعل.</p>
    <ul>
      {drafts.map(({key, savedAt}) => <li key={key} className="flex flex-wrap items-center gap-2 my-2">
        <time dateTime={savedAt}>{new Date(savedAt).toLocaleString('ar-EG')}</time>
        <button type="button" className="action-button" onClick={() => {
          try {
            downloadRecoverySnapshot(recoveryDraftState({userId, activeKey, includeLegacy}, key));
            setMessage('تم تجهيز مسودة الاسترداد للتنزيل.');
          } catch {
            setMessage('تعذر تنزيل المسودة. حدّث القائمة بإعادة فتح الصفحة.');
          }
        }}>تنزيل المسودة</button>
      </li>)}
    </ul>
    {message && <p role="status">{message}</p>}
  </details>;
}
