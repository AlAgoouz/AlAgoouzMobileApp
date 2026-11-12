import React, {useMemo} from 'react';
import type {InventoryItem} from '../types/erp';
import type {StoreState} from '../lib/storeState';
import {stockMovementHistory} from '../lib/stockMovementHistory';
import {unitLabel} from '../lib/units';
import {Modal} from './Modal';
import {RecordPagination, useRecordPage} from './RecordPagination';
import {ResponsiveRegister} from './ResponsiveRegister';

const quantity = (value: number) => value.toLocaleString('ar-EG', {maximumFractionDigits: 6});

export function StockMovementModal({item, documents, onClose}: {
  item: InventoryItem;
  documents: StoreState;
  onClose: () => void;
}) {
  const movements = useMemo(() => stockMovementHistory(item, documents), [item, documents]);
  const page = useRecordPage(movements, item.id, 20);
  return <Modal wide title={`حركات ${item.name}`} description={`الرصيد الحالي ${quantity(item.stock)} ${unitLabel(item.baseUnit)}`} onClose={onClose}>
    <p className="operation-note">الحركات المثبتة في المستندات. قد تشمل الأرصدة القديمة تعديلات أو استهلاك وصفات من غير تفاصيل محفوظة.</p>
    <RecordPagination {...page} />
    {page.visible.length > 0 ? <ResponsiveRegister label="حركات الصنف" rows={page.visible} columns={[
      {title:'العملية', render: row => row.source},
      {title:'التاريخ', render: row => <time dateTime={row.date}>{row.date}</time>},
      {title:'الكمية', render: row => <b className={row.quantity < 0 ? 'text-red-700' : undefined}>{row.quantity > 0 ? '+' : ''}{quantity(row.quantity)} {row.unit}</b>},
    ]} /> : <p className="record-state">لا توجد حركات موثقة لهذا الصنف.</p>}
  </Modal>;
}
