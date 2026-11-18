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
