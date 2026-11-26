import {StoreWriteFailure} from '../src/lib/storeErrors';
import { it, expect, vi, afterEach } from 'vitest';
import { StoreEngine, type StoreTransport } from '../src/lib/storeEngine';
import { storeChanges } from '../src/lib/storeChanges';
import { emptyStore,cloudStoreInput,toCloud } from '../src/lib/storeState';

it('validates mapped cloud input at the engine boundary and rejects malformed remote data',async()=>{
 const transport:StoreTransport={load:async()=>({state:cloudStoreInput({...toCloud(emptyStore),items:[{id:'broken'}]}),version:1}),save:async()=>2};
 const engine=new StoreEngine(transport);await engine.load();
 expect(engine.snapshot.status).toBe('error');expect(engine.snapshot.state.items).toEqual([]);
 transport.load=async()=>({state:cloudStoreInput(toCloud(emptyStore)),version:1});await engine.load();
 expect(engine.snapshot.status).toBe('ready');expect(engine.snapshot.state).toEqual(emptyStore);
});

it('reloads a previously unavailable version-zero store',async()=>{
 const load=vi.fn().mockRejectedValueOnce(Error('temporary')).mockResolvedValue({state:emptyStore,version:0});
 const engine=new StoreEngine({load,getVersion:async()=>0,save:async()=>1});
 await engine.load();
 expect(engine.snapshot.status).toBe('error');
 await engine.refresh();
 expect(engine.snapshot.status).toBe('ready');
 expect(engine.hasLoaded).toBe(true);
});

it('sends changes to a large register without including its unchanged historical documents',()=>{
 const before={expenses:Array.from({length:2000},(_,id)=>({id:String(id),notes:'x'.repeat(600)}))};
 const after={expenses:[before.expenses[0],{id:'new',notes:'record'},...before.expenses.slice(1,-1)]};
 const changes=storeChanges(before,after);
 expect(changes.expenses.upsert).toEqual([{id:'new',notes:'record'}]);
 expect(changes.expenses.remove).toEqual(['1999']);
 expect(changes.expenses.order?.slice(0,3)).toEqual(['0','new','1']);
 expect(JSON.stringify(changes).length).toBeLessThan(15000);
});
afterEach(() => vi.useRealTimers());
it('checks a small version without reloading unchanged data and deduplicates refresh requests', async () => {
  const {engine,transport}=setup();
  await engine.load();
  let resolveVersion!:(version:number)=>void;
  transport.getVersion=vi.fn(()=>new Promise<number>(resolve=>{resolveVersion=resolve;}));
  const first=engine.refresh(),second=engine.refresh();
  expect(first).toBe(second);
  resolveVersion(1);await first;
  expect(transport.load).toHaveBeenCalledTimes(1);
  expect(engine.snapshot.status).toBe('ready');
  transport.getVersion=vi.fn(async()=>2);
  transport.load=vi.fn(async()=>({state:structuredClone(emptyStore),version:2}));
  await engine.refresh();
  expect(transport.load).toHaveBeenCalledTimes(1);
  expect(engine.snapshot.version).toBe(2);
});
it('preserves conflict protection when a newer version is found by the light check',async()=>{
  vi.useFakeTimers();
  const {engine,transport}=setup();await engine.load();
  transport.getVersion=vi.fn(async()=>2);
  transport.load=vi.fn(async()=>({state:structuredClone(emptyStore),version:2}));
  engine.replace(structuredClone(emptyStore));await engine.refresh();
  expect(engine.snapshot.status).toBe('conflict');
  expect(engine.hasPending).toBe(true);
  expect(transport.save).not.toHaveBeenCalled();
});
it('keeps owner restore mode and operation ID when retrying an uncertain save', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  transport.save = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(2);
  expect(() => engine.transaction(() => engine.restore(emptyStore))).toThrow();
  expect(engine.hasPending).toBe(false);
  engine.restore(structuredClone(emptyStore));
  expect(() => engine.restore(emptyStore)).toThrow();
  await engine.flush();
  await engine.flush();
  const calls = vi.mocked(transport.save).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][4]).toBe(true);
  expect(calls[1][4]).toBe(true);
  expect(calls[0][2]).toBe(calls[1][2]);
  expect(engine.hasPending).toBe(false);
});
function setup() {
  let version = 1;
  const transport: StoreTransport = {
    load: vi.fn(async () => ({ state: structuredClone(emptyStore), version })),
    save: vi.fn(async () => ++version),
  };
  return {
    transport,
    engine: new StoreEngine(transport),
    advance: () => ++version,
  };
}
it('never uploads before successful hydration', async () => {
  const { engine, transport } = setup();
  expect(() => engine.replace(emptyStore)).toThrow();
  expect(transport.save).not.toHaveBeenCalled();
});
it('retains local draft and locks changes when load fails', async () => {
  const { engine, transport } = setup();
  transport.load = vi.fn().mockRejectedValue(new Error('offline'));
  await engine.load();
  expect(engine.snapshot.status).toBe('error');
  expect(() => engine.replace(emptyStore)).toThrow();
  expect(transport.save).not.toHaveBeenCalled();
});
it('commits related fields together in one versioned request', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  engine.field('items', []);
  engine.field('partners', []);
  await engine.flush();
  expect(transport.save).toHaveBeenCalledTimes(1);
  expect(transport.save).toHaveBeenCalledWith(
    emptyStore,
    1,
    expect.any(String),
    undefined,
  );
  expect(engine.snapshot.status).toBe('ready');
  expect(engine.snapshot.version).toBe(2);
});
it('reuses operation ID when network confirmation is lost', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  let first = true;
  transport.save = vi.fn(async () => {
    if (first) {
      first = false;
      throw new Error('network');
    }
    return 2;
  });
  engine.replace(emptyStore);
  await engine.flush();
  expect(engine.snapshot.status).toBe('error');
  await engine.flush();
  const calls = vi.mocked(transport.save).mock.calls;
  expect(calls[0][2]).toBe(calls[1][2]);
  expect(engine.snapshot.status).toBe('ready');
});
it('does not overwrite draft on conflict and stops autosave', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  transport.save = vi.fn().mockRejectedValue(new Error('STORE_CONFLICT'));
  engine.replace(emptyStore);
  await engine.flush();
  expect(engine.snapshot.status).toBe('conflict');
  await engine.flush();
  expect(transport.save).toHaveBeenCalledTimes(1);
  expect(engine.hasPending).toBe(true);
});
it('detects external updates while local edits are pending', async () => {
  vi.useFakeTimers();
  const { engine, advance, transport } = setup();
  await engine.load();
  engine.replace(emptyStore);
  advance();
  await engine.refresh();
  expect(engine.snapshot.status).toBe('conflict');
  await vi.advanceTimersByTimeAsync(500);
  expect(transport.save).not.toHaveBeenCalled();
});
it('applies external updates only to a clean state', async () => {
  const { engine, advance } = setup();
  await engine.load();
  advance();
  await engine.refresh();
  expect(engine.snapshot.version).toBe(2);
  expect(engine.snapshot.status).toBe('ready');
});
it('preserves queue acknowledgement in the same commit', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  engine.replace(emptyStore, 'queue1');
  await engine.flush();
  expect(vi.mocked(transport.save).mock.calls[0][3]).toBe('queue1');
});
it('shows a recovery warning and still allows a confirmed server save', async () => {
  const { transport } = setup();
  const engine = new StoreEngine(transport, () => {
    throw new Error('storage full');
  });
  await engine.load();
  engine.replace(emptyStore);
  expect(engine.snapshot.recoveryWarning).toContain('لم تُحفظ');
  expect(engine.hasPending).toBe(true);
  await engine.flush();
  expect(transport.save).toHaveBeenCalledOnce();
  expect(engine.snapshot.status).toBe('ready');
  expect(engine.snapshot.recoveryWarning).toBeUndefined();
  expect(engine.hasPending).toBe(false);
});
it('ignores a late save response after logout', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  let finish!: (n: number) => void;
  transport.save = () => new Promise((resolve) => (finish = resolve));
  engine.replace(emptyStore);
  const saving = engine.flush();
  engine.logout();
  finish(2);
  await saving;
  expect(engine.snapshot.status).toBe('signed-out');
});
it('rolls back every related local field when transaction validation fails', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  const before = engine.snapshot.state;
  expect(() =>
    engine.transaction(() => {
      engine.field('items', []);
      engine.field('suppliers', [{ id: 'broken' } as any]);
    }),
  ).toThrow();
  expect(engine.snapshot.state).toBe(before);
  expect(engine.hasPending).toBe(false);
  expect(transport.save).not.toHaveBeenCalled();
});
it('publishes related changes only after a complete valid transaction', async () => {
  vi.useFakeTimers();
  const { engine } = setup();
  await engine.load();
  const observer = vi.fn();
  engine.subscribe(observer);
  engine.transaction(() => {
    engine.field('items', []);
    engine.field('expenses', []);
  });
  expect(observer).toHaveBeenCalledOnce();
});

it('unlocks a hydrated clean store after a transient version-check failure', async () => {
  const {engine,transport}=setup(); await engine.load();
  transport.getVersion=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(1);
  await engine.refresh(); expect(engine.snapshot.status).toBe('error');
  await engine.refresh(); expect(engine.snapshot.status).toBe('ready');
  expect(engine.snapshot.error).toBe('');
  expect(transport.load).toHaveBeenCalledTimes(1);
});
it('never clears a failed initial load through a same-version probe', async () => {
  const {engine,transport}=setup();
  transport.load=vi.fn().mockRejectedValue(new Error('invalid remote state'));
  transport.getVersion=vi.fn(async()=>0);
  await engine.load(); await engine.refresh();
  expect(engine.snapshot.status).toBe('error');
  expect(()=>engine.replace(emptyStore)).toThrow();
});
it('never clears an uncertain save or its draft when a version check succeeds', async () => {
  vi.useFakeTimers(); const {engine,transport}=setup(); await engine.load();
  transport.save=vi.fn().mockRejectedValue(new Error('offline'));
  engine.replace(structuredClone(emptyStore)); await engine.flush();
  transport.getVersion=vi.fn(async()=>1); await engine.refresh();
  expect(engine.snapshot.status).toBe('error'); expect(engine.hasPending).toBe(true);
});
it('queues sequential edits during an active save and flushes them with the updated version', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  let finishFirst!: (version: number) => void;
  transport.save = vi
    .fn()
    .mockImplementationOnce(() => new Promise<number>((resolve) => { finishFirst = resolve; }))
    .mockResolvedValueOnce(3);
  engine.replace(structuredClone(emptyStore));
  const flushing = engine.flush();
  expect(engine.snapshot.status).toBe('saving');
  const nextState = { ...structuredClone(emptyStore), shifts: [] };
  engine.replace(nextState);
  expect(engine.snapshot.state).toEqual(nextState);
  expect(engine.hasPending).toBe(true);
  finishFirst(2);
  await flushing;
  expect(transport.save).toHaveBeenCalledTimes(2);
  expect(vi.mocked(transport.save).mock.calls[1][1]).toBe(2);
  expect(engine.snapshot.version).toBe(3);
  expect(engine.snapshot.status).toBe('ready');
  expect(engine.hasPending).toBe(false);
});
it('keeps the recovery draft until the final queued save is acknowledged', async () => {
  vi.useFakeTimers();
  const {transport} = setup();
  const clearDraft = vi.fn();
  const preserve = vi.fn(() => { throw Error('QuotaExceededError'); });
  const engine = new StoreEngine(transport, preserve, undefined, clearDraft);
  await engine.load();
  const acknowledgments: Array<(version: number) => void> = [];
  transport.save = vi.fn(() => new Promise(resolve => acknowledgments.push(resolve)));
  engine.replace(structuredClone(emptyStore));
  const flushing = engine.flush();
  engine.replace(structuredClone(emptyStore));
  acknowledgments[0](2);
  await Promise.resolve();
  expect(engine.snapshot.recoveryWarning).toBeDefined();
  expect(clearDraft).not.toHaveBeenCalled();
  expect(engine.snapshot.savedAt).toBeUndefined();
  acknowledgments[1](3);
  await flushing;
  expect(clearDraft).toHaveBeenCalledTimes(1);
  expect(engine.snapshot).toMatchObject({version: 3, status: 'ready', savedAt: expect.any(Number)});
  expect(engine.snapshot.recoveryWarning).toBeUndefined();
});

it('replays a committed save with a lost acknowledgment before saving the queued edit', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  let commitFirst!: () => void;
  let remoteVersion = 1;
  const receipts = new Map<string, number>();
  transport.getVersion = vi.fn(async () => remoteVersion);
  transport.save = vi.fn(async (_state, version, operationId) => {
    const receipt = receipts.get(operationId);
    if (receipt !== undefined) return receipt;
    if (version !== remoteVersion) throw new Error('STORE_CONFLICT');
    if (version === 1) {
      await new Promise<void>((resolve) => { commitFirst = resolve; });
      receipts.set(operationId, ++remoteVersion);
      throw new Error('network');
    }
    receipts.set(operationId, ++remoteVersion);
    return remoteVersion;
  });
  engine.replace(structuredClone(emptyStore));
  const flushing = engine.flush();
  const queuedState = {
    ...structuredClone(emptyStore),
    auditLogs: [{ id: 'a1', timestamp: '2026-11-01T00:00:00Z', partnerName: 'Owner', actionType: 'شراء' as const, description: 'queued' }],
  };
  engine.replace(queuedState);
  commitFirst();
  await flushing;
  expect(engine.snapshot.status).toBe('error');
  expect(engine.snapshot.state).toEqual(queuedState);
  await engine.refresh();
  expect(engine.snapshot.status).toBe('error');
  await engine.flush();
  const [first, retry, queued] = vi.mocked(transport.save).mock.calls;
  expect(retry).toEqual(first);
  expect(queued[0]).toEqual(queuedState);
  expect(queued[1]).toBe(2);
  expect(queued[2]).not.toBe(first[2]);
  expect(engine.snapshot.status).toBe('ready');
  expect(engine.snapshot.version).toBe(3);
  expect(engine.hasPending).toBe(false);
});

it('keeps cashier queue IDs with their own save when ordinary edits arrive in flight', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  let finishFirst!: (version: number) => void;
  transport.save = vi.fn()
    .mockImplementationOnce(() => new Promise<number>((resolve) => { finishFirst = resolve; }))
    .mockResolvedValueOnce(3);
  engine.replace(structuredClone(emptyStore), 'cashier-first');
  engine.field('shifts', []);
  const flushing = engine.flush();
  engine.field('shifts', []);
  finishFirst(2);
  await flushing;
  const calls = vi.mocked(transport.save).mock.calls;
  expect(calls.map((call) => call[3])).toEqual(['cashier-first', undefined]);
  expect(engine.snapshot.status).toBe('ready');
});

it('preserves a waiting cashier report when another report is attached before it can be saved', async () => {
  vi.useFakeTimers();
  const { engine, transport } = setup();
  await engine.load();
  let finishFirst!: (version: number) => void;
  transport.save = vi.fn()
    .mockImplementationOnce(() => new Promise<number>((resolve) => { finishFirst = resolve; }))
    .mockResolvedValueOnce(3);
  engine.replace(structuredClone(emptyStore), 'cashier-first');
  const flushing = engine.flush();
  engine.replace(structuredClone(emptyStore), 'cashier-second');
  expect(() => engine.replace(structuredClone(emptyStore), 'cashier-third')).toThrow('انتظر تأكيد حفظ تقرير الكاشير الحالي');
  finishFirst(2);
  await flushing;
  expect(vi.mocked(transport.save).mock.calls.map((call) => call[3]))
    .toEqual(['cashier-first', 'cashier-second']);
  expect(engine.snapshot.status).toBe('ready');
});

it('retries a temporary server failure with the original operation ID and payload',async()=>{
  vi.useFakeTimers();
  try{
    const {engine,transport}=setup();
    vi.mocked(transport.save).mockRejectedValueOnce(new StoreWriteFailure('NETWORK','offline',true)).mockResolvedValueOnce(1);
    await engine.load();
    engine.replace(emptyStore);
    await engine.flush();
    expect(engine.snapshot.status).toBe('error');
    await vi.advanceTimersByTimeAsync(2000);
    expect(transport.save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(transport.save).mock.calls[1]).toEqual(vi.mocked(transport.save).mock.calls[0]);
    expect(engine.snapshot.status).toBe('ready');
  }finally{
    vi.useRealTimers();
  }
});

it.each(['saved', 'discarded'] as const)('reconciles a cashier attachment reported as %s before releasing local edits', async (outcome) => {
  vi.useFakeTimers();
  const {engine, transport} = setup();
  await engine.load();
  transport.save = vi.fn().mockRejectedValue(new StoreWriteFailure('NETWORK', 'offline', true));
  transport.discardCashierSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(outcome);
  engine.attachCashier(structuredClone(emptyStore), crypto.randomUUID());
  expect(() => engine.replace(emptyStore)).toThrow();
  await engine.flush();
  await engine.load();
  expect(engine.hasPendingCashierAttachment).toBe(true);
  await expect(engine.discardCashierAttachment()).rejects.toThrow();
  expect(engine.hasPendingCashierAttachment).toBe(true);
  await expect(engine.discardCashierAttachment()).resolves.toBe(outcome);
  expect(transport.discardCashierSave).toHaveBeenLastCalledWith(vi.mocked(transport.save).mock.calls[0][2]);
  expect(engine.hasPendingCashierAttachment).toBe(false);
  expect(engine.snapshot.status).toBe('ready');
  await vi.advanceTimersByTimeAsync(20000);
  expect(transport.save).toHaveBeenCalledTimes(1);
});

it('writes durable offline drafts and submits the same operation after reopening online',async()=>{
  const journal=vi.fn();
  const save=vi.fn().mockResolvedValue(8);
  const transport={load:async()=>({state:emptyStore,version:7}),save};
  const engine=new StoreEngine(transport,undefined,undefined,undefined,journal);
  await engine.load();
  engine.setConnectivity(false);
  engine.replace(structuredClone(emptyStore));
  await engine.flush();
  expect(save).not.toHaveBeenCalled();
  expect(engine.snapshot.status).toBe('offline');

  const saved=structuredClone(journal.mock.lastCall![0]);
  const reopened=new StoreEngine(transport,undefined,undefined,undefined,journal);
  expect(reopened.resumeJournal(saved)).toBe(true);
  await reopened.reconnect();
  expect(save.mock.calls[0].slice(1,3)).toEqual([7,saved.pending.id]);
  expect(reopened.snapshot.status).toBe('ready');
  expect(journal.mock.lastCall![0]).toBeNull();
});

it('does not acknowledge an offline operation when device storage fails',async()=>{
  const engine=new StoreEngine({load:async()=>({state:emptyStore,version:2}),save:vi.fn()},
    undefined,undefined,undefined,()=>{throw Error('storage full');});
  await engine.load();
  engine.setConnectivity(false);
  expect(()=>engine.replace(structuredClone(emptyStore))).toThrow('storage full');
  expect(engine.hasPending).toBe(false);
});

it('holds a sent payload intact when the network drops and additional edits arrive',async()=>{
  vi.useFakeTimers();
  let reject!: (error:Error)=>void;
  const save=vi.fn()
    .mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}))
    .mockResolvedValueOnce(2).mockResolvedValueOnce(3);
  const journal=vi.fn();
  const engine=new StoreEngine({load:async()=>({state:emptyStore,version:1}),save},
    undefined,undefined,undefined,journal);
  await engine.load();
  engine.replace(emptyStore);
  const first=engine.flush();
  engine.setConnectivity(false);
  reject(new StoreWriteFailure('NETWORK','disconnected',true));
  await first;
  engine.replace(emptyStore);
  const persisted=journal.mock.lastCall![0];
  expect(persisted.pending.id).toBe(save.mock.calls[0][2]);
  expect(persisted.queued.id).not.toBe(persisted.pending.id);
  engine.setConnectivity(true);
  await engine.reconnect();
  expect(save.mock.calls.map(call=>call.slice(1,3))).toEqual([
    [1,persisted.pending.id],[1,persisted.pending.id],[2,persisted.queued.id]
  ]);
});

it('keeps a conflicting offline draft for review instead of applying it to a newer store',async()=>{
  const journal=vi.fn();
  const save=vi.fn().mockRejectedValue(new StoreWriteFailure('STORE_CONFLICT','modified'));
  const engine=new StoreEngine({load:async()=>({state:emptyStore,version:1}),save},
    undefined,undefined,undefined,journal);
  await engine.load();
  engine.setConnectivity(false);
  engine.replace(emptyStore);
  engine.setConnectivity(true);
  await engine.reconnect();
  expect(engine.snapshot.status).toBe('conflict');
  expect(engine.hasPending).toBe(true);
  expect(journal.mock.lastCall![0]).not.toBeNull();
  expect(save).toHaveBeenCalledTimes(1);
});
