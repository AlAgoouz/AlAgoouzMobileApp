import { it, expect, vi, afterEach } from 'vitest';
import { StoreEngine, type StoreTransport } from '../src/lib/storeEngine';
import { emptyStore } from '../src/lib/storeState';
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
it('surfaces a failed local recovery write before changing state', async () => {
  const { transport } = setup();
  const engine = new StoreEngine(transport, () => {
    throw new Error('storage full');
  });
  await engine.load();
  expect(() => engine.replace(emptyStore)).toThrow('storage full');
  expect(engine.snapshot.status).toBe('ready');
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
