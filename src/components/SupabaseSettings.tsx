import {useId, useState, type FormEvent} from 'react';
import {Cloud} from 'lucide-react';
import {getSupabaseSettings, saveSupabaseCredentials} from '../lib/supabaseSync';
import {OperationHeader} from './OperationHeader';

export function SupabaseSettings({onBack}: {onBack: () => void}) {
  const id = useId();
  const {urlFromEnvironment, keyFromEnvironment, url: activeUrl, anonKey} = getSupabaseSettings();
  const [url, setUrl] = useState(activeUrl);
  const [key, setKey] = useState(keyFromEnvironment ? '' : anonKey);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const managed = urlFromEnvironment && keyFromEnvironment;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (managed) return;
    try {
      saveSupabaseCredentials(url, key);
      setError('');
      setMessage('اتحفظ إعداد الربط على الجهاز ده. أعد تحميل التطبيق لاستخدامه.');
    } catch {
      setMessage('');
      setError('تعذر حفظ إعداد الربط على الجهاز.');
    }
  }

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title="ربط Supabase" description="إعداد اتصال بيانات المحل." icon={Cloud} onBack={onBack}/>
      <div className="record-workspace">
        <form className="operation-surface space-y-3 max-w-xl" onSubmit={submit}>
          {managed && <p className="operation-note">الاتصال مُدار من إعدادات النشر.</p>}
          <div>
            <label htmlFor={id+'-url'}>عنوان المشروع</label>
            <input id={id+'-url'} name="url" type="url" dir="ltr" required value={url}
              readOnly={urlFromEnvironment} autoCapitalize="none" spellCheck={false}
              aria-describedby={urlFromEnvironment ? id+'-url-note' : undefined}
              onChange={event => {setUrl(event.target.value); setMessage(''); setError('');}}
              className="operation-input" placeholder="https://xxxx.supabase.co"/>
            {urlFromEnvironment && <p id={id+'-url-note'}>العنوان من إعدادات النشر.</p>}
          </div>
          <div>
            <label htmlFor={id+'-key'}>مفتاح Supabase العام</label>
            <input id={id+'-key'} name="publishable-key" type="password" dir="ltr" required={!keyFromEnvironment}
              value={key} readOnly={keyFromEnvironment} placeholder={keyFromEnvironment ? 'مُعدّ من النشر' : undefined}
              aria-describedby={keyFromEnvironment ? id+'-key-note' : undefined}
              onChange={event => {setKey(event.target.value); setMessage(''); setError('');}}
              className="operation-input"/>
            {keyFromEnvironment && <p id={id+'-key-note'}>المفتاح من إعدادات النشر.</p>}
          </div>
          {!managed && <button type="submit" className="operation-primary w-full">حفظ إعداد الربط على هذا الجهاز</button>}
          {message && <p role="status">{message}</p>}
          {error && <p role="alert" className="field-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
