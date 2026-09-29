import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import type * as Core from '@repro/core';
import type { RunManifest } from '@repro/contracts';

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock('@repro/core', async (original) => ({
  ...(await original<typeof Core>()),
  runProcess: mocks.process,
}));
vi.mock('./playwright-runner.js', () => ({
  scenarioPlaywrightRunner: () => 'runner.js',
}));
vi.mock('./source-identity.js', () => ({
  scenarioConfigFile: () => Promise.resolve(undefined),
  scenarioSourceIdentity: () => Promise.resolve('identity'),
}));
vi.mock('./evidence-run.js', () => ({
  readRun: async (directory: string) =>
    JSON.parse(await readFile(join(directory, 'run.json'), 'utf8')) as Pick<
      RunManifest,
      'id' | 'pipelineOutcome'
    >,
}));
import { runScenario, scenarioFileFilter } from './execute.js';

afterEach(() => vi.clearAllMocks());

it('isolates concurrent invocations and retains only their own incomplete attempts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-invocations-'));
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  mocks.process.mockImplementation(
    async (
      _command: string,
      args: string[],
      options: { env: Record<string, string> },
    ) => {
      const name = new RegExp(args[2] ?? '').test(
        resolve('broken.spec.ts').replaceAll(String.fromCharCode(92), '/'),
      )
        ? 'broken'
        : 'complete';
      const output = options.env.REPRO_OUT;
      if (!output) throw new Error('No output directory');
      await mkdir(join(output, name));
      if (name === 'complete')
        await writeFile(
          join(output, name, 'run.json'),
          JSON.stringify({ id: name, pipelineOutcome: 'passed' }),
        );
      if (++started === 2) release();
      await ready;
      if (name === 'broken') throw new Error('Browser disconnected');
    },
  );
  try {
    const common = {
      evidence: fileURLToPath(
        new URL(
          '../../../packages/playwright/examples/after.json',
          import.meta.url,
        ),
      ),
      outDir: directory,
    };
    const [complete, broken] = await Promise.all([
      runScenario({ ...common, spec: 'complete.spec.ts' }),
      runScenario({ ...common, spec: 'broken.spec.ts' }),
    ]);
    expect(complete.ok).toBe(true);
    expect(complete.runs.map(({ run }) => run.id)).toEqual(['complete']);
    expect(complete.incompleteAttempts).toEqual([]);
    expect(broken.ok).toBe(false);
    expect(broken.runs).toEqual([]);
    expect(broken.incompleteAttempts).toHaveLength(1);
    expect(broken.incompleteAttempts[0]?.directory).toMatch(/broken$/);
    expect(broken.executionError).toContain('Browser disconnected');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('selects exact scenario filenames with Windows separators and regex metacharacters', () => {
  const windows = String.raw`C:\Users\QA Person\repro (copy)\flow[1].spec.ts`;
  const pattern = new RegExp(scenarioFileFilter(windows));
  expect(pattern.test('C:/Users/QA Person/repro (copy)/flow[1].spec.ts')).toBe(
    true,
  );
  expect(pattern.test('C:/Users/QA Person/repro (copy)/flow1.spec.ts')).toBe(
    false,
  );
  expect(
    pattern.test('C:/Users/QA Person/repro (copy)/flow[1].spec.ts.extra'),
  ).toBe(false);
  expect(
    new RegExp(scenarioFileFilter('/tmp/test+copy/a.spec.ts')).test(
      '/tmp/test+copy/a.spec.ts',
    ),
  ).toBe(true);
});
