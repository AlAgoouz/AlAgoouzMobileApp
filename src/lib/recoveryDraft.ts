import type { StoreState } from './storeState';

export const recoveryDraftKey = 'bon_elagouz_recovery_draft_v4';
const recoveryDraftPointer = `${recoveryDraftKey}:current`;

export function saveRecoveryDraft(
  storage: Pick<Storage, 'setItem'>,
  state: StoreState,
  savedAt = new Date(),
  key = recoveryDraftKey,
): void {
  try {
    storage.setItem(
      key,
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
  key = recoveryDraftKey,
): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage removal errors during sign-out cleanup.
  }
}

export function rememberRecoveryDraft(key: string) {
  try { sessionStorage.setItem(recoveryDraftPointer, key); } catch { /* Storage may be disabled. */ }
}

export function readRecoveryDraft(): string | null {
  const key = sessionStorage.getItem(recoveryDraftPointer);
  if (key?.startsWith(`${recoveryDraftKey}:`)) return localStorage.getItem(key);
  return localStorage.getItem(recoveryDraftKey);
}

export function forgetRecoveryDraft() {
  try { sessionStorage.removeItem(recoveryDraftPointer); } catch { /* Storage may be disabled. */ }
}
