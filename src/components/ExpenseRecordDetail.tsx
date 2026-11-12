import React from 'react';
import type {Expense} from '../types/erp';
import {money} from '../lib/reporting';
import {Modal} from './Modal';

export function ExpenseRecordDetail({expense, onClose}: {expense: Expense; onClose: () => void}) {
  return <Modal title={expense.title} description={expense.date} onClose={onClose}>
    <dl className="record-facts">
      <div><dt>القيمة</dt><dd>{money(expense.amount)} ج.م</dd></div>
      <div><dt>البند</dt><dd>{expense.category}</dd></div>
      <div><dt>نوع المصروف</dt><dd>{expense.frequency === 'monthly_fixed' ? 'شهري ثابت' : expense.frequency === 'daily' ? 'يومي' : 'سجل سابق'}</dd></div>
      <div><dt>جهة الصرف</dt><dd>{expense.paidFrom}</dd></div>
      <div><dt>المسؤول</dt><dd>{expense.partnerName}</dd></div>
      <div><dt>الحالة</dt><dd>{expense.isCancelled ? 'ملغى' : 'مسجل'}</dd></div>
    </dl>
    {expense.notes && <p className="operation-note">{expense.notes}</p>}
  </Modal>;
}
