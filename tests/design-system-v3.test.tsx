// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setThemePreference, getStoredThemePreference } from '../src/lib/theme';
import { TrendChart } from '../src/components/FinancialCharts';
import { EmptyState } from '../src/components/EmptyState';
import { ScreenLoading } from '../src/components/ScreenLoading';
import { AccountStatementModal } from '../src/components/ReceiptAndStatementModals';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.head.innerHTML = '';
});

describe('Design System v3', () => {
  it('persists light/dark override and clears storage when reverting to system', () => {
    const metaScheme = document.createElement('meta');
    metaScheme.name = 'color-scheme';
    metaScheme.content = 'light dark';
    document.head.append(metaScheme);
    for (const [scheme, color] of [['light', '#F3F5F9'], ['dark', '#101726']]) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.dataset.scheme = scheme;
      meta.media = `(prefers-color-scheme: ${scheme})`;
      meta.content = color;
      document.head.append(meta);
    }

    expect(getStoredThemePreference()).toBe('system');
    setThemePreference('dark');
    expect(getStoredThemePreference()).toBe('dark');
    expect(metaScheme.content).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#101726');
    expect(document.querySelector('meta[data-theme-override]')).toBeTruthy();

    setThemePreference('light');
    expect(getStoredThemePreference()).toBe('light');
    expect(metaScheme.content).toBe('light');

    setThemePreference('system');
    expect(getStoredThemePreference()).toBe('system');
    expect(localStorage.getItem('bon_elagouz_color_scheme')).toBeNull();
    expect(metaScheme.content).toBe('light dark');
    expect(document.querySelector('meta[data-theme-override]')).toBeNull();
  });

  it('renders proportional interactive button points on TrendChart and selects clicked date', () => {
    const { container } = render(
      <TrendChart
        points={[
          { date: '2026-11-01', sales: 100, profit: 30, recorded: true },
          { date: '2026-11-02', sales: 250, profit: -15, recorded: true },
        ]}
      />,
    );
    expect(container.querySelectorAll('svg circle')).toHaveLength(0);
    const salesDots = container.querySelectorAll('button.point-sales');
    expect(salesDots).toHaveLength(2);
    expect(container.querySelectorAll('button.point-negative')).toHaveLength(1);

    fireEvent.click(salesDots[0]);
    expect((screen.getByLabelText('تفاصيل تاريخ الرسم') as HTMLSelectElement).value).toBe('2026-11-01');
  });

  it('renders EmptyState and ScreenLoading skeleton shapes cleanly', () => {
    const action = vi.fn();
    render(
      <>
        <ScreenLoading label="جارٍ التحميل" />
        <EmptyState
          title="لا توجد بيانات"
          description="أضف سجلًا للبدء"
          action={<button type="button" onClick={action}>إضافة الآن</button>}
        />
      </>,
    );
    expect(screen.getByText('جارٍ التحميل')).toBeTruthy();
    expect(document.querySelectorAll('.loading-shape').length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole('button', { name: 'إضافة الآن' }));
    expect(action).toHaveBeenCalledOnce();
  });

  it('exposes accessible delete-payment control in AccountStatementModal without slate/legacy sizing', () => {
    const del = vi.fn();
    render(
      <AccountStatementModal
        mode="customer"
        target={{ id: 'c1', name: 'مقهى الاختبار', phone: '01012345678', type: 'جملة', balance: 0, totalSales: 500, invoicesCount: 0 }}
        purchaseInvoices={[]}
        salesInvoices={[]}
        accountPayments={[
          {
            id: 'pay1',
            date: '2026-11-01',
            targetType: 'customer',
            targetId: 'c1',
            targetName: 'مقهى الاختبار',
            amount: 200,
            notes: 'دفعة أولى',
            partnerName: 'المالك',
          },
        ]}
        onRecordPayment={() => true}
        onDeletePayment={del}
        onClose={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: 'حذف الدفعة' });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
    fireEvent.click(btn);
    expect(del).toHaveBeenCalledExactlyOnceWith('pay1');
  });
});
