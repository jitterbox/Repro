import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReproProgram } from './index.js';

it('accepts a work item name when initializing a portable scenario', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-work-item-'));
  try {
    await createReproProgram(() => undefined).parseAsync(
      ['init', 'Metric overflow on mobile', '--directory', directory],
      { from: 'user' },
    );
    expect(
      JSON.parse(await readFile(join(directory, 'repro.config.json'), 'utf8')),
    ).toMatchObject({
      workItem: 'Metric overflow on mobile',
      export: { devtools: true },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each([[], ['--devtools'], ['--no-devtools']])(
  'preserves explicit export preference and leaves omission available for config: %j',
  async (...flags) => {
    const program = createReproProgram(() => undefined);
    let options: Record<string, unknown> | undefined;
    program.commands
      .find((command) => command.name() === 'export')
      ?.action((_run: string, value: Record<string, unknown>) => {
        options = value;
      });
    await program.parseAsync(
      [
        'export',
        'run',
        '--out-dir',
        'bundle',
        '--work-item',
        'DASH2R-949',
        ...flags,
      ],
      { from: 'user' },
    );
    expect(options?.workItem).toBe('DASH2R-949');
    expect(options?.devtools).toBe(
      flags.length ? flags[0] === '--devtools' : undefined,
    );
  },
);
