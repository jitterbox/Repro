import { dirname } from 'node:path';

import { captureStageCacheKey, runCapture } from '@jitterbox/repro-capture';

import { loadConfig } from './io.js';
import { artifactEnding, matchingVerifiedStage } from './stages.js';

import type { CaptureRunResult } from '@jitterbox/repro-capture';
import type { StageManifest } from '@jitterbox/repro-core';

export interface CaptureCommandOptions {
  readonly config: string;
  readonly outDir?: string;
  readonly resume?: string;
  readonly runId?: string;
  readonly storePath?: string;
  readonly url?: string;
}

export interface CaptureCommandResult extends CaptureRunResult {
  readonly resumed?: boolean;
}

export async function captureCommand(
  options: CaptureCommandOptions,
): Promise<CaptureCommandResult> {
  const { config } = await loadConfig(options.config);
  const cacheKey = captureStageCacheKey({
    config,
    ...(options.url === undefined ? {} : { url: options.url }),
  });
  const resumed = await matchingCaptureStage(options.resume, cacheKey);

  if (resumed !== null) {
    return resumedCaptureResult({
      manifest: resumed.manifest,
      path: resumed.path,
      ...(options.runId === undefined ? {} : { runId: options.runId }),
    });
  }

  return runCapture({
    config,
    ...(options.outDir === undefined ? {} : { outputDir: options.outDir }),
    ...(options.resume === undefined ? {} : { stageRootDir: options.resume }),
    ...(options.runId === undefined ? {} : { runId: options.runId }),
    ...(options.storePath === undefined
      ? {}
      : { storePath: options.storePath }),
    ...(options.url === undefined ? {} : { url: options.url }),
  });
}

async function matchingCaptureStage(
  rootDir: string | undefined,
  cacheKey: string,
): Promise<{ readonly manifest: StageManifest; readonly path: string } | null> {
  if (rootDir === undefined) {
    return null;
  }

  const result = await matchingVerifiedStage({
    cacheKey,
    rootDir,
    stages: ['capture'],
  });

  if (result?.manifest == null || result.path == null) {
    return null;
  }

  return { manifest: result.manifest, path: result.path };
}

function resumedCaptureResult(input: {
  readonly manifest: StageManifest;
  readonly path: string;
  readonly runId?: string;
}): CaptureCommandResult {
  const environmentPath =
    artifactEnding(input.manifest, 'environment.json') ?? '';
  const storePath = artifactEnding(input.manifest, 'capture.db');

  return {
    environmentPath,
    outputDir:
      environmentPath === '' ? dirname(input.path) : dirname(environmentPath),
    resumed: true,
    runId: input.runId ?? 'resumed',
    stagePath: input.path,
    storePath,
  };
}
