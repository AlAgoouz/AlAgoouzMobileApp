import { expect, it, vi } from 'vitest';
import { emptyStore } from '../src/lib/storeState';
import {
  clearRecoveryDraft,
  recoveryDraftKey,
  saveRecoveryDraft,
} from '../src/lib/recoveryDraft';

it('writes a timestamped recovery draft under the shared key', () => {
  const setItem = vi.fn();
  saveRecoveryDraft(
    { setItem },
    emptyStore,
    new Date('2026-11-07T12:00:00Z'),
  );
  expect(setItem).toHaveBeenCalledWith(
    recoveryDraftKey,
    JSON.stringify({
      savedAt: '2026-11-07T12:00:00.000Z',
      state: emptyStore,
    }),
  );
});

it('turns a browser storage failure into an actionable Arabic error', () => {
  expect(() =>
    saveRecoveryDraft(
      {
        setItem: () => {
          throw new DOMException('The quota has been exceeded.');
        },
      },
      emptyStore,
    ),
  ).toThrow('تعذر حفظ نسخة الاسترداد المحلية');
});

it('clears the recovery draft safely on sign-out', () => {
  const removeItem = vi.fn();
  clearRecoveryDraft({ removeItem });
  expect(removeItem).toHaveBeenCalledWith(recoveryDraftKey);
  expect(() =>
    clearRecoveryDraft({
      removeItem: () => {
        throw new DOMException('Storage disabled');
      },
    }),
  ).not.toThrow();
});
