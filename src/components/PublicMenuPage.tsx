import React, {useEffect, useState} from 'react';
import {fetchPublishedMenu, type MenuPublication} from '../lib/shopMenu';
import {menuLogo, ShopMenuView} from './ShopMenuView';

export default function PublicMenuPage() {
  const [menu, setMenu] = useState<MenuPublication | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublishedMenu(controller.signal).then(row => {
      if (controller.signal.aborted) return;
      setMenu(row?.content ?? null);
      setStatus('ready');
      document.title = row && 'name' in row.content ? `منيو ${row.content.name}` : 'منيو بُن العجوز';
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, [attempt]);

  return <main className="shop-menu-public" dir="rtl">
    {menu && 'image' in menu ? <section className="shop-menu-image-page">
      <header>
        <h1>منيو بُن العجوز</h1>
        <div className="shop-menu-image-actions">
          <button type="button" aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>تكبير الصورة</button>
          <a href={menu.image} download="agouz-menu.jpg">تحميل الصورة</a>
        </div>
      </header>
      <div className="shop-menu-image-viewport" data-zoomed={zoomed} tabIndex={zoomed ? 0 : undefined} role={zoomed ? 'region' : undefined} aria-label={zoomed ? 'صورة المنيو المكبرة' : undefined}>
        <img src={menu.image} alt="صورة منيو بُن العجوز" />
      </div>
    </section> : menu ? <ShopMenuView menu={menu} /> : <section className="shop-menu-notice">
      <span className="shop-menu-brand-mark"><img src={menuLogo} alt="" width="96" height="96" /></span>
      <span className="shop-menu-kicker">أصل المزاج</span>
      <h1>منيو بُن العجوز</h1>
      <p role="status">{status === 'loading' ? 'جارٍ تحميل المنيو…' : status === 'error' ? 'تعذر تحميل المنيو حاليًا.' : 'المنيو هيكون متاح قريب.'}</p>
      {status === 'error' && <button type="button" onClick={() => {setStatus('loading'); setAttempt(attempt + 1);}}>حاول تاني</button>}
    </section>}
  </main>;
}
