import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { withFileLock } from '@jitterbox/repro-core';

/** Readers and writers share the render lock; ordered acquisition avoids paired deadlocks. */
export async function withRunLocks<T>(
  directories: string[],
  work: () => Promise<T>,
): Promise<T> {
  const paths = [
    ...new Set(
      await Promise.all(directories.map((directory) => realpath(directory))),
    ),
  ].sort();
  const acquire = (index: number): Promise<T> => {
    const directory = paths[index];
    return directory === undefined
      ? work()
      : withFileLock(join(directory, 'render.lock'), () => acquire(index + 1));
  };
  return acquire(0);
}
