// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyMenu } from '../src/lib/shopMenu';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../src/lib/supabaseSync', () => ({
  getSupabaseClient: () => ({ from }),
}));

import MenuEditor from '../src/components/MenuEditor';

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    abortSignal: () => builder,
    maybeSingle: async () => result,
  };
  return builder;
}

afterEach(() => {
  cleanup();
  from.mockReset();
});

it('clears the failed-load notice after a successful retry', async () => {
  from
    .mockImplementationOnce(() =>
      query({ data: null, error: { message: 'unavailable' } }),
    )
    .mockImplementationOnce(() => query({ data: null, error: null }))
    .mockImplementationOnce(() =>
      query({ data: { revision: 3, content: emptyMenu }, error: null }),
    )
    .mockImplementationOnce(() => query({ data: null, error: null }));

  render(<MenuEditor catalog={[]} onBack={() => {}} />);
  await screen.findByText('تعذر تحميل بيانات المنيو.');
  fireEvent.click(screen.getByRole('button', { name: 'حاول تاني' }));
  await screen.findByRole('heading', { name: 'شكل المنيو' });
  await waitFor(() =>
    expect(screen.queryByText('تعذر تحميل بيانات المنيو.')).toBeNull(),
  );
});
