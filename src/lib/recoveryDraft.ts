import type { StoreState } from './storeState';

export const recoveryDraftKey = 'bon_elagouz_recovery_draft_v4';

export function saveRecoveryDraft(
  storage: Pick<Storage, 'setItem'>,
  state: StoreState,
  savedAt = new Date(),
): void {
  try {
    storage.setItem(
      recoveryDraftKey,
      JSON.stringify({ savedAt: savedAt.toISOString(), state }),
    );
  } catch {
    throw new Error(
      'تعذر حفظ نسخة الاسترداد المحلية على هذا المتصفح؛ أفرغ مساحة التخزين أو احفظ نسخة من بياناتك ثم أعد المحاولة.',
    );
  }
}

export function clearRecoveryDraft(
  storage: Pick<Storage, 'removeItem'>,
): void {
  try {
    storage.removeItem(recoveryDraftKey);
  } catch {
    // Ignore storage removal errors during sign-out cleanup.
  }
}
