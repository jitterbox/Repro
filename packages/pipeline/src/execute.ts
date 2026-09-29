import {
  scenarioConfigFile,
  scenarioSourceIdentity,
} from './source-identity.js';
import { compareEvidence } from './comparison.js';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runProcess, artifactBaseName, ReproConfigSchema } from '@jitterbox/repro-core';
import { validateEvidence, appVersionSchema } from '@jitterbox/repro-contracts';
import { recipes } from './discovery.js';
import { readRun } from './evidence-run.js';
import { scenarioPlaywrightRunner } from './playwright-runner.js';
const require = createRequire(import.meta.url);
export interface RunOptions {
  spec: string;
  workItem?: string | undefined;
  description?: string | undefined;
  useWorkItemId?: boolean | undefined;
  appVersion?: string | undefined;
  versionOverlay?: boolean | undefined;
  devtools?: boolean | undefined;
  url?: string | undefined;
  evidence: string;
  config?: string | undefined;
  playwrightConfig?: string | undefined;
  project?: string | undefined;
  outDir?: string | undefined;
  buildId?: string | undefined;
  baseline?: string | undefined;
  repeat?: number | undefined;
  signal?: AbortSignal;
}
export async function runScenario(options: RunOptions) {
  const spec = resolve(options.spec);
  const evidence = resolve(options.evidence);
  const evidenceSpec = validateEvidence(
    JSON.parse(await readFile(evidence, 'utf8')),
  );
  const configured = options.config
    ? ReproConfigSchema.parse(
        JSON.parse(await readFile(resolve(options.config), 'utf8')),
      )
    : undefined;
  const workItem = options.workItem ?? evidenceSpec.workItem?.id;
  const description =
    options.description ??
    evidenceSpec.workItem?.description ??
    evidenceSpec.title;
  const useWorkItemId =
    options.useWorkItemId ?? configured?.naming?.useWorkItemId ?? true;
  const name = artifactBaseName({
    workItem,
    description,
    scenarioId: evidenceSpec.id,
    useWorkItemId,
  });
  if (workItem !== undefined && (!workItem.trim() || workItem.length > 200))
    throw new Error('workItem must contain 1–200 characters');
  if (
    options.description !== undefined &&
    (!options.description.trim() || options.description.length > 200)
  )
    throw new Error('description must contain 1–200 characters');
  appVersionSchema.parse({
    version: options.appVersion,
    build: options.buildId,
  });
  const root = resolve(options.outDir ?? '.repro/runs');
  await mkdir(root, { recursive: true });
  const args = [
    scenarioPlaywrightRunner(spec),
    'test',
    scenarioFileFilter(spec),
    '--workers=1',
  ];
  if (options.playwrightConfig)
    args.push('--config', resolve(options.playwrightConfig));
  if (options.project) args.push('--project', options.project);
  if (options.repeat) {
    if (!Number.isInteger(options.repeat) || options.repeat < 1)
      throw new Error('repeat must be a positive integer');
    args.push('--repeat-each', String(options.repeat));
  }
  const playwrightConfig = await scenarioConfigFile(options.playwrightConfig);
  const codeIdentity = await scenarioSourceIdentity(
    [spec, ...(playwrightConfig ? [playwrightConfig] : [])],
    [evidence, ...(options.config ? [resolve(options.config)] : [])],
  );
  const executableIdentity = await scenarioSourceIdentity([
    spec,
    ...(playwrightConfig ? [playwrightConfig] : []),
  ]);
  // Each invocation owns its attempt directory, including failures without a
  // manifest. Directory snapshots cannot distinguish concurrent invocations.
  const out = await mkdtemp(join(root, `${name}-`));
  let executionError: string | null = null;
  try {
    await runProcess(process.execPath, args, {
      env: {
        ...process.env,
        REPRO_EVIDENCE: evidence,
        REPRO_WORK_ITEM: workItem ?? '',
        REPRO_DESCRIPTION:
          options.description ?? evidenceSpec.workItem?.description ?? '',
        REPRO_USE_WORK_ITEM_ID: String(useWorkItemId),
        REPRO_APP_VERSION: options.appVersion ?? '',
        REPRO_VERSION_OVERLAY: String(
          options.versionOverlay ?? configured?.versionOverlay?.enabled ?? true,
        ),
        REPRO_EXPORT_DEVTOOLS: String(
          options.devtools ?? configured?.export?.devtools ?? true,
        ),
        REPRO_OUT: out,
        REPRO_CODE_IDENTITY: codeIdentity,
        REPRO_SCENARIO_SOURCE_IDENTITY: executableIdentity,
        ...(options.url ? { REPRO_URL: options.url } : {}),
        ...(options.config ? { REPRO_CONFIG: resolve(options.config) } : {}),
        ...(options.buildId ? { REPRO_BUILD_ID: options.buildId } : {}),
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    executionError = error instanceof Error ? error.message : String(error);
  }
  const runs = [];
  const incompleteAttempts: {
    directory: string;
    status: 'inconclusive';
    detail: string;
  }[] = [];
  const attempts = (await readdir(out, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const entry of attempts) {
    try {
      const run = await readRun(join(out, entry));
      runs.push({ directory: join(out, entry), run });
    } catch (error) {
      incompleteAttempts.push({
        directory: join(out, entry),
        status: 'inconclusive',
        detail:
          error instanceof Error
            ? error.message
            : 'Attempt did not produce a complete manifest',
      });
    }
  }
  const comparisons = options.baseline
    ? await Promise.all(
        runs.map((r) =>
          compareEvidence(requireValue(options.baseline), r.directory),
        ),
      )
    : [];
  return {
    incompleteAttempts,
    comparisons,
    ok:
      incompleteAttempts.length === 0 &&
      comparisons.every((c) => c.ok) &&
      executionError === null &&
      runs.length > 0 &&
      runs.every((r) => r.run.pipelineOutcome === 'passed'),
    runs,
    executionError:
      runs.length === 0
        ? (executionError ??
          'No Repro fixture evidence produced. Import test from @jitterbox/repro-playwright.')
        : executionError,
    baseline: options.baseline ?? null,
  };
}
export async function initScenario(
  directory = process.cwd(),
  workItem?: string,
  description?: string,
) {
  if (workItem !== undefined && (!workItem.trim() || workItem.length > 200))
    throw new Error('workItem must contain 1–200 characters');
  if (
    description !== undefined &&
    (!description.trim() || description.length > 200)
  )
    throw new Error('description must contain 1–200 characters');
  await mkdir(directory, { recursive: true });
  const files: Record<string, string> = {
    'tsconfig.json':
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
          },
        },
        null,
        2,
      ) + '\n',
    'evidence.json':
      JSON.stringify(
        {
          ...recipes[0],
          ...(workItem || description
            ? {
                workItem: {
                  ...(workItem ? { id: workItem.trim() } : {}),
                  ...(description ? { description: description.trim() } : {}),
                },
              }
            : {}),
        },
        null,
        2,
      ) + '\n',
    'repro.config.json':
      JSON.stringify(
        {
          mode: 'repro',
          naming: { useWorkItemId: true },
          versionOverlay: { enabled: true, discover: true },
          export: { devtools: true },
          surfaceCapture: 'page',
          profile: 'controlled',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
          features: { steps: true, redaction: true },
          redaction: { masks: [], strict: true },
        },
        null,
        2,
      ) + '\n',
    'playwright.config.ts': `import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', testMatch: 'scenario.spec.ts', use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block', reducedMotion: 'reduce' }, reporter: [['list'], ['@jitterbox/repro-playwright/reporter']] });\n`,
    'scenario.spec.ts': `import { test, expect } from '@jitterbox/repro-playwright';\n\ntest('Checkout accepts pointer input', async ({ page, repro }) => {\n  await repro.step('prepare', async () => {\n    await page.goto(process.env.REPRO_URL!);\n    repro.target('target', page.getByRole('button', { name: 'Checkout', exact: true }));\n  });\n  await repro.step('trigger', async () => {\n    await repro.hitTest('result', 'target');\n    await page.getByRole('button', { name: 'Checkout', exact: true }).click({ timeout: 2000 }).catch(error => {\n      if (!String(error).includes('intercepts pointer events')) throw error;\n    });\n  });\n  await repro.step('verify', async () => {\n    await repro.outcome('result', () => expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible({ timeout: 2000 }));\n    await repro.checkpoint('result');\n  });\n});\n`,
  };
  for (const [name, content] of Object.entries(files))
    await writeFile(join(directory, name), content, { flag: 'wx' });
  return { files: Object.keys(files).map((name) => join(directory, name)) };
}
export async function recordScenario(url: string, output = 'scenario.spec.ts') {
  await runProcess(process.execPath, [
    require.resolve('@playwright/test/cli'),
    'codegen',
    url,
    '--target',
    'playwright-test',
    '--output',
    resolve(output),
  ]);
  return {
    path: resolve(output),
    next: 'Import test and expect from @jitterbox/repro-playwright, bind targets, and commit evidence.json with designated outcome checks.',
  };
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}

/** Discovery clients receive references and outcomes; full provenance remains in run.json. */
export function summarizeRunResult(
  result: Awaited<ReturnType<typeof runScenario>>,
) {
  return {
    ...result,
    runs: result.runs.map(({ directory, run }) => ({
      directory,
      manifest: join(directory, 'run.json'),
      run: {
        id: run.id,
        scenario: run.scenario,
        variant: run.variant,
        scenarioOutcome: run.scenarioOutcome,
        pipelineOutcome: run.pipelineOutcome,
        durationMs: run.durationMs,
        stages: run.stages,
        steps: run.steps,
        errors: run.errors,
        checkpoints: [...new Set(run.observations.map((o) => o.checkpoint))],
        artifactCount: run.artifacts.length,
      },
    })),
  };
}

/** Playwright positional arguments are regexes, not literal filesystem paths.
 * Its matcher also tests slash-normalized filenames on Windows. */
export function scenarioFileFilter(spec: string): string {
  const normalized = spec.split(String.fromCharCode(92)).join('/');
  return '^' + normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
}
