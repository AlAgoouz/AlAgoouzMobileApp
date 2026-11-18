import {DatabaseSync} from 'node:sqlite';

export function acquireBackupLock(file) {
  const database = new DatabaseSync(file);
  try {
    // The OS releases SQLite's lock even if Node exits without running finally.
    database.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;');
  } catch (error) {
    database.close();
    throw error;
  }
  return () => database.close();
}
