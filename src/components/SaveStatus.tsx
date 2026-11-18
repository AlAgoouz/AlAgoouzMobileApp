import React, {useEffect, useState} from 'react';

export function SaveStatus({savedAt, ready, message}: {savedAt?: number; ready: boolean; message: string}) {
  const [visibleAt, setVisibleAt] = useState<number>();

  useEffect(() => {
    if (savedAt === undefined) return;
    const remaining = 3000 - (Date.now() - savedAt);
    if (remaining <= 0) return;
    setVisibleAt(savedAt);
    const timer = window.setTimeout(() => setVisibleAt(undefined), remaining);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  const confirmed = ready && savedAt !== undefined && savedAt === visibleAt;
  const text = confirmed ? 'تم تأكيد الحفظ' : message;
  return <div role="status" className={text ? `save-status${confirmed ? ' save-status-confirmed' : ''}` : 'sr-only'}>{text}</div>;
}
