import Database from 'better-sqlite3';
import { lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

/**
 * SQLite owns the process lock, including crash recovery. Never unlink its file:
 * a second inode could admit a concurrent writer while an older connection lives.
 * Legacy sentinel locks are rejected explicitly rather than guessed stale.
 */
export async function withFileLock<T>(
  path: string,
  work: () => Promise<T>,
  timeoutMs = 10_000,
): Promise<T> {
  if (
    await lstat(path).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    })
  )
    throw new Error(
      `Legacy writer lock requires inspection before removal: ${path}`,
    );
  const database = new Database(lockDatabasePath(path), { timeout: 0 });
  let acquired = false;
  const deadline = Date.now() + timeoutMs;
  try {
    while (!acquired) {
      try {
        database.exec('BEGIN IMMEDIATE');
        acquired = true;
      } catch (error) {
        if ((error as { code?: string }).code !== 'SQLITE_BUSY') throw error;
        if (Date.now() >= deadline)
          throw new Error(`Operation is locked by another writer: ${path}`);
        // Yield so another asynchronous owner in this process can finish.
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    return await work();
  } finally {
    if (acquired) database.exec('ROLLBACK');
    database.close();
  }
}

/** SQLite's Windows VFS also needs room for its journal suffix, unlike Node's long-path I/O. */
function lockDatabasePath(path: string): string {
  const absolute = resolve(path);
  if (
    process.platform !== 'win32' ||
    `${absolute}.sqlite-journal`.length <= 240
  )
    return `${path}.sqlite`;
  const name = `.repro-lock-${createHash('sha256').update(absolute.toLowerCase()).digest('hex')}.sqlite`;
  let directory = dirname(absolute);
  while (`${join(directory, name)}-journal`.length > 240) {
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error(`No Windows-safe lock location for: ${path}`);
    directory = parent;
  }
  // Keep a stable full-path identity in the nearest short ancestor. Never unlink
  // this database: concurrent processes must continue to open the same inode.
  return join(directory, name);
}
