// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FinancialOpeningPanel} from '../src/components/FinancialOpeningPanel';
import {emptyStore} from '../src/lib/storeState';
import {recordFinancialOpening} from '../src/lib/financialOpening';
import {businessDate} from '../src/lib/dates';
afterEach(cleanup);
const range={from:'2026-11-01',to:'2026-11-30',valid:true,label:'November'};
it('leaves an unknown opening empty and saves an explicitly entered Arabic amount',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);
 render(<FinancialOpeningPanel state={emptyStore} range={range} onSave={save}/>);
 expect(screen.getByText('رصيد أول المدة لم يُحدد بعد.')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'تحديد رصيد أول المدة'}));
 const amount=screen.getByLabelText('الرصيد الافتتاحي في خزنة الشركة') as HTMLInputElement;
 expect(amount.value).toBe('');
 fireEvent.change(screen.getByLabelText('تاريخ بداية المدة'),{target:{value:'2026-11-01'}});
 fireEvent.change(amount,{target:{value:'١٬٢٣٤٫٥٠'}});
 fireEvent.change(screen.getByLabelText('بيان الرصيد أو سبب التصحيح'),{target:{value:'ترحيل رصيد أكتوبر بعد التسوية'}});
 fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
 await waitFor(()=>expect(save).toHaveBeenCalledWith('2026-11-01',1234.5,'ترحيل رصيد أكتوبر بعد التسوية'));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('shows a deliberately confirmed zero to viewers without offering editing',()=>{
 const state=recordFinancialOpening(emptyStore,'2026-11-01',0,'تأكيد عدم وجود رصيد سابق',{id:'owner',name:'Owner'});
 render(<FinancialOpeningPanel state={state} range={range}/>);
 expect(screen.queryByText('رصيد أول المدة لم يُحدد بعد.')).toBeNull();
 expect(screen.queryByRole('button',{name:'تصحيح رصيد البداية'})).toBeNull();
 expect(screen.getByText('الرصيد الدفتري حتى '+(businessDate()<'2026-11-30'?businessDate():'2026-11-30'))).toBeTruthy();
});
it('keeps the entered opening visible when server saving fails',async()=>{
 const save=vi.fn().mockRejectedValue(Error('تعذر تأكيد الحفظ'));
 render(<FinancialOpeningPanel state={emptyStore} range={range} onSave={save}/>);
 fireEvent.click(screen.getByRole('button',{name:'تحديد رصيد أول المدة'}));
 fireEvent.change(screen.getByLabelText('الرصيد الافتتاحي في خزنة الشركة'),{target:{value:'0'}});
 fireEvent.change(screen.getByLabelText('بيان الرصيد أو سبب التصحيح'),{target:{value:'رصيد مؤكد بعد الجرد'}});
 fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('تعذر تأكيد الحفظ'));
 expect(screen.getByRole('dialog')).toBeTruthy();
});
