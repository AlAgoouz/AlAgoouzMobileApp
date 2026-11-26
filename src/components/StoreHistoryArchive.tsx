import {useEffect, useState} from 'react';
import {z} from 'zod';
import {readRpc} from '../lib/readModels';

const archivePage = z.array(z.object({
  sequence: z.int().positive(),
  archivedAt: z.string(),
  entry: z.object({
    description: z.string().optional(),
    actionType: z.string().optional(),
    timestamp: z.string().optional(),
    date: z.string().optional(),
    itemName: z.string().optional(),
    quantity: z.number().optional(),
    unitCost: z.number().optional(),
    averageCost: z.number().optional(),
  }).passthrough(),
}));
const pageSize = 40;
type Kind = 'audit'|'cost';

export function StoreHistoryArchive() {
  const [kind, setKind] = useState<Kind>('audit');
  const [cursors, setCursors] = useState<number[]>([]);
  const [rows, setRows] = useState<z.infer<typeof archivePage>>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const before = cursors[cursors.length - 1] ?? null;

  useEffect(() => {
    let active = true;
    setPending(true);
    setError(false);
    void readRpc('bon_erp_history_archive', {p_kind:kind, p_before:before, p_limit:pageSize+1})
      .then(value => { if (active) setRows(archivePage.parse(value)); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [kind, before, reload]);

  const visible = rows.slice(0,pageSize);
  return <section className="operation-surface space-y-3" aria-label="أرشيف البيانات">
    <h2 className="font-bold">أرشيف البيانات</h2>
    <label className="block">نوع السجل
      <select className="operation-input" value={kind} onChange={event => {
        setPending(true);
        setCursors([]);
        setKind(event.target.value as Kind);
      }}>
        <option value="audit">سجل المراجعة المؤرشف</option>
        <option value="cost">سجل تكلفة المخزون</option>
      </select>
    </label>
    {pending ? <p role="status">جارٍ تحميل السجلات…</p> :
      error ? <p role="alert">تعذر تحميل الأرشيف. <button className="record-action" onClick={() => setReload(reload+1)}>إعادة المحاولة</button></p> :
      !visible.length ? <p>مفيش سجلات في الصفحة دي.</p> :
      <ul className="space-y-2">{visible.map(({sequence, archivedAt, entry}) =>
        <li key={sequence} className="record-card">
          <strong>{entry.description ?? entry.itemName ?? 'سجل محفوظ'}</strong>
          <p>{entry.timestamp?.slice(0,10) ?? entry.date ?? archivedAt.slice(0,10)}</p>
          {kind==='cost' && <p>الكمية {entry.quantity} · تكلفة الوحدة {entry.unitCost} ج.م · المتوسط {entry.averageCost} ج.م</p>}
        </li>
      )}</ul>}
    <div className="flex gap-2">
      <button className="record-action" disabled={pending || !cursors.length} onClick={() => {
        setPending(true);
        setCursors(cursors.slice(0,-1));
      }}>الصفحة السابقة</button>
      <button className="record-action" disabled={pending || error || rows.length<=pageSize} onClick={() => {
        setPending(true);
        setCursors([...cursors, visible[visible.length-1].sequence]);
      }}>الصفحة التالية</button>
    </div>
  </section>;
}
