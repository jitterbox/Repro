import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { hashFontFile } from './fonts.js';

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
