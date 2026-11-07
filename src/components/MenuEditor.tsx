import React, {useEffect, useState} from 'react';
import {ArrowDown, ArrowUp, Eye, ImagePlus, Plus, QrCode, Smartphone, UtensilsCrossed} from 'lucide-react';
import type {InventoryItem} from '../types/erp';
import {categoryLabel} from '../lib/itemPolicy';
import {unitLabel} from '../lib/units';
import {getSupabaseClient} from '../lib/supabaseSync';
import {compressMenuPhoto, emptyMenu, menuItemLimit, menuSchema, menuUrl, prepareMenu, type MenuItem, type ShopMenu} from '../lib/shopMenu';
import {Modal} from './Modal';
import {OperationHeader} from './OperationHeader';
import {ShopMenuView} from './ShopMenuView';
import './menu-editor.css';

const templates = [
  {id: 'classic', name: 'هوية العجوز', detail: 'منيو أنيق بتفاصيل ذهبية'},
  {id: 'photos', name: 'كروت بالصور', detail: 'واجهة إسبريسو وصور للأصناف'},
  {id: 'compact', name: 'قائمة مختصرة', detail: 'صفوف واضحة لمقارنة الأسعار'},
] as const;

const sampleItems: MenuItem[] = [
  {id: 'example-1', name: 'توليفة العجوز', section: 'البن والتوليفات', description: 'تحميص متوازن بنكهة غنية.', photo: '', visible: true, prices: [{label: '٢٥٠ جم', amount: 115}, {label: '٥٠٠ جم', amount: 220}]},
  {id: 'example-2', name: 'بن برازيلي', section: 'البن والتوليفات', description: '', photo: '', visible: true, prices: [{label: '٢٥٠ جم', amount: 140}]},
  {id: 'example-3', name: 'قهوة تركي', section: 'المشروبات', description: 'تُحضّر على الطلب.', photo: '', visible: true, prices: [{label: 'فنجان', amount: 35}]},
];

function PhotoInput({label, value, onChange, onBusy, onError}: {
  label: string; value: string; onChange: (photo: string) => void;
  onBusy: (busy: boolean) => void; onError: (message: string) => void;
}) {
  return <div className="menu-photo-field">
    {value && <img src={value} alt="" width="52" height="52" />}
    <label><span><ImagePlus size={16} aria-hidden="true" />{label}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        onBusy(true);
        try {
          onChange(await compressMenuPhoto(file));
        } catch (error) {
          onError(error instanceof Error ? error.message : 'تعذر تجهيز الصورة.');
        } finally {
          onBusy(false);
        }
      }} />
    </label>
    {value && <button className="menu-button" type="button" onClick={() => onChange('')}>إزالة الصورة</button>}
  </div>;
}

function ItemFields({item, onChange, onBusy, onError}: {
  item: MenuItem; onChange: (values: Partial<MenuItem>) => void;
  onBusy: (busy: boolean) => void; onError: (message: string) => void;
}) {
  return <div className="menu-item-fields">
    <div className="menu-fields">
      <label>اسم الصنف<input maxLength={100} value={item.name} onChange={e => onChange({name: e.target.value})} /></label>
      <label>القسم في المنيو<input maxLength={60} value={item.section} onChange={e => onChange({section: e.target.value})} /></label>
      <label className="menu-field-wide">وصف الصنف<textarea maxLength={240} value={item.description} onChange={e => onChange({description: e.target.value})} /></label>
    </div>
    <PhotoInput label="صورة الصنف" value={item.photo} onChange={photo => onChange({photo})} onBusy={onBusy} onError={onError} />
    <fieldset className="menu-prices-editor">
      <legend>الأسعار بالجنيه</legend>
      {item.prices.map((option, index) => <div className="menu-price-editor" key={index}>
        <label>الحجم أو الوحدة<input placeholder="مثال ٢٥٠ جم" maxLength={40} value={option.label} onChange={e => onChange({prices: item.prices.map((p, i) => i === index ? {...p, label: e.target.value} : p)})} /></label>
        <label>السعر<input type="number" inputMode="decimal" min="0" max="999999.99" step="0.01" value={option.amount ?? ''} onChange={e => onChange({prices: item.prices.map((p, i) => i === index ? {...p, amount: e.target.value === '' ? null : e.target.valueAsNumber} : p)})} /></label>
        {item.prices.length > 1 && <button className="menu-button menu-remove" type="button" onClick={() => onChange({prices: item.prices.filter((_, i) => i !== index)})}>حذف الحجم</button>}
      </div>)}
      <button className="menu-button" type="button" disabled={item.prices.length >= 8} onClick={() => onChange({prices: [...item.prices, {label: '', amount: null}]})}><Plus size={16} aria-hidden="true" />إضافة حجم</button>
    </fieldset>
  </div>;
}

function MenuSharing({onClose}: {onClose: () => void}) {
  const [qr, setQr] = useState<{png: string; svg: string}>();
  const [message, setMessage] = useState('');
  useEffect(() => {
    let disposed = false;
    import('qrcode').then(async ({default: generator}) => {
      const options = {errorCorrectionLevel: 'M', margin: 4, width: 1000} as const;
      const [png, svg] = await Promise.all([
        generator.toDataURL(menuUrl, options),
        generator.toString(menuUrl, {...options, type: 'svg'}),
      ]);
      if (!disposed) setQr({png, svg: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`});
    }).catch(() => {if (!disposed) setMessage('تعذر إنشاء الكود. اقفل النافذة وافتحها تاني.');});
    return () => {disposed = true;};
  }, []);

  return <Modal title="مشاركة المنيو" description="استخدم نفس الرابط أو الكود في الدعاية والطباعة. آخر نسخة منشورة هتظهر للعميل." onClose={onClose}>
    <div className="menu-sharing">
      {qr && <img width="192" height="192" alt="كود QR لفتح منيو بُن العجوز" src={qr.png} />}
      <label>رابط المنيو<input value={menuUrl} readOnly dir="ltr" onFocus={e => e.target.select()} /></label>
      <div className="menu-actions">
        <button className="menu-button" type="button" onClick={async () => {
          try {await navigator.clipboard.writeText(menuUrl); setMessage('تم نسخ الرابط.');}
          catch {setMessage('حدد الرابط وانسخه من الخانة.');}
        }}>نسخ الرابط</button>
        <a className="menu-button" href="/menu" target="_blank" rel="noopener noreferrer">فتح المنيو</a>
        {qr && <><a className="menu-button" href={qr.png} download="agouz-menu-qr.png">تنزيل PNG</a><a className="menu-button" href={qr.svg} download="agouz-menu-qr.svg">تنزيل SVG</a></>}
      </div>
      <p role="status">{message || (!qr && 'جارٍ تجهيز كود QR…')}</p>
    </div>
  </Modal>;
}

export default function MenuEditor({catalog, onBack}: {catalog: InventoryItem[]; onBack: () => void}) {
  const [menu, setMenu] = useState<ShopMenu>(emptyMenu);
  const [revision, setRevision] = useState(0);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{text: string; error?: boolean}>();
  const [openItem, setOpenItem] = useState<string>();
  const [dialog, setDialog] = useState<'preview' | 'sample' | 'publish' | 'share' | 'leave'>();
  const [query, setQuery] = useState('');
  const busy = saving || photoBusy;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const client = getSupabaseClient();
      if (!client) throw Error('Menu service unavailable');
      const [draft, publication] = await Promise.all([
        client.from('agouz_menu_draft').select('revision,content').eq('id', 1).abortSignal(controller.signal).maybeSingle(),
        client.from('agouz_menu_publication').select('published_at').eq('id', 1).abortSignal(controller.signal).maybeSingle(),
      ]);
      if (draft.error || publication.error) throw Error('Menu service unavailable');
      if (controller.signal.aborted) return;
      setMenu(draft.data ? menuSchema.parse(draft.data.content) : emptyMenu);
      setRevision(draft.data?.revision ?? 0);
      setPublished(!!publication.data);
      setReady(true);
    };
    load().catch(() => {
      if (!controller.signal.aborted) setNotice({text: 'تعذر تحميل بيانات المنيو.', error: true});
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(values: Partial<ShopMenu>) {
    setMenu(current => ({...current, ...values}));
    setDirty(true);
    setNotice(undefined);
  }

  function addItem(product?: InventoryItem) {
    if (menu.items.length >= menuItemLimit) return;
    const item: MenuItem = {
      id: crypto.randomUUID(), name: product?.name.slice(0, 100) ?? '',
      section: product ? categoryLabel(product.category) : 'أصناف', description: '', photo: '', visible: true,
      prices: [{label: product ? unitLabel(product.baseUnit) : '', amount: product && product.retailPrice > 0 ? Math.round(product.retailPrice * 100) / 100 : null}],
    };
    change({items: [...menu.items, item]});
    setOpenItem(item.id);
    setQuery('');
  }

  function moveItem(index: number, offset: number) {
    const items = [...menu.items];
    const next = index + offset;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    change({items});
  }

  function reportError(text: string) {
    setNotice({text, error: true});
  }

  async function save(publish: boolean) {
    if (!ready || busy) return;
    let content: ShopMenu;
    try {content = prepareMenu(menu, publish);}
    catch (error) {
      reportError(error instanceof Error ? error.message : 'راجع بيانات المنيو.');
      return;
    }
    setSaving(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw Error('Menu service unavailable');
      const {data, error} = await client.rpc('agouz_save_menu', {p_expected_revision: revision, p_content: content, p_publish: publish});
      if (error?.message === 'MENU_REVISION_CONFLICT') {
        reportError('المنيو اتعدل من نافذة تانية. احتفظ بتعديلاتك وأعد فتح القسم قبل الحفظ.');
        return;
      }
      if (error || typeof data !== 'number') throw Error('Menu save failed');
      setRevision(data);
      setMenu(content);
      setDirty(false);
      if (publish) setPublished(true);
      setNotice({text: publish ? 'تم نشر المنيو. نفس الرابط يعرض آخر نسخة للعملاء.' : 'تم حفظ المسودة.'});
    } catch {
      reportError('تعذر تأكيد الحفظ. راجع الاتصال قبل المحاولة مرة تانية.');
    } finally {
      setSaving(false);
      setDialog(undefined);
    }
  }

  const search = query.trim().toLocaleLowerCase('ar-EG');
  const matches = search ? catalog.filter(product => `${product.name} ${product.code}`.toLocaleLowerCase('ar-EG').includes(search)).slice(0, 12) : [];
  const visibleItems = menu.items.filter(item => item.visible);
  const sample = {...menu, items: sampleItems};
  const preview = menu.items.length ? {...menu, items: visibleItems.slice(0, 5)} : sample;

  return <section className="menu-editor" dir="rtl">
    <OperationHeader title="المنيو والدعاية" description="جهّز منيو المحل وشاركه برابط وكود QR ثابت." icon={UtensilsCrossed} busy={busy}
      onBack={() => dirty ? setDialog('leave') : onBack()}>
      {ready && <div className="menu-actions">
        <button className="menu-button" type="button" disabled={busy} onClick={() => setDialog('preview')}><Eye size={16} aria-hidden="true" />معاينة</button>
        <button className="menu-button" type="button" disabled={busy || !published} onClick={() => setDialog('share')}><QrCode size={16} aria-hidden="true" />مشاركة وQR</button>
      </div>}
    </OperationHeader>
    {loading && <p className="menu-panel" role="status">جارٍ تحميل المسودة…</p>}
    {!loading && !ready && <div className="menu-panel"><p role="alert">{notice?.text}</p><button className="menu-button" type="button" onClick={() => {setLoading(true); setAttempt(attempt + 1);}}>حاول تاني</button></div>}
    {ready && <>
      <div className="menu-editor-layout">
      <fieldset className="menu-editor-fields" disabled={busy}>
        <section className="menu-panel">
          <div className="menu-panel-heading">
            <div><h2 id="menu-template-title"><span className="menu-step" aria-hidden="true">١</span>شكل المنيو</h2><p>اختار التصميم وشوف أثره في المعاينة.</p></div>
            <button className="menu-button" type="button" onClick={() => setDialog('sample')}><Eye size={16} aria-hidden="true" />معاينة نموذج</button>
          </div>
          <div className="menu-templates" role="radiogroup" aria-labelledby="menu-template-title">
            {templates.map(template => <label key={template.id} className={menu.template === template.id ? 'menu-template selected' : 'menu-template'}>
              <input type="radio" name="menu-template" checked={menu.template === template.id} onChange={() => change({template: template.id})} />
              <span className={`menu-template-sample sample-${template.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
              <b>{template.name}</b><small>{template.detail}</small>
            </label>)}
          </div>
        </section>
        <section className="menu-panel">
          <h2><span className="menu-step" aria-hidden="true">٢</span>الهوية والتواصل</h2>
          <div className="menu-fields">
            <label>اسم المنيو<input maxLength={80} value={menu.name} onChange={e => change({name: e.target.value})} /></label>
            <label>نبذة قصيرة<input maxLength={300} value={menu.intro} onChange={e => change({intro: e.target.value})} /></label>
            <label>رقم الاتصال<input type="tel" dir="ltr" placeholder="+20…" maxLength={16} value={menu.phone} onChange={e => change({phone: e.target.value})} /></label>
            <label>رقم واتساب<input type="tel" dir="ltr" placeholder="+20…" maxLength={16} value={menu.whatsapp} onChange={e => change({whatsapp: e.target.value})} /></label>
            <label className="menu-field-wide">رابط موقع المحل<input type="url" dir="ltr" placeholder="https://" maxLength={500} value={menu.location} onChange={e => change({location: e.target.value})} /></label>
          </div>
          <PhotoInput label="شعار مخصص" value={menu.logo} onChange={logo => change({logo})} onBusy={setPhotoBusy} onError={reportError} />
        </section>
        <section className="menu-panel">
          <div className="menu-panel-heading"><div><h2><span className="menu-step" aria-hidden="true">٣</span>الأصناف والأسعار</h2><p>سعر المنيو مستقل. اختار صنفًا لنسخ اسمه وسعر بيعه الحالي أو أضفه يدويًا.</p></div>
            <button className="menu-button" type="button" disabled={menu.items.length >= menuItemLimit} onClick={() => addItem()}><Plus size={16} aria-hidden="true" />صنف يدوي</button>
          </div>
          <label className="menu-catalog-search">ابحث بالاسم أو الكود في المنتجات<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
          {search && <ul className="menu-catalog-results">{matches.length ? matches.map(product => <li key={product.id}>
            <button className="menu-button" type="button" disabled={menu.items.length >= menuItemLimit} onClick={() => addItem(product)}><Plus size={16} aria-hidden="true" />{product.name}<small>{product.code}</small></button>
          </li>) : <li>مفيش منتجات مطابقة.</li>}</ul>}
          <ul className="menu-item-list">{menu.items.map((item, index) => <li key={item.id} className="menu-item-editor" data-expanded={openItem === item.id}>
            <div className="menu-item-heading">
              <button className="menu-item-name" type="button" aria-expanded={openItem === item.id} aria-controls={`menu-item-${item.id}`}
                onClick={() => setOpenItem(openItem === item.id ? undefined : item.id)}>{item.name || 'صنف جديد'}<small>{item.section}</small></button>
              <div className="menu-actions">
                <label className="menu-visible"><input type="checkbox" checked={item.visible} onChange={e => change({items: menu.items.map(row => row.id === item.id ? {...row, visible: e.target.checked} : row)})} />ظاهر</label>
                <button className="menu-button" type="button" disabled={index === 0} aria-label={`حرّك ${item.name || 'الصنف'} لأعلى`} onClick={() => moveItem(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
                <button className="menu-button" type="button" disabled={index === menu.items.length - 1} aria-label={`حرّك ${item.name || 'الصنف'} لأسفل`} onClick={() => moveItem(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
                <button className="menu-button menu-remove" type="button" onClick={() => change({items: menu.items.filter(row => row.id !== item.id)})}>حذف</button>
              </div>
            </div>
            <div id={`menu-item-${item.id}`} hidden={openItem !== item.id}>{openItem === item.id && <ItemFields item={item}
              onChange={values => change({items: menu.items.map(row => row.id === item.id ? {...row, ...values} : row)})}
              onBusy={setPhotoBusy} onError={reportError} />}</div>
          </li>)}</ul>
          {!menu.items.length && <div className="menu-items-empty"><UtensilsCrossed size={20} aria-hidden="true" /><p>ابدأ بإضافة أول صنف للمنيو.</p></div>}
        </section>
      </fieldset>
      <aside className="menu-live-preview" aria-label="معاينة مباشرة">
        <div className="menu-live-preview-header"><Smartphone size={18} aria-hidden="true" /><b>شكل المنيو على الموبايل</b></div>
        <p>{!menu.items.length ? 'نموذج تصميم ببيانات تجريبية' : visibleItems.length > 5 ? 'أول ٥ أصناف ظاهرة' : 'تتحدّث مع تعديلاتك'}</p>
        <div className="menu-live-device"><ShopMenuView menu={preview} preview /></div>
      </aside>
      </div>
      <footer className="menu-panel menu-save">
        <div><b className="menu-publication-state" data-published={published}>{published ? 'فيه نسخة منشورة' : 'المنيو لسه غير منشور'}</b>
          <p>{dirty ? 'فيه تعديلات لسه ما اتحفظتش.' : 'العملاء بيشوفوا آخر نسخة نشرتها.'}</p>
          {notice && <p className={notice.error ? 'menu-error' : 'menu-success'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
        </div>
        <div className="menu-actions">
          <button className="menu-button" type="button" disabled={busy} onClick={() => void save(false)}>حفظ المسودة</button>
          <button className="menu-button menu-primary" type="button" disabled={busy} onClick={() => {
            try {prepareMenu(menu, true); setDialog('publish');}
            catch (error) {reportError(error instanceof Error ? error.message : 'راجع بيانات المنيو.');}
          }}>{published ? 'نشر التحديث' : 'نشر المنيو'}</button>
        </div>
      </footer>
    </>}
    {dialog === 'preview' && <Modal title="معاينة المنيو" description="ده شكل آخر تعديلاتك قبل النشر." wide onClose={() => setDialog(undefined)}><div className="menu-full-preview"><ShopMenuView menu={menu} preview /></div></Modal>}
    {dialog === 'sample' && <Modal title="نموذج التصميم" description="الأصناف والأسعار هنا أمثلة لتجربة القالب." wide onClose={() => setDialog(undefined)}><div className="menu-full-preview"><ShopMenuView menu={sample} preview /></div></Modal>}
    {dialog === 'share' && <MenuSharing onClose={() => setDialog(undefined)} />}
    {dialog === 'publish' && <Modal title="تأكيد نشر المنيو" description="الأصناف الظاهرة وأسعارها والصور وبيانات التواصل هتبقى متاحة لأي حد معاه الرابط." busy={saving} onClose={() => setDialog(undefined)}
      footer={<button className="menu-button menu-primary" type="button" disabled={saving} onClick={() => void save(true)}>{saving ? 'جارٍ النشر…' : 'تأكيد النشر'}</button>}>
      <p>{menu.items.filter(item => item.visible).length} صنف هيتعرض على نفس الرابط العام.</p>
    </Modal>}
    {dialog === 'leave' && <Modal title="فيه تعديلات غير محفوظة" description="احفظ المسودة عشان ترجع تكملها بعدين." onClose={() => setDialog(undefined)}
      footer={<button className="menu-button menu-remove" type="button" onClick={onBack}>خروج بدون حفظ</button>}><p>أي تعديلات من آخر حفظ هتضيع عند الخروج.</p></Modal>}
  </section>;
}
