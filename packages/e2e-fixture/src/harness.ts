import { readFile } from 'node:fs/promises';
import { buildPlan } from '@jitterbox/repro-plan';
import type { EventRecord } from '@jitterbox/repro-core';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { compareRuns } from '@jitterbox/repro-compare';
import { validateConfig } from '@jitterbox/repro-core';

import { getRepoRoot } from './bugs.js';
import { startShopliteServer } from './server.js';

import type { BugWorkItem } from './bugs.js';
import type { FixtureMode, ShopliteServer } from './server.js';
import type { CaptureSession } from '@jitterbox/repro-capture';
import type {
  CompareManifest,
  CompareRunResult,
} from '@jitterbox/repro-compare';
import type { ReproConfig } from '@jitterbox/repro-core';
import type { Page } from 'playwright';

export interface ScenarioContext {
  readonly outDir: string;
  readonly server: ShopliteServer;
}

export interface CaptureScenarioResult {
  readonly captureDir: string;
  readonly eventsPath: string;
  readonly runId: string;
  readonly videoPath: string;
  readonly environmentPath: string;
}

export interface AnnotateScenarioResult {
  readonly planPath: string;
  readonly renderDir: string;
  readonly videoPath: string;
}

export function outputRoot(scenario: string): string {
  return join(getRepoRoot(), '.repro/fixture-videos', scenario);
}

export async function withServer<T>(
  run: (server: ShopliteServer) => Promise<T>,
): Promise<T> {
  const server = await startShopliteServer();
  try {
    return await run(server);
  } finally {
    await server.close();
  }
}

export async function runScenarioCapture(input: {
  readonly scenario: string;
  readonly config: ReproConfig;
  readonly fixture: FixtureMode;
  readonly server: ShopliteServer;
  readonly drive: (session: CaptureSession) => Promise<void>;
  readonly runId?: string;
  readonly bugId?: string;
}): Promise<CaptureScenarioResult> {
  const validation = validateConfig(input.config);
  if (!validation.ok)
    throw new Error(validation.errors.map((e) => e.message).join('; '));
  const packageFixture = input.scenario === 'package-quality';
  const selectors = (input.config.redaction?.masks ?? []).map((selector) =>
    /^[a-z][a-z0-9-]+$/i.test(selector)
      ? `[data-testid="${selector}"]`
      : selector,
  );
  const root = outputRoot(input.scenario);
  await mkdir(root, { recursive: true });
  const driver = input.drive.name;
  if (!/^drive[A-Za-z][A-Za-z0-9]*$/.test(driver))
    throw new Error('Use an exported fixture driver');
  const specPath = join(
    getRepoRoot(),
    'packages/e2e-fixture/.repro',
    `${input.scenario}.spec.ts`,
  );
  await mkdir(dirname(specPath), { recursive: true });
  await writeFile(
    specPath,
    `import { test, expect } from '@jitterbox/repro-playwright';
import { ${driver} } from '../src/scenarios/drivers.js';
test('Recorded fixture behavior', async ({ page, repro }) => {
  await repro.step('prepare', async () => { await page.goto(process.env.REPRO_URL!); });
  await repro.step('exercise', async () => { await ${driver}(repro.session); });
  await repro.step('inspect', async () => { ${packageFixture ? `await repro.outcome('result', async () => { await expect(page.getByTestId('input-email')).toHaveValue('canary@example.test'); await expect(page.getByTestId('input-ssn')).toHaveValue('999-00-0001'); });` : ''} await repro.checkpoint('result'); });
});
`,
  );
  const playwrightConfig = join(dirname(specPath), 'playwright.config.ts');
  await writeFile(
    playwrightConfig,
    `export default { testDir: '.', timeout: 60000, reporter: [['list']], use: ${JSON.stringify({ viewport: input.config.viewport, deviceScaleFactor: input.config.viewport.deviceScaleFactor, ...(input.config.profile === 'controlled' ? { locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' } : {}) })} };
`,
  );
  const evidence = join(root, `${input.fixture}.evidence.json`);
  await writeFile(
    evidence,
    JSON.stringify({
      schemaVersion: '1.0.0',
      id: input.scenario,
      title: input.scenario,
      claim: packageFixture
        ? 'Untouched fixture fields retain their initial values'
        : 'Observe the recorded fixture interaction',
      expected: packageFixture
        ? 'Notify email and Tax ID retain their fixture values before privacy sanitization'
        : 'Inspect actual captured application behavior',
      variant: {
        id: input.fixture,
        role: packageFixture
          ? 'standalone'
          : input.fixture === 'broken'
            ? 'before'
            : 'after',
        label: input.fixture,
      },
      targets: [],
      steps: [
        { id: 'prepare', title: 'Open the fixture' },
        { id: 'exercise', title: 'Exercise the interaction', trigger: true },
        { id: 'inspect', title: 'Inspect the result' },
      ],
      checkpoints: [
        {
          id: 'result',
          step: 'inspect',
          title: 'Recorded result',
          targets: [],
          observations: packageFixture
            ? ['screenshot', 'assertion']
            : ['screenshot'],
          highlights: [],
        },
      ],
      outputs: ['png', 'mp4', 'review'],
      privacy: {
        strict: true,
        selectors,
        patterns: [],
      },
    }),
  );
  const configPath = join(root, 'repro.config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      ...input.config,
      ...(input.config.redaction
        ? { redaction: { ...input.config.redaction, masks: selectors } }
        : {}),
    }),
  );
  const result = (await fixtureCli(
    'run',
    specPath,
    '--verbose',
    '--playwright-config',
    playwrightConfig,
    '--config',
    configPath,
    '--evidence',
    evidence,
    '--url',
    input.server.fixtureUrl(input.fixture, input.bugId),
    '--out-dir',
    root,
  )) as {
    ok: boolean;
    runs: {
      directory: string;
      run: { id: string; artifacts: { kind: string; path: string }[] };
    }[];
  };
  if (!result.ok || !result.runs[0]) throw new Error(JSON.stringify(result));
  const captured = result.runs[0];
  const video = captured.run.artifacts.find((a) => a.kind === 'recording');
  if (!video) throw new Error('Recording missing');
  return {
    captureDir: captured.directory,
    runId: captured.run.id,
    eventsPath: join(captured.directory, 'events.jsonl'),
    videoPath: join(captured.directory, video.path),
    environmentPath: join(captured.directory, 'environment.json'),
  };
}

export async function fixtureCli(...args: string[]): Promise<unknown> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(getRepoRoot(), 'packages/cli/dist/bin.js'), ...args],
    { maxBuffer: 32 * 1024 * 1024 },
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const output = (key: 'stdout' | 'stderr') =>
      error && typeof error === 'object' && key in error
        ? String((error as Record<string, unknown>)[key])
        : '';
    throw new Error(
      [message, output('stdout'), output('stderr')].filter(Boolean).join('\n'),
    );
  });
  return JSON.parse(stdout) as unknown;
}

export async function fixtureRunForVideo(video: string): Promise<string> {
  let directory = dirname(video);
  while (directory !== dirname(directory)) {
    try {
      await stat(join(directory, 'run.json'));
      return directory;
    } catch {
      directory = dirname(directory);
    }
  }
  throw new Error('Expected video from a committed fixture run');
}

export async function runScenarioAnnotate(input: {
  readonly scenario: string;
  readonly config: ReproConfig;
  readonly eventsPath: string;
  readonly videoPath: string;
  readonly suffix?: string;
}): Promise<AnnotateScenarioResult> {
  const run = await fixtureRunForVideo(input.videoPath);
  const rendered = (await fixtureCli('render', run)) as {
    directory: string;
    outputPath: string;
  };
  const renderDir = join(outputRoot(input.scenario), input.suffix ?? 'render');
  await mkdir(renderDir, { recursive: true });
  // Keep event-planner coverage independent of rendering. This diagnostic plan
  // is never composited or exported as proof; scene.json owns rendered visuals.
  const events = (await readFile(input.eventsPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EventRecord);
  const plan = buildPlan({
    config: input.config,
    events,
    frames: [],
    viewport: input.config.viewport,
  });
  const planPath = join(renderDir, 'plan.json');
  await writeFile(planPath, JSON.stringify(plan));
  await writeFile(
    join(outputRoot(input.scenario), 'scene-result.json'),
    JSON.stringify({ ...rendered, run }),
  );
  return {
    planPath,
    renderDir: rendered.directory,
    videoPath: rendered.outputPath,
  };
}

export async function runScenarioCompare(input: {
  readonly scenario: string;
  readonly left: CompareManifest;
  readonly right: CompareManifest;
  readonly videoA?: string;
  readonly videoB?: string;
  readonly layout?: string;
  readonly layouts?: readonly string[];
}): Promise<
  CompareRunResult & {
    readonly compareVideoPath?: string;
    readonly compareVideoPaths?: readonly string[];
  }
> {
  const outDir = join(outputRoot(input.scenario), 'compare');
  await mkdir(outDir, { recursive: true });
  const leftPath = join(outDir, 'left.json');
  const rightPath = join(outDir, 'right.json');
  await writeFile(leftPath, `${JSON.stringify(input.left, null, 2)}\n`);
  await writeFile(rightPath, `${JSON.stringify(input.right, null, 2)}\n`);
  const result = await compareRuns({ left: leftPath, right: rightPath });
  await writeFile(
    join(outDir, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  if (
    input.videoA === undefined ||
    input.videoB === undefined ||
    result.composition === undefined
  ) {
    return result;
  }

  // Numeric comparison above remains a fixture of the comparison engine.
  // Recorded walkthroughs are explicitly observational, never claimed as fix proof.
  const before = await fixtureRunForVideo(input.videoA);
  const after = await fixtureRunForVideo(input.videoB);
  for (const directory of [before, after]) {
    const manifest = JSON.parse(
      await readFile(join(directory, 'run.json'), 'utf8'),
    ) as { artifacts: { kind: string }[] };
    if (!manifest.artifacts.some((a) => a.kind === 'presentation-scene'))
      await fixtureCli('render', directory);
  }
  const rendered = (await fixtureCli(
    'render',
    after,
    '--baseline',
    before,
    '--observational',
  )) as { outputPath: string };
  await writeFile(
    join(outDir, 'scene-comparison.json'),
    JSON.stringify(rendered),
  );
  return {
    ...result,
    compareVideoPath: rendered.outputPath,
    compareVideoPaths: [rendered.outputPath],
  };
}

export async function runScenarioPackage(input: {
  readonly scenario: string;
  readonly videoPath: string;
  readonly planPath?: string;
}): Promise<string> {
  const outDir = join(outputRoot(input.scenario), 'package');
  const run = await fixtureRunForVideo(input.videoPath);
  await fixtureCli('export', run, '--draft', '--out-dir', outDir);
  return join(outDir, 'evidence-manifest.json');
}

export async function assertVideo(
  path: string,
  minBytes = 1_000,
): Promise<void> {
  const info = await stat(path);
  if (info.size < minBytes) {
    throw new Error(`Video too small (${String(info.size)}): ${path}`);
  }
  // testsrc2 fallback was a fixed 2s ~500KB clip — reject that fingerprint.
  if (info.size === 499_846) {
    throw new Error(`Video looks like testsrc fallback: ${path}`);
  }
}

export function configFromBug(bug: BugWorkItem): ReproConfig {
  return bug['Custom.ReproConfig'];
}

export async function writeQualityPass(scenario: string): Promise<string> {
  const root = outputRoot(scenario);
  const rendered = JSON.parse(
    await readFile(join(root, 'scene-result.json'), 'utf8'),
  ) as { directory: string };
  const receipt = JSON.parse(
    await readFile(join(rendered.directory, 'render-receipt.json'), 'utf8'),
  ) as {
    frameCount: number;
    layoutFramesChecked: number;
    randomSeekPassed: boolean;
  };
  const quality = JSON.parse(
    await readFile(join(rendered.directory, 'scene-quality.json'), 'utf8'),
  ) as { status: string };
  const out = join(root, 'quality-report.json');
  await writeFile(
    out,
    JSON.stringify({
      pass:
        quality.status === 'passed' &&
        receipt.frameCount > 0 &&
        receipt.layoutFramesChecked === receipt.frameCount &&
        receipt.randomSeekPassed,
      receipt,
      quality,
    }),
  );
  return out;
}

export async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    'document.documentElement.dataset.reproReady === "1"',
  );
}
