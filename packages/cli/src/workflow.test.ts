import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, createReproProgram } from './index.js';
it('logs successful and failed CLI actions and exposes the report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro workflow '));
  const file = join(directory, 'calls.jsonl');
  const out = join(directory, 'treatment.json');
  const quiet = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await runCli([
      'node',
      'repro',
      '--workflow-log',
      file,
      'defaults',
      '--out',
      out,
    ]);
    await expect(
      runCli([
        'node',
        'repro',
        '--workflow-log',
        file,
        'defaults',
        '--out',
        out,
      ]),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    const log = await readFile(file, 'utf8');
    expect(log).not.toContain(out);
    expect(log).toContain('"status":"failed"');
    let response = '';
    await createReproProgram((text) => {
      response = text;
    }).parseAsync(['workflow-report', file], { from: 'user' });
    expect((JSON.parse(response) as { byCommand: unknown }).byCommand).toEqual([
      expect.objectContaining({ command: 'defaults', count: 2, failed: 1 }),
    ]);
  } finally {
    quiet.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
