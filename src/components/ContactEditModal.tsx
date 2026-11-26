import { Modal } from './Modal';
import { useState } from 'react';
import type { Customer, Supplier } from '../types/erp';
import { checkCustomerDetails, checkSupplierDetails } from '../lib/contactDetails';

export function ContactEditModal({
  target,
  mode,
  onSave,
  onClose,
}: {
  target: Customer | Supplier;
  mode: 'customers' | 'suppliers';
  onSave: (id: string, details: { name: string; phone: string; area?: string; address?: string; representativeName?: string }) => boolean;
  onClose: () => void;
}) {
  const [details, setDetails] = useState({
    name: target.name,
    phone: target.phone,
    area: (target as Customer).area ?? '',
    address: (target as Supplier).address ?? '',
    representativeName: (target as Supplier).representativeName ?? '',
  });
  const [error, setError] = useState('');
  const fields =
    mode === 'customers'
      ? (['name', 'phone', 'area'] as const)
      : (['name', 'phone', 'address', 'representativeName'] as const);
  const labels = {
    name: 'الاسم',
    phone: 'رقم التليفون',
    area: 'المنطقة',
    address: 'العنوان',
    representativeName: 'اسم المندوب',
  };

  return (
    <Modal
      title="تعديل بيانات التواصل"
      onClose={onClose}
      footer={
        <div>
          <button
            type="button"
            className="operation-primary"
            onClick={() => {
              try {
                if (mode === 'customers') checkCustomerDetails(details);
                else checkSupplierDetails(details);
                const clean = Object.fromEntries(fields.map((k) => [k, details[k].trim()])) as typeof details;
                if (onSave(target.id, clean)) onClose();
                else setError('لم يتم حفظ التعديل؛ راجع التنبيه');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            حفظ بيانات التواصل
          </button>
          <button type="button" className="action-button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {fields.map((key) => (
          <label className="block" key={key}>
            {labels[key]}
            <input
              className="operation-input"
              value={details[key]}
              onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
            />
          </label>
        ))}
        {error && <p role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
