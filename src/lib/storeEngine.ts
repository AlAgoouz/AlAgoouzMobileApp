import { emptyStore, validateStore, type StoreState } from './storeState';

export type StoreStatus =
  | 'signed-out'
  | 'loading'
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'conflict';
export interface StoreSnapshot {
  state: StoreState;
  version: number;
  status: StoreStatus;
  error: string;
}
export interface StoreTransport {
  load(): Promise<{ state: unknown; version: number }>;
  getVersion?(): Promise<number>;
  save(
    state: StoreState,
    version: number,
    operationId: string,
    queueId?: string,
    restore?: boolean,
  ): Promise<number>;
}
export class StoreEngine {
  snapshot: StoreSnapshot = {
    state: emptyStore,
    version: 0,
    status: 'signed-out',
    error: '',
  };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending:
    | { state: StoreState; version: number; id: string; queueId?: string; restore?: boolean }
    | undefined;
  private queued:
    | { state: StoreState; id: string; queueId?: string }
    | undefined;
  private epoch = 0;
  private hydrated = false;
  private batchState: StoreState | undefined;
  private flushInFlight: Promise<void> | undefined;
  private refreshInFlight: Promise<void> | undefined;
  constructor(
    private transport: StoreTransport,
    private preserve: (state: StoreState) => void = () => {},
    private authorize: (before:StoreState,after:StoreState)=>void = ()=>{},
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  get state() { return this.batchState ?? this.snapshot.state; }
  private publish(next: StoreSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((fn) => fn());
  }
  async load() {
    clearTimeout(this.timer);
    if (this.snapshot.status === 'saving')
      throw new Error('انتظر انتهاء الحفظ');
    const epoch = ++this.epoch;
    this.publish({ ...this.snapshot, status: 'loading', error: '' });
    try {
      const remote = await this.transport.load();
      if (epoch !== this.epoch) return;
      const state = validateStore(remote.state);
      this.pending = undefined;
      this.queued = undefined;
      this.hydrated = true;
      this.publish({
        ...remote,
        state,
        status: 'ready',
        error: '',
      });
    } catch (error) {
      if (epoch === this.epoch)
        this.publish({
          ...this.snapshot,
          status: 'error',
          error: error instanceof Error ? error.message : 'تعذر تحميل البيانات',
        });
    }
  }
  logout() {
    ++this.epoch;
    this.hydrated = false;
    clearTimeout(this.timer);
    this.pending = undefined;
    this.queued = undefined;
    this.publish({
      state: emptyStore,
      version: 0,
      status: 'signed-out',
      error: '',
    });
  }
  replace(state: StoreState, queueId?: string) {
    if (!['ready', 'dirty', 'saving'].includes(this.snapshot.status))
      throw new Error('انتظر الحفظ أو عالج مشكلة الاتصال أولًا');
    if (this.pending?.restore)
      throw new Error('انتظر الحفظ أو عالج مشكلة الاتصال أولًا');
    if (this.batchState) {
      this.batchState = state;
      return;
    }
    const saving = this.snapshot.status === 'saving';
    const draft = saving ? this.queued : this.pending;
    if (queueId && ((saving && queueId === this.pending?.queueId) ||
      (draft?.queueId && queueId !== draft.queueId)))
      throw new Error('انتظر تأكيد حفظ تقرير الكاشير الحالي قبل إرفاق تقرير آخر');

    this.authorize(this.snapshot.state,state);
    const validated = validateStore(state);
    this.preserve(validated); // Failing local recovery storage must be visible, not ignored.
    if (saving) {
      this.queued = {
        state: validated,
        id: this.queued?.id ?? crypto.randomUUID(),
        queueId: queueId ?? draft?.queueId,
      };
      this.publish({
        ...this.snapshot,
        state: validated,
        status: 'saving',
        error: '',
      });
      return;
    }
    this.pending = {
      state: validated,
      version: this.snapshot.version,
      id: crypto.randomUUID(),
      queueId: queueId ?? draft?.queueId,
    };
    this.publish({
      ...this.snapshot,
      state: validated,
      status: 'dirty',
      error: '',
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 300);
  }
  field<K extends keyof StoreState>(
    key: K,
    next: StoreState[K] | ((previous: StoreState[K]) => StoreState[K]),
  ) {
    const state = this.batchState ?? this.snapshot.state;
    const value = typeof next === 'function' ? next(state[key]) : next;
    this.replace({ ...state, [key]: value });
  }
  restore(state: StoreState) {
    if (this.hasPending || this.batchState || this.snapshot.status !== 'ready')
      throw new Error('احفظ التعديلات الحالية أولًا قبل استعادة نسخة');
    this.replace(state);
    this.pending!.restore = true;
  }
  transaction<T>(action: () => T): T {
    if (this.batchState) {
      const previous = this.batchState;
      try {
        return action();
      } catch (error) {
        this.batchState = previous;
        throw error;
      }
    }
    this.batchState = this.snapshot.state;
    try {
      const result = action();
      const next = this.batchState;
      this.batchState = undefined;
      if (next !== this.snapshot.state) this.replace(next);
      return result;
    } finally {
      this.batchState = undefined;
    }
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.flushInFlight) return this.flushInFlight;
    const active = this.flushOnce().finally(() => {
      if (this.flushInFlight === active) this.flushInFlight = undefined;
    });
    this.flushInFlight = active;
    return active;
  }
  private async flushOnce(): Promise<void> {
    if (!this.pending || !['dirty', 'error'].includes(this.snapshot.status))
      return;
    const pending = this.pending,
      epoch = this.epoch;
    this.publish({ ...this.snapshot, status: 'saving', error: '' });
    try {
      const args = [
        pending.state,
        pending.version,
        pending.id,
        pending.queueId,
      ] as const;
      const version = pending.restore
        ? await this.transport.save(...args, true)
        : await this.transport.save(...args);
      if (epoch !== this.epoch) return;
      if (this.queued) {
        const nextQueued = this.queued;
        this.queued = undefined;
        this.pending = {
          state: nextQueued.state,
          version,
          id: nextQueued.id,
          queueId: nextQueued.queueId,
        };
        this.publish({
          state: nextQueued.state,
          version,
          status: 'dirty',
          error: '',
        });
        await this.flushOnce();
        return;
      }
      this.pending = undefined;
      this.publish({
        state: pending.state,
        version,
        status: 'ready',
        error: '',
      });
    } catch (error) {
      if (epoch !== this.epoch) return;
      // A lost acknowledgment may follow a successful commit. Retry the same
      // payload and operation ID before advancing to the queued draft.
      const message =
        error instanceof Error ? error.message : 'تعذر حفظ البيانات';
      this.publish({
        ...this.snapshot,
        status: /STORE_CONFLICT|QUEUE_PROCESSED/.test(message)
          ? 'conflict'
          : 'error',
        error: message,
      });
    }
  }
  refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const pending = this.refreshOnce().finally(() => {
      if (this.refreshInFlight === pending) this.refreshInFlight = undefined;
    });
    this.refreshInFlight = pending;
    return pending;
  }
  private async refreshOnce() {
    if (
      this.snapshot.status === 'signed-out' ||
      this.snapshot.status === 'loading' ||
      this.snapshot.status === 'saving' ||
      (this.snapshot.status === 'error' && this.pending)
    )
      return;
    const epoch = this.epoch;
    try {
      if (this.transport.getVersion) {
        const version = await this.transport.getVersion();
        if (!Number.isSafeInteger(version) || version < 0) throw new Error('لم يصل إصدار تحديث صالح');
        if (epoch !== this.epoch) return;
        if (version <= this.snapshot.version) {
          // A failed background check must not leave a clean, hydrated store
          // locked after connectivity returns. Failed initial loads still need
          // a full reload; their error must not be cleared by a version probe.
          if (this.snapshot.status === 'error' && !this.pending && this.hydrated)
            this.publish({ ...this.snapshot, status: 'ready', error: '' });
          return;
        }
      }
      const remote = await this.transport.load();
      if (epoch !== this.epoch || remote.version <= this.snapshot.version)
        return;
      if (this.getSnapshot().status === 'saving' ||
        (this.getSnapshot().status === 'error' && this.pending)) return;
      if (this.pending) {
        clearTimeout(this.timer);
        this.publish({
          ...this.snapshot,
          status: 'conflict',
          error:
            'جهاز آخر حفظ تعديلات جديدة؛ احتفظ بنسخة من عملك ثم أعد التحميل.',
        });
      } else {
        const state = validateStore(remote.state);
        this.hydrated = true;
        this.publish({
          ...remote,
          state,
          status: 'ready',
          error: '',
        });
      }
    } catch (error) {
      if (epoch === this.epoch && !this.pending)
        this.publish({
          ...this.snapshot,
          status: 'error',
          error: error instanceof Error ? error.message : 'تعذر تحديث البيانات',
        });
    }
  }
  get hasPending() {
    return Boolean(this.pending || this.queued);
  }
  get hasLoaded() {
    return this.hydrated;
  }
}
