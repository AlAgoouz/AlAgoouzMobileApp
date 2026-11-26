export const STORE_CHANGE_LIMIT = 10 * 1024 * 1024;

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

type Row = {id: string};
type CollectionChange = {upsert: Row[]; remove: string[]; order?: string[]};

// Each collection maintains its existing order unless the operation moved rows.
export function storeChanges<T extends Record<string, unknown>>(before: T, after: T) {
  const changes: Record<string, CollectionChange> = {};
  for (const field of Object.keys(after)) {
    const previous = before[field] as Row[];
    const next = after[field] as Row[];
    const previousRows = new Map(previous.map(row => [row.id, row]));
    const nextIds = new Set(next.map(row => row.id));
    const inserted: string[] = [];
    const upsert = next.filter(row => {
      const old = previousRows.get(row.id);
      if (!old) inserted.push(row.id);
      return !old || JSON.stringify(old) !== JSON.stringify(row);
    });
    const remove = previous.filter(row => !nextIds.has(row.id)).map(row => row.id);
    const naturalOrder = [...inserted, ...previous.filter(row => nextIds.has(row.id)).map(row => row.id)];
    const order = next.some((row, index) => row.id !== naturalOrder[index]) ? next.map(row => row.id) : undefined;
    if (upsert.length || remove.length || order) changes[field] = {upsert, remove, order};
  }
  return changes;
}

export function applyStoreChanges<T extends Record<string,unknown>>(
  before: T,
  changes: Record<string, CollectionChange>,
): T {
  const after: Record<string,unknown> = {...before};
  for(const [field,change] of Object.entries(changes)){
    if(!Object.prototype.hasOwnProperty.call(before,field) || !Array.isArray(before[field]) ||
       !Array.isArray(change?.upsert) || !Array.isArray(change?.remove)){
      throw Error('مسودة المزامنة تحتوي تغييرات غير صالحة');
    }
    const rows=before[field] as Row[];
    const previousIds=new Set(rows.map(row=>row.id));
    const removed=new Set(change.remove);
    const updated=new Map(change.upsert.map(row=>[row.id,row]));
    const natural=[
      ...change.upsert.filter(row=>!previousIds.has(row.id)),
      ...rows.filter(row=>!removed.has(row.id)).map(row=>updated.get(row.id)??row),
    ];
    if(!change.order){
      after[field]=natural;
      continue;
    }
    const byId=new Map(natural.map(row=>[row.id,row]));
    if(!Array.isArray(change.order) || change.order.length!==natural.length ||
       new Set(change.order).size!==natural.length || change.order.some(id=>!byId.has(id))){
      throw Error('ترتيب سجلات مسودة المزامنة غير صالح');
    }
    after[field]=change.order.map(id=>byId.get(id)!);
  }
  return after as T;
}
