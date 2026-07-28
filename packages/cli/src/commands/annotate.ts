import { join } from 'node:path';

import { REPRO_PLAN_VERSION, buildPlan } from '@repro/plan';
import { REPRO_RENDER_VERSION, renderPlan } from '@repro/render';

import {
  loadConfig,
  readEvents,
  readFrames,
  readJson,
  writeJson,
} from './io.js';
import {
  artifactEnding,
  cliStageCacheKey,
  defaultStageRoot,
  matchingVerifiedStage,
  writeCliStage,
} from './stages.js';

import type { ReproPlan } from '@repro/plan';
import type { RenderPlanResult } from '@repro/render';
import type { HashInput, ReproConfig, StageManifest } from '@repro/core';

export interface AnnotateCommandOptions {
  readonly config: string;
  readonly events: string;
  readonly frames?: string;
  readonly outDir: string;
  readonly outputName?: string;
  readonly planOut?: string;
  readonly resume?: string;
  readonly video: string;
}

export interface AnnotateCommandResult {
  readonly plan: ReproPlan;
  readonly planPath: string;
  readonly render: RenderPlanResult;
  readonly resumed?: 'compose' | 'encode';
}

export async function annotateCommand(
  options: AnnotateCommandOptions,
): Promise<AnnotateCommandResult> {
  const { config } = await loadConfig(options.config);
  const events = await readEvents(options.events);
  const frames =
    options.frames === undefined ? [] : await readFrames(options.frames);
  const rootDir = options.resume ?? defaultStageRoot(options.outDir);
  const composeKey = composeStageKey({ config, options });
  const encodeKey = encodeStageKey({ composeKey, config, options });
  const encoded = await matchingEncodeStage(options.resume, encodeKey);

  if (encoded !== null) {
    return encoded;
  }

  const planPath = options.planOut ?? join(options.outDir, 'plan.json');
  const composed = await matchingComposeStage(options.resume, composeKey);
  const plan =
    composed === null
      ? buildPlan({
          config,
          events,
          frames,
          viewport: config.viewport,
        })
      : composed.plan;

  if (composed === null) {
    await writeJson(planPath, plan);
    await writeCliStage({
      artifacts: [planPath],
      cacheKey: composeKey,
      config,
      inputs: composeInputs(options),
      rootDir,
      stage: 'compose',
      versions: composeVersions(),
    });
  }

  const activePlanPath = composed?.planPath ?? planPath;
  const render = await renderPlan({
    outDir: options.outDir,
    plan,
    video: options.video,
    ...(options.outputName === undefined
      ? {}
      : { outputName: options.outputName }),
  });

  await writeCliStage({
    artifacts: [activePlanPath, render.assPath, render.outputPath],
    cacheKey: encodeKey,
    config,
    inputs: encodeInputs({ composeKey, options }),
    rootDir,
    stage: 'encode',
    versions: encodeVersions(),
  });

  return {
    plan,
    planPath: activePlanPath,
    render,
  };
}

async function matchingEncodeStage(
  rootDir: string | undefined,
  cacheKey: string,
): Promise<AnnotateCommandResult | null> {
  if (rootDir === undefined) {
    return null;
  }

  const result = await matchingVerifiedStage({
    cacheKey,
    rootDir,
    stages: ['compose', 'encode'],
  });

  if (result?.manifest === null || result?.path === null || result === null) {
    return null;
  }

  return resumedAnnotateResult(result.manifest);
}

async function matchingComposeStage(
  rootDir: string | undefined,
  cacheKey: string,
): Promise<{ readonly plan: ReproPlan; readonly planPath: string } | null> {
  if (rootDir === undefined) {
    return null;
  }

  const result = await matchingVerifiedStage({
    cacheKey,
    rootDir,
    stages: ['compose'],
  });

  if (result?.manifest === null || result === null) {
    return null;
  }

  const planPath = artifactEnding(result.manifest, 'plan.json');
  if (planPath === undefined) {
    return null;
  }

  return {
    plan: (await readJson(planPath)) as ReproPlan,
    planPath,
  };
}

async function resumedAnnotateResult(
  manifest: StageManifest,
): Promise<AnnotateCommandResult | null> {
  const planPath = artifactEnding(manifest, 'plan.json');
  const outputPath = artifactEnding(manifest, '.mp4');
  const assPath = artifactEnding(manifest, '.ass') ?? '';

  if (planPath === undefined || outputPath === undefined) {
    return null;
  }

  return {
    plan: (await readJson(planPath)) as ReproPlan,
    planPath,
    render: {
      assPath,
      filterComplex: '',
      outputPath,
    },
    resumed: 'encode',
  };
}

function composeStageKey(input: {
  readonly config: ReproConfig;
  readonly options: AnnotateCommandOptions;
}): string {
  return cliStageCacheKey({
    config: input.config,
    inputs: composeInputs(input.options),
    versions: composeVersions(),
  });
}

function encodeStageKey(input: {
  readonly composeKey: string;
  readonly config: ReproConfig;
  readonly options: AnnotateCommandOptions;
}): string {
  return cliStageCacheKey({
    config: input.config,
    inputs: encodeInputs(input),
    versions: encodeVersions(),
  });
}

function composeInputs(options: AnnotateCommandOptions): HashInput {
  return {
    events: options.events,
    frames: options.frames ?? null,
  };
}

function encodeInputs(input: {
  readonly composeKey: string;
  readonly options: AnnotateCommandOptions;
}): HashInput {
  return {
    composeKey: input.composeKey,
    outputName: input.options.outputName ?? null,
    video: input.options.video,
  };
}

function composeVersions(): Record<string, string> {
  return {
    '@repro/plan': REPRO_PLAN_VERSION,
  };
}

function encodeVersions(): Record<string, string> {
  return {
    '@repro/render': REPRO_RENDER_VERSION,
  };
}
