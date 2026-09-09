import Database from 'better-sqlite3';
import { lstat } from 'node:fs/promises';

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
  const database = new Database(`${path}.sqlite`, { timeout: 0 });
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
