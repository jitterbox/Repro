import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { withFileLock } from './lock.js';

it('serializes asynchronous owners and releases ownership after failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-lock-')),
    path = join(root, 'writer.lock');
  try {
    const order: number[] = [];
    await Promise.all([
      withFileLock(path, async () => {
        order.push(1);
        await new Promise((resolve) => setTimeout(resolve, 40));
        order.push(2);
      }),
      withFileLock(path, () => {
        order.push(3);
        return Promise.resolve();
      }),
    ]);
    // Acquisition order is scheduler-dependent; critical sections must never interleave.
    expect([
      [1, 2, 3],
      [3, 1, 2],
    ]).toContainEqual(order);
    await expect(
      withFileLock(path, () => Promise.reject(new Error('failed'))),
    ).rejects.toThrow('failed');
    await expect(
      withFileLock(path, () => Promise.resolve('recovered')),
    ).resolves.toBe('recovered');
    await writeFile(path, 'legacy sentinel');
    await expect(withFileLock(path, () => Promise.resolve(1))).rejects.toThrow(
      'Legacy writer lock',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('recovers an OS-owned lock after an abruptly terminated writer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-lock-crash-')),
    path = join(root, 'writer.lock');
  const sqlite = createRequire(import.meta.url).resolve('better-sqlite3');
  const child = spawn(
    process.execPath,
    [
      '-e',
      `const D=require(${JSON.stringify(sqlite)});const db=new D(${JSON.stringify(path + '.sqlite')});db.exec('BEGIN IMMEDIATE');process.stdout.write('ready');setInterval(()=>{},1000);`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.stdout.once('data', () => {
        resolve();
      });
    });
    await expect(
      withFileLock(path, () => Promise.resolve('unsafe'), 30),
    ).rejects.toThrow('another writer');
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
    await expect(
      withFileLock(path, () => Promise.resolve('recovered')),
    ).resolves.toBe('recovered');
  } finally {
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
});

it('locks deeply nested named artifacts without exceeding the Windows SQLite journal limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-long-lock-'));
  const directory = join(
    root,
    ...Array.from({ length: 6 }, () => 'named-work-item-directory'),
  );
  const path = join(directory, `${'a'.repeat(64)}.lock`);
  try {
    await mkdir(directory, { recursive: true });
    await withFileLock(path, async () => {
      await expect(
        withFileLock(path, () => Promise.resolve('unsafe'), 30),
      ).rejects.toThrow('another writer');
    });
    await expect(
      withFileLock(path, () => Promise.resolve('released')),
    ).resolves.toBe('released');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
