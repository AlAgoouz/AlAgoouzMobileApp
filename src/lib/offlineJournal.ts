import {applyStoreChanges,storeChanges} from './storeChanges';
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

type Pending = StoreJournal['pending'];
type Queued = StoreJournal['queued'][number];
type SerializedWrite<T extends Queued> = Omit<T,'state'> & {changes:ReturnType<typeof storeChanges>};
type PackedJournal = {version:2; confirmed:StoreJournal['confirmed']; pending:SerializedWrite<Pending>; queued:SerializedWrite<Queued>[]};

export function packOfflineJournal(journal:StoreJournal): PackedJournal {
  let previous=journal.confirmed;
  const pack=<T extends Queued>(write:T):SerializedWrite<T>=>{
    const {state,...receipt}=write;
    const changes=storeChanges({...previous},{...state});
    previous=state;
    return {...receipt,changes};
  };
  return {version:2,confirmed:journal.confirmed,pending:pack(journal.pending),
    queued:journal.queued.map(pack)};
}

export function unpackOfflineJournal(record:PackedJournal): StoreJournal {
  if(record?.version!==2 || !record.pending || !record.confirmed || !Array.isArray(record.queued))
    throw Error('مسودة المزامنة غير صالحة');
  let previous=record.confirmed;
  const unpack=<T extends Queued>(write:SerializedWrite<T>)=>{
    const {changes,...receipt}=write;
    const state=applyStoreChanges({...previous},changes);
    previous=state;
    return {...receipt,state};
  };
  return {confirmed:record.confirmed,pending:unpack<Pending>(record.pending),queued:record.queued.map(write=>unpack<Queued>(write))};
}

export function readOfflineJournal(userId: string, tabId: string): StoreJournal | null {
  const raw = localStorage.getItem(journalKey(userId, tabId));
  return raw ? unpackOfflineJournal(JSON.parse(raw)) : null;
}

export function writeOfflineJournal(userId: string, tabId: string, journal: StoreJournal | null) {
  const key = journalKey(userId, tabId);
  try {
    if (journal) localStorage.setItem(key, JSON.stringify(packOfflineJournal(journal)));
    else localStorage.removeItem(key);
  } catch {
    throw Error('تعذر حفظ مسودة المزامنة على الجهاز. راجع مساحة التخزين أو اتصل بالإنترنت.');
  }
}
