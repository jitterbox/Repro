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
      naming: { useWorkItemId: true },
      versionOverlay: { enabled: true, discover: true },
      export: { devtools: true },
    });
    const config = JSON.parse(
      await readFile(join(directory, 'repro.config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(config.workItem).toBeUndefined();
    expect(
      JSON.parse(await readFile(join(directory, 'evidence.json'), 'utf8')),
    ).toMatchObject({ workItem: { id: 'Metric overflow on mobile' } });
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

it.each(['run', 'export', 'render'])(
  'preserves omitted and explicit policy flags for %s',
  async (verb) => {
    const flags =
      verb === 'render'
        ? ['version-overlay']
        : verb === 'export'
          ? ['use-work-item-id']
          : ['use-work-item-id', 'version-overlay'];
    for (const flag of flags) {
      for (const enabled of [undefined, true, false]) {
        const program = createReproProgram(() => undefined);
        let received: Record<string, unknown> | undefined;
        program.commands
          .find((command) => command.name() === verb)
          ?.action((_arg: string, options: Record<string, unknown>) => {
            received = options;
          });
        const required =
          verb === 'run'
            ? ['--evidence', 'evidence.json']
            : verb === 'export'
              ? ['--out-dir', 'bundle']
              : [];
        await program.parseAsync(
          [
            verb,
            'run',
            ...required,
            ...(enabled === undefined
              ? []
              : [`--${enabled ? '' : 'no-'}${flag}`]),
          ],
          { from: 'user' },
        );
        const key =
          flag === 'version-overlay' ? 'versionOverlay' : 'useWorkItemId';
        expect(received?.[key]).toBe(enabled);
      }
    }
  },
);
