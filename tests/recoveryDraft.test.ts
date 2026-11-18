import { afterEach, expect, it, vi } from 'vitest';
import { emptyStore } from '../src/lib/storeState';
import {
  clearRecoveryDraft,
  recoveryDraftKey,
  saveRecoveryDraft,
  listRecoveryDrafts,
  readRecoveryDraft,
  recoveryDraftState,
  userRecoveryDraftKey,
} from '../src/lib/recoveryDraft';

afterEach(()=>vi.unstubAllGlobals());

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

it('clears the acknowledged draft without removing a different tab’s unfinished draft', () => {
  const rows = new Map<string,string>();
  const storage = {setItem: (key:string,value:string)=>rows.set(key,value), removeItem: (key:string)=>rows.delete(key)};
  const first = recoveryDraftKey + ':first';
  const second = recoveryDraftKey + ':second';
  saveRecoveryDraft(storage,emptyStore,undefined,first);
  saveRecoveryDraft(storage,emptyStore,undefined,second);
  clearRecoveryDraft(storage,first);
  expect(rows.has(first)).toBe(false);
  expect(rows.has(second)).toBe(true);
});

it('finds previous drafts in a fresh tab and isolates them by account', () => {
  const rows=new Map<string,string>();
  const storage={
    get length(){return rows.size;}, key:(index:number)=>[...rows.keys()][index]??null,
    getItem:(key:string)=>rows.get(key)??null, setItem:(key:string,value:string)=>rows.set(key,value),
  };
  vi.stubGlobal('localStorage',storage);
  vi.stubGlobal('sessionStorage',undefined);
  const previous=userRecoveryDraftKey('alex','previous-tab');
  const active=userRecoveryDraftKey('alex','new-tab');
  const other=userRecoveryDraftKey('other','other-tab');
  const legacy=recoveryDraftKey+':11111111-1111-4111-8111-111111111111';
  const savedAt=new Date('2026-11-18T03:00:00Z');
  for(const key of [previous,active,other,legacy])saveRecoveryDraft(storage,emptyStore,savedAt,key);
  storage.setItem(userRecoveryDraftKey('alex','corrupt'),'{');
  const access={userId:'alex',activeKey:active};
  expect(listRecoveryDrafts(access)).toEqual([{key:previous,savedAt:savedAt.toISOString()}]);
  expect(readRecoveryDraft({userId:'alex',activeKey:userRecoveryDraftKey('alex','fresh-tab')})).toEqual(emptyStore);
  expect(recoveryDraftState(access,other)).toBeNull();
  expect(recoveryDraftState(access,legacy)).toBeNull();
  expect(listRecoveryDrafts({...access,includeLegacy:true}).map(draft=>draft.key)).toContain(legacy);
  expect(listRecoveryDrafts({userId:'unknown'})).toEqual([]);
});
