import { fixtureCli, fixtureRunForVideo } from '@jitterbox/repro-e2e-fixture';
import { join } from 'node:path';
import {
  captureCommand,
  compareCommand,
  qualityCommand,
  validateConfigCommand,
} from '@jitterbox/repro-cli';

import type { ReproCliVerb, TranscriptStep } from './types.js';

export interface ReproCliTools {
  readonly allowedVerbs: readonly ReproCliVerb[];
  validateConfig(configPath: string): ReturnType<typeof validateConfigCommand>;
  capture(
    options: Parameters<typeof captureCommand>[0],
  ): ReturnType<typeof captureCommand>;
  annotate(options: {
    config: string;
    events: string;
    outDir: string;
    video: string;
  }): Promise<{ planPath: string; render: { outputPath: string } }>;
  compare(
    options: Parameters<typeof compareCommand>[0],
  ): ReturnType<typeof compareCommand>;
  renderCompare(options: {
    composition: string;
    outDir: string;
    videoA: string;
    videoB: string;
  }): Promise<{ outputPath: string }>;
  quality(
    options: Parameters<typeof qualityCommand>[0],
  ): ReturnType<typeof qualityCommand>;
}

export const REPRO_CLI_VERBS = [
  'validate-config',
  'run',
  'render',
  'compare',
  'quality',
] as const satisfies readonly ReproCliVerb[];

export function createReproCliTools(): ReproCliTools {
  return {
    allowedVerbs: REPRO_CLI_VERBS,
    annotate: async (options) => {
      const result = (await fixtureCli(
        'render',
        await fixtureRunForVideo(options.video),
      )) as { directory: string; outputPath: string };
      return { planPath: join(result.directory, 'plan.json'), render: result };
    },
    capture: captureCommand,
    compare: compareCommand,
    quality: qualityCommand,
    renderCompare: async (options) =>
      (await fixtureCli(
        'render',
        await fixtureRunForVideo(options.videoB),
        '--baseline',
        await fixtureRunForVideo(options.videoA),
        '--observational',
      )) as { outputPath: string },
    validateConfig: (configPath) =>
      validateConfigCommand({ config: configPath }),
  };
}

export async function recordStep<T>(
  tool: ReproCliVerb,
  input: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<{ readonly step: TranscriptStep; readonly result: T }> {
  const startedAt = new Date().toISOString();

  try {
    const result = await run();
    return {
      result,
      step: {
        finishedAt: new Date().toISOString(),
        input,
        ok: true,
        output: result,
        startedAt,
        tool,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw Object.assign(new Error(message), {
      step: {
        error: message,
        finishedAt: new Date().toISOString(),
        input,
        ok: false,
        startedAt,
        tool,
      } satisfies TranscriptStep,
    });
  }
}

export function isAllowedVerb(value: string): value is ReproCliVerb {
  return (REPRO_CLI_VERBS as readonly string[]).includes(value);
}
