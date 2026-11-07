import React, {useEffect, useState} from 'react';
import {fetchPublishedMenu, type ShopMenu} from '../lib/shopMenu';
import {ShopMenuView} from './ShopMenuView';

export default function PublicMenuPage() {
  const [menu, setMenu] = useState<ShopMenu | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublishedMenu(controller.signal).then(row => {
      if (controller.signal.aborted) return;
      setMenu(row?.content ?? null);
      setStatus('ready');
      document.title = row ? `منيو ${row.content.name}` : 'منيو بُن العجوز';
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, [attempt]);

  return <main className="shop-menu-public" dir="rtl">
    {menu ? <ShopMenuView menu={menu} /> : <section className="shop-menu-notice">
      <img src="/logo.png" alt="" width="80" height="80" />
      <h1>منيو بُن العجوز</h1>
      <p role="status">{status === 'loading' ? 'جارٍ تحميل المنيو…' : status === 'error' ? 'تعذر تحميل المنيو حاليًا.' : 'المنيو هيكون متاح قريب.'}</p>
      {status === 'error' && <button type="button" onClick={() => {setStatus('loading'); setAttempt(attempt + 1);}}>حاول تاني</button>}
    </section>}
  </main>;
}
