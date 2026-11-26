import type {StoreJournal} from './storeEngine';

const tabKey = 'agouz-offline-tab';
const journalKey = (userId: string, tabId: string) => `agouz-offline-v1:${encodeURIComponent(userId)}:${tabId}`;

export function offlineTabId(): string {
  try {
    const existing = sessionStorage.getItem(tabKey);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(tabKey, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function readOfflineJournal(userId: string, tabId: string): StoreJournal | null {
  const raw = localStorage.getItem(journalKey(userId, tabId));
  if (!raw) return null;
  const record = JSON.parse(raw);
  if (!record?.pending || !record?.confirmed) throw Error('مسودة المزامنة غير صالحة');
  return record as StoreJournal;
}

export function writeOfflineJournal(userId: string, tabId: string, journal: StoreJournal | null) {
  const key = journalKey(userId, tabId);
  try {
    if (journal) localStorage.setItem(key, JSON.stringify(journal));
    else localStorage.removeItem(key);
  } catch {
    throw Error('تعذر حفظ مسودة المزامنة على الجهاز. راجع مساحة التخزين أو اتصل بالإنترنت.');
  }
}
