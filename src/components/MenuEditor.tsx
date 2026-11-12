import React, {useEffect, useState} from 'react';
import {ImagePlus, QrCode} from 'lucide-react';
import {getSupabaseClient} from '../lib/supabaseSync';
import {compressMenuPhoto, menuImageSchema, menuUrl} from '../lib/shopMenu';
import {Modal} from './Modal';
import {OperationHeader} from './OperationHeader';
import './menu-editor.css';

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
    }).catch(() => {
      if (!disposed) setMessage('تعذر إنشاء الكود. افتح النافذة مرة تانية.');
    });
    return () => {disposed = true;};
  }, []);

  return <Modal title="مشاركة المنيو" description="استخدم الكود في الطباعة أو الدعاية. نفس الكود يفتح أحدث صورة منشورة." onClose={onClose}>
    <div className="menu-sharing">
      {qr && <img width="192" height="192" alt="كود QR لفتح منيو بُن العجوز" src={qr.png} />}
      <label>رابط المنيو<input value={menuUrl} readOnly dir="ltr" onFocus={event => event.target.select()} /></label>
      <div className="menu-actions">
        <button className="menu-button" type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(menuUrl);
            setMessage('تم نسخ الرابط.');
          } catch {
            setMessage('حدد الرابط وانسخه من الخانة.');
          }
        }}>نسخ الرابط</button>
        <a className="menu-button" href="/menu" target="_blank" rel="noopener noreferrer">فتح المنيو</a>
        {qr && <>
          <a className="menu-button" href={qr.png} download="agouz-menu-qr.png">تنزيل PNG</a>
          <a className="menu-button" href={qr.svg} download="agouz-menu-qr.svg">تنزيل SVG</a>
        </>}
      </div>
      <p role="status">{message || (!qr && 'جارٍ تجهيز كود QR…')}</p>
    </div>
  </Modal>;
}

export default function MenuEditor({onBack}: {onBack: () => void}) {
  const [publication, setPublication] = useState<{revision: number; published: boolean; image?: string; canRestore: boolean}>();
  const [selectedImage, setSelectedImage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<'publish' | 'share' | 'restore'>();
  const [notice, setNotice] = useState<{text: string; error?: boolean}>();
  const busy = processing || saving;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const client = getSupabaseClient();
      if (!client) throw Error('Menu service unavailable');
      const [draft, published] = await Promise.all([
        client.from('agouz_menu_draft').select('revision').eq('id', 1).abortSignal(controller.signal).maybeSingle(),
        client.from('agouz_menu_publication').select('content').eq('id', 1).abortSignal(controller.signal).maybeSingle(),
      ]);
      if (draft.error || published.error) throw Error('Menu service unavailable');
      if (controller.signal.aborted) return;
      const image = menuImageSchema.safeParse(published.data?.content);
      const available = image.success
        ? await client.rpc('agouz_menu_restore_available').abortSignal(controller.signal)
        : null;
      if (controller.signal.aborted) return;
      setPublication({
        revision: draft.data?.revision ?? 0,
        published: !!published.data,
        image: image.data?.image,
        canRestore: available?.data === true,
      });
      setNotice(undefined);
    }
    load().catch(() => {
      if (!controller.signal.aborted) setNotice({text: 'تعذر تحميل بيانات المنيو.', error: true});
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  async function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSelectedImage(undefined);
    setProcessing(true);
    setNotice(undefined);
    try {
      setSelectedImage(await compressMenuPhoto(file));
    } catch (error) {
      setNotice({text: error instanceof Error ? error.message : 'تعذر تجهيز الصورة.', error: true});
    } finally {
      setProcessing(false);
    }
  }

  async function publish(restore = false) {
    if (!publication || busy || (restore ? !publication.canRestore : !selectedImage)) return;
    setSaving(true);
    setNotice(undefined);
    try {
      const client = getSupabaseClient();
      if (!client) throw Error('Menu service unavailable');
      const {data, error} = restore
        ? await client.rpc('agouz_restore_menu_image', {p_expected_revision: publication.revision})
        : await client.rpc('agouz_save_menu', {
        p_expected_revision: publication.revision,
        p_content: {image: selectedImage},
        p_publish: true,
      });
      if (error?.message === 'MENU_REVISION_CONFLICT') {
        setPublication(undefined);
        setNotice({text: 'المنيو اتحدّث من نافذة تانية. حمّل الحالة الحالية وراجع صورتك قبل النشر.', error: true});
        return;
      }
      if (error) throw Error('Menu save failed');
      if (restore) {
        const image = menuImageSchema.parse(data?.content).image;
        if (typeof data?.revision !== 'number') throw Error('Invalid restore revision');
        setPublication({revision: data.revision, published: true, image, canRestore: true});
        setNotice({text: 'تم استرجاع الصورة السابقة على نفس الرابط.'});
        return;
      }
      if (typeof data !== 'number') throw Error('Invalid publication revision');
      setPublication({revision: data, published: true, image: selectedImage, canRestore: publication.canRestore || (!!publication.image && publication.image !== selectedImage)});
      setSelectedImage(undefined);
      setNotice({text: 'تم نشر الصورة. نفس الرابط وكود QR يفتحوا آخر نسخة للعملاء.'});
    } catch {
      setNotice({text: restore ? 'تعذر تأكيد الاسترجاع. راجع الاتصال وحاول تاني.' : 'تعذر تأكيد النشر. راجع الاتصال وحاول تاني.', error: true});
    } finally {
      setSaving(false);
      setDialog(undefined);
    }
  }

  const preview = selectedImage ?? publication?.image;
  return <section className="menu-editor" dir="rtl">
    <OperationHeader title="صورة المنيو" description="ارفع صورة المنيو وانشرها على رابط ثابت للـQR." icon={ImagePlus} busy={busy} onBack={onBack}>
      {publication?.published && <button className="menu-button" type="button" disabled={busy} onClick={() => setDialog('share')}>
        <QrCode size={18} aria-hidden="true" />مشاركة وQR
      </button>}
    </OperationHeader>

    <div className="menu-editor-layout">
      <section className="menu-panel">
        <h2>رفع صورة المنيو</h2>
        {loading && <p role="status">جارٍ تحميل المنيو…</p>}
        {publication && <>
          <p className="menu-publication-state" data-published={publication.published}>{publication.published ? 'المنيو منشور' : 'لسه مفيش منيو منشور'}</p>
          <label className="menu-photo-field">
            <span>صورة المنيو</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="menu-file-hint" disabled={busy} onChange={selectImage} />
          </label>
          <p id="menu-file-hint">صورة JPG أو PNG أو WebP لحد ٨ ميجابايت.</p>
          {processing && <p role="status">جارٍ تجهيز الصورة…</p>}
          {publication.canRestore && !selectedImage && <button className="menu-button" type="button" disabled={busy} onClick={() => setDialog('restore')}>
            استرجاع الصورة السابقة
          </button>}
          {selectedImage && <div className="menu-actions">
            <button className="menu-button menu-primary" type="button" disabled={busy} onClick={() => setDialog('publish')}>نشر الصورة</button>
            <button className="menu-button" type="button" disabled={busy} onClick={() => {setSelectedImage(undefined); setNotice(undefined);}}>إلغاء الاختيار</button>
          </div>}
        </>}
        {notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'menu-error' : 'menu-success'}>{notice.text}</p>}
        {!publication && !loading && <button className="menu-button" type="button" onClick={() => {
          setLoading(true);
          setNotice(undefined);
          setAttempt(current => current + 1);
        }}>حاول تاني</button>}
      </section>

      {preview && <section className="menu-panel menu-preview">
        <h2>{selectedImage ? 'معاينة قبل النشر' : 'الصورة المنشورة'}</h2>
        <img src={preview} alt={selectedImage ? 'معاينة صورة المنيو' : 'صورة المنيو المنشورة'} />
      </section>}
    </div>

    {dialog === 'publish' && <Modal title="نشر صورة المنيو" onClose={() => setDialog(undefined)} busy={saving}
      footer={<button className="menu-button menu-primary" type="button" disabled={saving} onClick={() => void publish()}>{saving ? 'جارٍ النشر…' : 'تأكيد النشر'}</button>}>
      <p>الصورة هتظهر لأي حد يفتح رابط المنيو أو يمسح كود QR.</p>
    </Modal>}
    {dialog === 'restore' && <Modal title="استرجاع صورة المنيو السابقة" onClose={() => setDialog(undefined)} busy={saving}
      footer={<button className="menu-button menu-primary" type="button" disabled={saving} onClick={() => void publish(true)}>
        {saving ? 'جارٍ الاسترجاع…' : 'تأكيد الاسترجاع'}
      </button>}>
      <p>الصورة السابقة هترجع تظهر للعملاء على نفس الرابط وكود QR.</p>
    </Modal>}
    {dialog === 'share' && <MenuSharing onClose={() => setDialog(undefined)} />}
  </section>;
}
