import type { StoreState } from './storeState';

export const recoveryDraftKey = 'bon_elagouz_recovery_draft_v4';
const recoveryDraftPointer = `${recoveryDraftKey}:current`;
const legacyTabKey = new RegExp(`^${recoveryDraftKey}:[a-f0-9-]{36}$`, 'i');
const userDraftPrefix = (userId: string) => `${recoveryDraftKey}:user:${encodeURIComponent(userId)}:`;

export function userRecoveryDraftKey(userId: string, tabId: string) {
  return userDraftPrefix(userId) + tabId;
}

export interface RecoveryDraftAccess {
  userId: string;
  activeKey?: string;
  includeLegacy?: boolean;
}

function accessibleDraft(key: string, access: RecoveryDraftAccess) {
  return key.startsWith(userDraftPrefix(access.userId)) ||
    (access.includeLegacy === true && (key === recoveryDraftKey || legacyTabKey.test(key)));
}

function parseDraft(raw: string | null) {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (typeof draft?.savedAt !== 'string' || !Number.isFinite(Date.parse(draft.savedAt)) ||
      !draft.state || typeof draft.state !== 'object' || Array.isArray(draft.state)) return null;
    return draft as {savedAt: string; state: unknown};
  } catch {
    return null;
  }
}

export function listRecoveryDrafts(access: RecoveryDraftAccess) {
  const drafts: {key: string; savedAt: string}[] = [];
  try {
    const storage = localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key || key === access.activeKey || !accessibleDraft(key, access)) continue;
      const draft = parseDraft(storage.getItem(key));
      if (draft) drafts.push({key, savedAt: draft.savedAt});
    }
  } catch { /* The browser may block local storage. */ }
  return drafts.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt) || a.key.localeCompare(b.key));
}

export function recoveryDraftState(access: RecoveryDraftAccess, key: string): unknown {
  if (!accessibleDraft(key, access)) return null;
  try { return parseDraft(localStorage.getItem(key))?.state ?? null; }
  catch { return null; }
}

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

export function readRecoveryDraft(access: RecoveryDraftAccess): unknown {
  if (access.activeKey) {
    const active = recoveryDraftState(access, access.activeKey);
    if (active) return active;
  }
  const latest = listRecoveryDrafts(access)[0];
  return latest ? recoveryDraftState(access, latest.key) : null;
}

export function forgetRecoveryDraft() {
  try { sessionStorage.removeItem(recoveryDraftPointer); } catch { /* Storage may be disabled. */ }
}
