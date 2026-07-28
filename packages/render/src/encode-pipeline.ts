import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { generateAss } from './ass.js';
import { buildFilterGraph } from './filtergraph.js';

import type { SkiaOverlayInput } from './filtergraph.js';
import type { ReproPlan } from '@repro/plan';

export interface RenderPlanInput {
  readonly video: string;
  readonly plan: ReproPlan;
  readonly outDir: string;
  readonly outputName?: string;
  readonly ffmpegPath?: string;
  readonly progressBar?: boolean;
  readonly skiaInputs?: readonly string[];
}

export interface RenderPlanResult {
  readonly outputPath: string;
  readonly assPath: string;
  readonly filterComplex: string;
}

const BT709_ARGS = [
  '-c:v',
  'libx264',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
  '-profile:v',
  'high',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-colorspace',
  'bt709',
  '-color_range',
  'tv',
  '-movflags',
  '+faststart',
] as const;

export async function renderPlan(
  input: RenderPlanInput,
): Promise<RenderPlanResult> {
  await mkdir(input.outDir, { recursive: true });

  const assPath = join(input.outDir, 'overlay.ass');
  await writeFile(assPath, generateAss({ plan: input.plan }));

  const ffmpegPath = input.ffmpegPath ?? 'ffmpeg';
  const overlays = skiaOverlays(input.skiaInputs ?? []);
  const graph = buildFilterGraph({
    assPath,
    plan: input.plan,
    skiaOverlays: overlays,
    ...(input.progressBar === undefined
      ? {}
      : { progressBar: input.progressBar }),
    videoPreFilters: await videoPreFilters(ffmpegPath),
  });
  const outputPath = join(input.outDir, input.outputName ?? 'rendered.mp4');

  await runFfmpeg({
    args: ffmpegArgs(input, graph.filterComplex, graph.videoLabel, outputPath),
    ffmpegPath,
  });

  return {
    assPath,
    filterComplex: graph.filterComplex,
    outputPath,
  };
}

function skiaOverlays(paths: readonly string[]): readonly SkiaOverlayInput[] {
  return paths.map((path, index) => {
    void path;
    return { streamIndex: index + 1 };
  });
}

function ffmpegArgs(
  input: RenderPlanInput,
  filterComplex: string,
  videoLabel: string,
  outputPath: string,
): readonly string[] {
  return [
    '-y',
    '-i',
    input.video,
    ...overlayInputArgs(input.skiaInputs ?? []),
    '-filter_complex',
    filterComplex,
    '-map',
    videoLabel,
    '-map',
    '0:a?',
    ...BT709_ARGS,
    '-c:a',
    'copy',
    outputPath,
  ];
}

function overlayInputArgs(paths: readonly string[]): readonly string[] {
  return paths.flatMap((path) => ['-i', path]);
}

function runFfmpeg(input: {
  readonly ffmpegPath: string;
  readonly args: readonly string[];
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.ffmpegPath, input.args);
    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const exitCode = code === null ? 'unknown' : String(code);
      reject(new Error(`ffmpeg exited with ${exitCode}: ${stderr}`));
    });
  });
}

async function videoPreFilters(ffmpegPath: string): Promise<readonly string[]> {
  if (!(await ffmpegHasZscale(ffmpegPath))) {
    return ['format=yuv420p'];
  }

  return [
    'zscale=primariesin=bt709:transferin=bt709:matrixin=bt709:' +
      'primaries=bt709:transfer=bt709:matrix=bt709',
    'format=yuv420p',
  ];
}

async function ffmpegHasZscale(ffmpegPath: string): Promise<boolean> {
  try {
    const output = await runFfmpegOutput({
      args: ['-hide_banner', '-filters'],
      ffmpegPath,
    });
    return output.includes(' zscale ');
  } catch {
    return false;
  }
}

function runFfmpegOutput(input: {
  readonly ffmpegPath: string;
  readonly args: readonly string[];
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.ffmpegPath, input.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf8');

      if (code === 0) {
        resolve(output);
        return;
      }

      reject(new Error(output));
    });
  });
}
