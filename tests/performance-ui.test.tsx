// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {SalesInvoicesAndReturnsScreen} from '../src/components/ManagementScreens';
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
  fireEvent.click(screen.getByRole('button',{name:'مرتجع',exact:true}));
  expect(onReturn).toHaveBeenCalledWith('invoice-999');
});
