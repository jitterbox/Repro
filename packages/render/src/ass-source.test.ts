import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { withAssSource } from './ass-source.js';

it.each([false, true])(
  'stages long subtitle paths and cleans up after failure=%s',
  async (fail) => {
    const directory = await mkdtemp(join(tmpdir(), 'repro-ass-test-'));
    const nested = join(
      directory,
      'x'.repeat(100),
      'y'.repeat(100),
      'z'.repeat(100),
    );
    const source = join(nested, 'original.ass');
    let staged = '';
    try {
      await mkdir(nested, { recursive: true });
      await writeFile(source, 'original subtitle contents');
      const result = withAssSource(
        source,
        async (path) => {
          staged = path;
          expect(path.length).toBeLessThan(260);
          expect(await readFile(path, 'utf8')).toBe(
            'original subtitle contents',
          );
          if (fail) throw new Error('render failed');
          return 'rendered';
        },
        'win32',
      );
      if (fail) await expect(result).rejects.toThrow('render failed');
      else expect(await result).toBe('rendered');
      await expect(access(staged)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(source, 'utf8')).toBe('original subtitle contents');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
