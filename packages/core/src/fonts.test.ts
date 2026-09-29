import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { hashFontFile, inventoryFontFiles } from './fonts.js';

it('streams full font contents and invalidates hashes when a file changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-fonts-'));
  const path = join(directory, 'font.ttc');
  const contents = Buffer.alloc(2 * 1024 * 1024, 42);
  try {
    await writeFile(path, contents);
    const expected = createHash('sha256').update(contents).digest('hex');
    expect(await hashFontFile(path)).toBe(expected);
    expect(await hashFontFile(path)).toBe(expected);
    await writeFile(path, 'replacement');
    expect(await hashFontFile(path)).toBe(
      createHash('sha256').update('replacement').digest('hex'),
    );
    await rm(path);
    await expect(hashFontFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('bounds stalled host font reads, preserves known hashes and marks unknown provenance', async () => {
  let reads = 0;
  let cancelled = false;
  const files = [
    { family: 'Known', source: 'test', path: 'known-test-font' },
    { family: 'Stalled', source: 'test', path: 'stalled-test-font' },
  ];
  const read = (path: string, signal?: AbortSignal): Promise<string> => {
    reads++;
    if (path === 'known-test-font') return Promise.resolve('known-hash');
    signal?.addEventListener(
      'abort',
      () => {
        cancelled = true;
      },
      { once: true },
    );
    return new Promise(() => {
      /* Simulate a filesystem read that never settles. */
    });
  };
  const expected = [
    { family: 'Known', source: 'test', sha256: 'known-hash' },
    { family: 'Stalled', source: 'test', sha256: null },
  ];
  expect(await inventoryFontFiles(files, read, 25)).toEqual(expected);
  expect(cancelled).toBe(true);
  expect(await inventoryFontFiles(files, read, 25)).toEqual(expected);
  expect(reads).toBe(3);
});
