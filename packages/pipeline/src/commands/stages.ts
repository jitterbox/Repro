import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  REPRO_CORE_VERSION,
  implementationDigest,
  cacheKey,
  resumeFromLastVerified,
  writeStageAtomic,
} from '@jitterbox/repro-core';

import type {
  HashInput,
  ReproConfig,
  ResumeResult,
  StageManifest,
  StageName,
} from '@jitterbox/repro-core';

export interface StageKeyInput {
  readonly config: ReproConfig;
  readonly inputs: HashInput;
  readonly versions: Record<string, string>;
}

export interface WriteCliStageInput extends StageKeyInput {
  readonly artifacts: readonly string[];
  readonly cacheKey: string;
  readonly rootDir: string;
  readonly stage: StageName;
}

export function cliStageCacheKey(input: StageKeyInput): string {
  return cacheKey({
    config: hashInputFromJson(input.config),
    inputs: input.inputs,
    versions: withCoreVersion(input.versions),
  });
}

export async function writeCliStage(
  input: WriteCliStageInput,
): Promise<string> {
  const manifest = cliStageManifest(input);
  return writeStageAtomic({ manifest, rootDir: input.rootDir });
}

export async function matchingVerifiedStage(input: {
  readonly cacheKey: string;
  readonly rootDir: string;
  readonly stages: readonly StageName[];
}): Promise<ResumeResult | null> {
  const result = await resumeFromLastVerified({
    rootDir: input.rootDir,
    stages: input.stages.slice(-1),
    cacheKeys: Object.fromEntries(
      input.stages.slice(-1).map((stage) => [stage, input.cacheKey]),
    ),
  });

  return result.manifest?.cacheKey === input.cacheKey ? result : null;
}

export function artifactEnding(
  manifest: StageManifest,
  suffix: string,
): string | undefined {
  return manifest.artifacts.find((artifact) => artifact.endsWith(suffix));
}

export function defaultStageRoot(outDir: string): string {
  return join(outDir, 'stages');
}

function cliStageManifest(input: WriteCliStageInput): StageManifest {
  return {
    artifacts: input.artifacts,
    cacheKey: input.cacheKey,
    completedAtEpoch: Date.now(),
    config: hashInputFromJson(input.config),
    inputs: input.inputs,
    stage: input.stage,
    versions: withCoreVersion(input.versions),
  };
}

function withCoreVersion(
  versions: Record<string, string>,
): Record<string, string> {
  return {
    ...versions,
    '@jitterbox/repro-core': REPRO_CORE_VERSION,
    coreImplementation: implementationDigest(
      createRequire(import.meta.url).resolve('@jitterbox/repro-core'),
    ),
    pipelineImplementation: implementationDigest(
      new URL('../index.js', import.meta.url).href,
    ),
    renderImplementation: implementationDigest(
      createRequire(import.meta.url).resolve('@jitterbox/repro-render'),
    ),
    planImplementation: implementationDigest(
      createRequire(import.meta.url).resolve('@jitterbox/repro-plan'),
    ),
    themeImplementation: implementationDigest(
      createRequire(import.meta.url).resolve('@jitterbox/repro-contracts'),
    ),
  };
}

function hashInputFromJson(value: unknown): HashInput {
  return JSON.parse(JSON.stringify(value)) as HashInput;
}
