import { expect, it } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withRunLocks } from './run-locks.js';

it('serializes paired snapshots in either order without locking a run twice', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-pair-lock-'));
  const a = join(root, 'a'),
    b = join(root, 'b');
  await Promise.all([mkdir(a), mkdir(b)]);
  let active = 0;
  const work = async () => {
    expect(active).toBe(0);
    active++;
    await new Promise((resolve) => setTimeout(resolve, 25));
    active--;
  };
  try {
    await Promise.all([withRunLocks([a, b], work), withRunLocks([b, a], work)]);
    await withRunLocks([a, join(a, '.')], work);
    await expect(
      withRunLocks([a, b], () => Promise.reject(new Error('failed snapshot'))),
    ).rejects.toThrow('failed snapshot');
    await withRunLocks([a, b], work);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
