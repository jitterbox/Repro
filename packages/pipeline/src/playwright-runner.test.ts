import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it, expect } from 'vitest';
import { scenarioPlaywrightRunner } from './playwright-runner.js';

it('uses the fixture runner from an external consumer and rejects a missing fixture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-runner-'));
  try {
    const spec = join(directory, 'tests', 'scenario.spec.ts');
    await mkdir(join(directory, 'tests'));
    const fixture = join(directory, 'node_modules', '@jitterbox', 'repro-playwright');
    const runner = join(fixture, 'node_modules', '@playwright', 'test');
    await mkdir(runner, { recursive: true });
    // Block resolution explicitly: some hosts expose workspace dependencies
    // through NODE_PATH, so an empty temp directory need not lack the fixture.
    const blocked = join(
      directory,
      'blocked',
      'node_modules',
      '@jitterbox',
      'repro-playwright',
    );
    await mkdir(blocked, { recursive: true });
    await writeFile(
      join(blocked, 'package.json'),
      JSON.stringify({ exports: {} }),
    );
    expect(() =>
      scenarioPlaywrightRunner(join(directory, 'blocked', 'scenario.spec.ts')),
    ).toThrow('Install the public fixture');
    await writeFile(
      join(fixture, 'package.json'),
      JSON.stringify({ name: '@jitterbox/repro-playwright', main: 'index.js' }),
    );
    await writeFile(join(fixture, 'index.js'), '');
    await writeFile(
      join(runner, 'package.json'),
      JSON.stringify({
        name: '@playwright/test',
        exports: { './cli': './cli.js' },
      }),
    );
    await writeFile(join(runner, 'cli.js'), '');
    expect(scenarioPlaywrightRunner(spec)).toBe(join(runner, 'cli.js'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
