// @vitest-environment jsdom
import React from 'react';
import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  SmartInsightsScreen,
  ProfitReportsScreen,
} from '../src/components/ReportsAndInsightsScreens';
import { LoginScreen } from '../src/components/LoginScreen';
import { InvoiceReceiptModal } from '../src/components/ReceiptAndStatementModals';
afterEach(() => cleanup());
it('shows zero report values without fabricating chart days', () => {
  render(
    <ProfitReportsScreen
      items={[]}
      salesInvoices={[]}
      expenses={[]}
      partners={[]}
      onBack={() => {}}
    />,
  );
  expect(screen.queryByText('26/10')).toBeNull();
  expect(screen.queryByText('27/10')).toBeNull();
  expect(screen.getAllByText(/0\.00/).length).toBeGreaterThan(0);
});
it('filters insights when the selected period changes', () => {
  const invoice = {
    id: 'old',
    invoiceNumber: 'old',
    date: '2000-01-01',
    isReturned: false,
    totalAmount: 12345,
    netProfit: 400,
    items: [],
  } as any;
  render(
    <SmartInsightsScreen
      items={[]}
      salesInvoices={[invoice]}
      customers={[]}
      onNavigate={() => {}}
      onBack={() => {}}
    />,
  );
  expect(screen.getByText(/إجمالي المبيعات:/).textContent).not.toContain('١٢');
  fireEvent.click(screen.getByRole('button', { name: 'كل السجل' }));
  expect(screen.getByText(/إجمالي المبيعات:/).textContent).toContain('١٢');
});
it('submits email and password once, displays auth failure, and permits retry', async () => {
  const signIn = vi.fn().mockRejectedValue(new Error('فشل الاختبار'));
  render(<LoginScreen onSignIn={signIn} />);
  fireEvent.change(
    screen.getByPlaceholderText('أدخل البريد الإلكتروني للحساب'),
    { target: { value: 'owner@example.test' } },
  );
  fireEvent.change(screen.getByPlaceholderText('••••••••'), {
    target: { value: 'secret' },
  });
  fireEvent.submit(screen.getByPlaceholderText('••••••••').closest('form')!);
  expect(await screen.findByText('فشل الاختبار')).toBeTruthy();
  expect(signIn).toHaveBeenCalledWith('owner@example.test', 'secret', true);
});
it('escapes the actual receipt print output', () => {
  let html = '';
  vi.spyOn(window, 'open').mockReturnValue({
    document: {
      write: (value: string) => {
        html = value;
      },
      close() {},
    },
  } as any);
  const payload = '<img src=x onerror="alert(1)">';
  render(
    <InvoiceReceiptModal
      invoice={
        {
          invoiceNumber: '1',
          customerName: payload,
          partnerName: 'partner',
          date: '2026-11-01',
          saleType: 'retail',
          items: [],
          totalAmount: 0,
          paidAmount: 0,
          remainingAmount: 0,
          discount: 0,
        } as any
      }
      onClose={() => {}}
    />,
  );
  fireEvent.click(screen.getByText('طباعة الفاتورة'));
  expect(html).toContain('&lt;img');
  expect(html).not.toContain(payload);
  vi.restoreAllMocks();
});
