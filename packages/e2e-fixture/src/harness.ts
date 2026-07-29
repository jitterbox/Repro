import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { encodeH264, runCapture } from '@repro/capture';
import { annotateCommand, packageCommand } from '@repro/cli';
import { compareRuns } from '@repro/compare';
import { ReproStore, validateConfig } from '@repro/core';
import {
  buildQualityReport,
  metricStatus,
  runDeterministicGates,
} from '@repro/evaluation';
import { renderCompare } from '@repro/render';

import { getRepoRoot } from './bugs.js';
import { startShopliteServer } from './server.js';

import type { BugWorkItem } from './bugs.js';
import type { FixtureMode, ShopliteServer } from './server.js';
import type { CaptureSession } from '@repro/capture';
import type { CompareManifest, CompareRunResult } from '@repro/compare';
import type { ReproConfig } from '@repro/core';
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
  if (!validation.ok) {
    throw new Error(
      validation.errors.map((item) => item.message).join('; '),
    );
  }

  const captureDir = join(outputRoot(input.scenario), `capture-${input.fixture}`);
  await rm(captureDir, { force: true, recursive: true });
  await mkdir(captureDir, { recursive: true });

  const capture = await runCapture({
    config: input.config,
    outputDir: captureDir,
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    run: input.drive,
    url: input.server.fixtureUrl(input.fixture, input.bugId),
  });

  const eventsPath = join(captureDir, 'events.jsonl');
  if (capture.storePath === undefined) {
    throw new Error('Capture did not produce a store path');
  }
  const store = new ReproStore({ path: capture.storePath });
  store.exportJsonl({ path: eventsPath, runId: capture.runId });
  store.close();

  const videoPath = join(captureDir, 'raw.mp4');
  await encodeCapturedFrames(captureDir, videoPath);

  return {
    captureDir,
    environmentPath: capture.environmentPath,
    eventsPath,
    runId: capture.runId,
    videoPath,
  };
}

export async function runScenarioAnnotate(input: {
  readonly scenario: string;
  readonly config: ReproConfig;
  readonly eventsPath: string;
  readonly videoPath: string;
  readonly suffix?: string;
}): Promise<AnnotateScenarioResult> {
  const renderDir = join(
    outputRoot(input.scenario),
    input.suffix ?? 'render',
  );
  await rm(renderDir, { force: true, recursive: true });
  await mkdir(renderDir, { recursive: true });

  const configPath = join(renderDir, 'repro.config.json');
  await writeFile(
    configPath,
    `${JSON.stringify(input.config, null, 2)}\n`,
  );

  const annotated = await annotateCommand({
    config: configPath,
    events: input.eventsPath,
    outDir: renderDir,
    outputName: 'annotated.mp4',
    planOut: join(renderDir, 'plan.json'),
    video: input.videoPath,
  });

  return {
    planPath: annotated.planPath,
    renderDir,
    videoPath: annotated.render.outputPath,
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

  const layouts = input.layouts ?? [
    input.layout ?? result.composition.layout ?? 'side-by-side',
  ];
  const paths: string[] = [];
  for (const layout of layouts) {
    const composition = {
      ...result.composition,
      layout: layout as typeof result.composition.layout,
      output: {
        ...result.composition.output,
        filename: `${layout}_compare.mp4`,
      },
      ...(layout === 'cropped-roi' && result.composition.croppedRoi === undefined
        ? {
            croppedRoi: {
              rect: { x: 520, y: 280, w: 140, h: 48 },
              magnification: 2.5,
            },
          }
        : {}),
    };
    const rendered = await renderCompare({
      composition,
      outDir: join(outDir, 'render'),
      videoA: input.videoA,
      videoB: input.videoB,
    });
    paths.push(rendered.outputPath);
  }
  return {
    ...result,
    ...(paths[0] === undefined ? {} : { compareVideoPath: paths[0] }),
    compareVideoPaths: paths,
  };
}

export async function runScenarioPackage(input: {
  readonly scenario: string;
  readonly videoPath: string;
  readonly planPath?: string;
}): Promise<string> {
  const outDir = join(outputRoot(input.scenario), 'package');
  const viewerDir = join(getRepoRoot(), 'packages/viewer/dist');
  const assets = [
    { kind: 'mp4' as const, path: input.videoPath },
    ...(input.planPath === undefined
      ? []
      : [{ kind: 'json' as const, path: input.planPath }]),
  ];
  const result = await packageCommand({ assets, outDir, viewerDir });
  return result.manifestPath;
}

export async function assertVideo(path: string, minBytes = 1_000): Promise<void> {
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
  const out = join(root, 'quality-report.json');
  const videoPath = await findAnnotatedVideo(root);
  const planPath = videoPath === undefined
    ? undefined
    : join(videoPath, '..', 'plan.json');
  const timelinePath = videoPath === undefined
    ? undefined
    : join(videoPath, '..', 'timeline.json');

  const gates =
    videoPath === undefined
      ? { pass: false, results: [] }
      : await runDeterministicGates({
          videoPath,
          ...(planPath === undefined ? {} : { planPath }),
          ...(timelinePath === undefined ? {} : { timelinePath }),
          frameWidth: 1280,
          frameHeight: 720,
          mode: 'repro',
        });

  const report = buildQualityReport({
    completed: gates.pass,
    metrics: [
      {
        name: 'determinism',
        required: true,
        status: metricStatus(gates.pass ? 1 : 0, 1, 'at-least'),
        threshold: 1,
        value: gates.pass ? 1 : 0,
      },
      {
        name: 'human-usefulness',
        required: false,
        status: metricStatus(gates.results.length, 1, 'at-least'),
        threshold: 1,
        value: gates.results.length,
      },
    ],
  });
  await writeFile(
    out,
    `${JSON.stringify({ ...report, gates: gates.results }, null, 2)}\n`,
  );
  return out;
}

async function findAnnotatedVideo(
  root: string,
): Promise<string | undefined> {
  for (const sub of ['render', 'render-broken', 'render-fixed']) {
    const dir = join(root, sub);
    try {
      const files = await readdir(dir);
      const mp4 = files.find(
        (name) => name.endsWith('.mp4') && !name.includes('raw'),
      );
      if (mp4 !== undefined) {
        return join(dir, mp4);
      }
    } catch {
      // missing render dir
    }
  }
  return undefined;
}

export async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    'document.documentElement.dataset.reproReady === "1"',
  );
}

async function encodeCapturedFrames(
  captureDir: string,
  outputPath: string,
): Promise<void> {
  const framesRoot = join(captureDir, 'frames');
  const pageId = await pickFramePage(framesRoot);
  if (pageId === undefined) {
    throw new Error(`No screencast frames under ${framesRoot}`);
  }

  const pattern = join(framesRoot, pageId, 'frame-%06d.jpg');
  await encodeH264({
    frameRate: 15,
    inputPattern: pattern,
    outputPath,
    overwrite: true,
  });
}

async function pickFramePage(framesRoot: string): Promise<string | undefined> {
  const pages = await readdir(framesRoot).catch(() => [] as string[]);
  let best: { id: string; count: number } | undefined;

  for (const pageId of pages) {
    const files = await readdir(join(framesRoot, pageId)).catch(
      () => [] as string[],
    );
    const count = files.filter((name) => name.endsWith('.jpg')).length;
    if (count === 0) {
      continue;
    }
    if (best === undefined || count > best.count) {
      best = { count, id: pageId };
    }
  }

  return best?.id;
}
