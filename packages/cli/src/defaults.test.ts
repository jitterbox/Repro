import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReproProgram } from './index.js';
it('creates a portable UTF-8 template and preserves existing treatment files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro defaults '));
  const file = join(directory, 'treatment.json');
  try {
    await createReproProgram(() => undefined).parseAsync(
      ['defaults', '--out', file],
      {
        from: 'user',
      },
    );
    const bytes = await readFile(file);
    expect(bytes[0]).toBe(123);
    const plan = JSON.parse(bytes.toString()) as {
      style: { bodyFontSize: number };
      encoding: { crf: number };
    };
    expect(plan.style.bodyFontSize).toBe(18);
    expect(plan.encoding.crf).toBe(18);
    await expect(
      createReproProgram(() => undefined).parseAsync(
        ['defaults', '--out', file],
        {
          from: 'user',
        },
      ),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(file)).toEqual(bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
