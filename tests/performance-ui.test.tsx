// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {SalesInvoicesAndReturnsScreen} from '../src/components/ManagementScreens';
import {ProfitReportsScreen} from '../src/components/ReportsAndInsightsScreens';
import {fixture} from './performance/fixture.mjs';
afterEach(cleanup);
it('keeps a large invoice history searchable and actionable while rendering only 50 cards',()=>{
  const invoices=fixture(1000).sales_invoices,onReturn=vi.fn();
  render(<SalesInvoicesAndReturnsScreen salesInvoices={invoices} customers={[]} onReturnInvoice={onReturn} onDeleteInvoice={()=>{}} onBack={()=>{}}/>);
  expect(screen.getAllByRole('button',{name:'طباعة / واتساب'})).toHaveLength(50);
  fireEvent.click(screen.getAllByRole('button',{name:'الصفحة التالية'})[0]);
  expect(screen.getByText(/#INV-00050/)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox',{name:'بحث في كل الفواتير'}),{target:{value:'INV-00999'}});
  expect(screen.getAllByRole('button',{name:'طباعة / واتساب'})).toHaveLength(1);
  screen.getByText('تسوية استثنائية').closest('details')!.open=true;
  fireEvent.click(screen.getByRole('button',{name:'تسجيل مرتجع استثنائي',exact:true}));
  expect(onReturn).toHaveBeenCalledWith('invoice-999');
});
it('keeps report totals over the complete history when its invoice list is paginated and searched',()=>{
 const data=fixture(1000);
 render(<ProfitReportsScreen items={data.items} salesInvoices={data.sales_invoices} expenses={[]} partners={data.partners} onBack={()=>{}}/>);
 expect(screen.getAllByText('10000.00 ج.م')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'الفواتير',exact:true}));
 expect(screen.getAllByText(/#INV-/)).toHaveLength(50);
 fireEvent.change(screen.getByRole('textbox',{name:'بحث في كل فواتير التقرير'}),{target:{value:'INV-00999'}});
 expect(screen.getAllByText(/#INV-/)).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'الملخص',exact:true}));
 expect(screen.getAllByText('10000.00 ج.م')).toHaveLength(2);
});
