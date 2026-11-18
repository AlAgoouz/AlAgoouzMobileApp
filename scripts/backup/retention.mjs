const filename = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-[a-f0-9]{8}\.agouz$/;
const dayMs = 86_400_000;

function archives(entries, now) {
  if (!Array.isArray(entries)) throw new Error('BACKUP_STORAGE_INVALID_LIST');
  const groups = new Map();
  let ignored = 0;
  for (const entry of entries) {
    const match = filename.exec(entry?.Name ?? '');
    const iso = match && `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
    const date = new Date(iso || NaN);
    if (!match || entry.IsDir !== false || !Number.isSafeInteger(entry.Size) || entry.Size <= 0 ||
        !Number.isFinite(+date) || date.toISOString() !== iso || +date > +now) {
      ignored++;
      continue;
    }
    const group = groups.get(entry.Name) ?? [];
    const hash = entry.Hashes?.MD5 ?? entry.Hashes?.md5;
    group.push({name: entry.Name, date, bytes: entry.Size, hash: typeof hash === 'string' ? hash.toLowerCase() : undefined});
    groups.set(entry.Name, group);
  }
  const all = [...groups.values()].flat();
  const unique = all.filter(row => groups.get(row.name).length === 1);
  return {all, unique, ignored: ignored + all.length - unique.length};
}

function totals(rows) {
  return {files: rows.length, bytes: rows.reduce((total, row) => total + row.bytes, 0)};
}

export function backupRetentionReport(verifiedListing, pendingListing, latestFile, now = new Date()) {
  const verified = archives(verifiedListing, now);
  const pending = archives(pendingListing, now);
  const latest = verified.unique.find(row => row.name === latestFile);
  if (!latest) throw new Error('BACKUP_STORAGE_LATEST_NOT_LISTED');
  const dailyStart = +now - 30 * dayMs;
  const monthlyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().slice(0, 7);
  const protectedNames = new Set([latest.name]);
  const months = new Set();
  for (const row of [...verified.unique].sort((a, b) => +b.date - +a.date)) {
    const month = row.name.slice(0, 7);
    if (+row.date >= dailyStart || month >= monthlyStart && !months.has(month)) protectedNames.add(row.name);
    months.add(month);
  }
  const byName = new Map(verified.unique.map(row => [row.name, row]));
  const confirmedDuplicates = pending.unique.filter(row => {
    const copy = byName.get(row.name);
    return row.name !== latest.name && +row.date < +now - 7 * dayMs && copy?.bytes === row.bytes &&
      typeof row.hash === 'string' && /^[a-f0-9]{32}$/.test(row.hash) && copy.hash === row.hash;
  });
  return {
    verified: totals(verified.all),
    pending: totals(pending.all),
    olderVerifiedForReview: totals(verified.unique.filter(row => !protectedNames.has(row.name))),
    pendingDuplicatesForReview: totals(confirmedDuplicates),
    ignoredOrAmbiguousFiles: verified.ignored + pending.ignored,
  };
}
