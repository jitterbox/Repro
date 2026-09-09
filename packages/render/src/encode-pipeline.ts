import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runProcess, h264Profile } from '@repro/core';

import { generateAss } from './ass.js';
import { buildFilterGraph } from './filtergraph.js';
import { writeVtt } from './voiceover.js';

import type { CompositorOverlayInput } from './filtergraph.js';
import type { ReproPlan } from '@repro/plan';

export interface TimedCompositorInput {
  readonly path: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface RenderPlanInput {
  readonly video: string;
  readonly plan: ReproPlan;
  readonly outDir: string;
  readonly outputName?: string;
  readonly ffmpegPath?: string;
  readonly progressBar?: boolean;
  readonly slatePath?: string;
  readonly compositorInputs?: readonly (string | TimedCompositorInput)[];
}

export interface RenderPlanResult {
  readonly outputPath: string;
  readonly assPath: string;
  readonly timelinePath: string;
  readonly filterComplex: string;
}

const BT709_ARGS = h264Profile;

export async function probeMediaDurationMs(
  videoPath: string,
  ffprobePath = 'ffprobe',
): Promise<number | undefined> {
  try {
    const output = await runFfmpegOutput({
      args: [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ],
      ffmpegPath: ffprobePath,
    });
    const seconds = Number.parseFloat(output.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return undefined;
    }
    return seconds * 1_000;
  } catch {
    return undefined;
  }
}

export async function renderPlan(
  input: RenderPlanInput,
): Promise<RenderPlanResult> {
  await mkdir(input.outDir, { recursive: true });

  const assPath = join(input.outDir, 'overlay.ass');
  const timelinePath = join(input.outDir, 'timeline.json');
  await writeFile(assPath, generateAss({ plan: input.plan }));
  await writeFile(
    timelinePath,
    `${JSON.stringify(input.plan.timeline, null, 2)}\n`,
  );

  const ffmpegPath = input.ffmpegPath ?? 'ffmpeg';
  const compositorInputs = (input.compositorInputs ?? []).map(
    normalizeCompositorInput,
  );
  const extraInputs = [
    ...(input.slatePath === undefined ? [] : [input.slatePath]),
    ...compositorInputs.map((entry) => entry.path),
  ];
  const slateStreamIndex = input.slatePath === undefined ? undefined : 1;
  const overlayStart = input.slatePath === undefined ? 1 : 2;
  const overlays = compositorOverlays(compositorInputs, overlayStart);
  const mediaMs = await probeMediaDurationMs(input.video);
  const timeline =
    mediaMs === undefined
      ? input.plan.timeline
      : clampTimelineToMedia(input.plan.timeline, mediaMs);
  const graph = buildFilterGraph({
    assPath,
    plan: input.plan,
    timeline,
    compositorOverlays: overlays,
    ...(slateStreamIndex === undefined ? {} : { slateStreamIndex }),
    ...(input.progressBar === undefined
      ? {}
      : { progressBar: input.progressBar }),
    videoPreFilters: await videoPreFilters(ffmpegPath),
  });
  const outputPath = join(input.outDir, input.outputName ?? 'rendered.mp4');

  await runFfmpeg({
    args: ffmpegArgs(
      input.video,
      extraInputs,
      graph.filterComplex,
      graph.videoLabel,
      outputPath,
      timeline.fps,
    ),
    ffmpegPath,
  });

  const narration = input.plan.narrationSegments ?? [];
  if (narration.length > 0) {
    await writeVtt(
      join(input.outDir, 'captions.vtt'),
      narration.map((segment) => ({
        id: segment.id,
        text: segment.text,
        timeRange: segment.outTimeRange ?? segment.timeRange,
      })),
    );
  }

  return {
    assPath,
    filterComplex: graph.filterComplex,
    outputPath,
    timelinePath,
  };
}

function normalizeCompositorInput(
  input: string | TimedCompositorInput,
): TimedCompositorInput {
  if (typeof input === 'string') {
    return { endMs: Number.POSITIVE_INFINITY, path: input, startMs: 0 };
  }
  return input;
}

function compositorOverlays(
  inputs: readonly TimedCompositorInput[],
  startIndex: number,
): readonly CompositorOverlayInput[] {
  return inputs.map((entry, index) => {
    const startSec = Math.max(0, entry.startMs) / 1_000;
    const endSec = Number.isFinite(entry.endMs)
      ? Math.max(startSec, entry.endMs / 1_000)
      : undefined;
    const enable =
      endSec === undefined
        ? `gte(t,${startSec.toFixed(3)})`
        : `between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`;
    return {
      streamIndex: startIndex + index,
      enable,
      ...(entry.x === undefined ? {} : { x: entry.x }),
      ...(entry.y === undefined ? {} : { y: entry.y }),
      ...(entry.width === undefined ? {} : { width: entry.width }),
      ...(entry.height === undefined ? {} : { height: entry.height }),
    };
  });
}

function clampTimelineToMedia(
  timeline: ReproPlan['timeline'],
  mediaDurationMs: number,
): ReproPlan['timeline'] {
  const mediaEnd = Math.max(0, mediaDurationMs);
  const lastFrameMs = Math.max(0, mediaEnd - 1_000 / timeline.fps);
  return {
    ...timeline,
    beats: timeline.beats.map((beat) => {
      if (beat.kind === 'hold') {
        return {
          ...beat,
          captureAtMs: Math.min(beat.captureAtMs ?? 0, lastFrameMs),
        };
      }
      if (beat.kind === 'play' || beat.kind === 'trim') {
        const start = Math.min(beat.captureStartMs ?? 0, mediaEnd);
        const end = Math.min(
          Math.max(beat.captureEndMs ?? start, start),
          mediaEnd,
        );
        return {
          ...beat,
          captureStartMs: start,
          captureEndMs: Math.max(end, start + 1_000 / timeline.fps),
        };
      }
      return beat;
    }),
  };
}

function ffmpegArgs(
  video: string,
  extraInputs: readonly string[],
  filterComplex: string,
  videoLabel: string,
  outputPath: string,
  fps: number,
): readonly string[] {
  return [
    '-y',
    '-i',
    video,
    ...extraInputs.flatMap((path) => ['-i', path]),
    '-filter_complex',
    filterComplex,
    '-map',
    videoLabel,
    '-map',
    '0:a?',
    '-r',
    String(fps),
    '-fps_mode',
    'cfr',
    ...BT709_ARGS,
    '-c:a',
    'copy',
    outputPath,
  ];
}

async function runFfmpeg(input: {
  readonly ffmpegPath: string;
  readonly args: readonly string[];
}): Promise<void> {
  await runProcess(input.ffmpegPath, input.args);
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
  return runProcess(input.ffmpegPath, input.args);
}

/** Burn the same cue definitions onto the exact checkpoint PNG, without motion fades. */
export async function renderCheckpointImage(input: {
  image: string;
  plan: ReproPlan;
  output: string;
}): Promise<void> {
  const range = { start: 0, end: 1000 };
  const plan: ReproPlan = {
    ...input.plan,
    annotations: input.plan.annotations.map((annotation) => ({
      ...annotation,
      timeRange: range,
      outTimeRange: range,
    })),
    timeline: {
      schemaVersion: '1.0.0',
      fps: 30,
      beats: [
        {
          id: 'checkpoint',
          kind: 'play',
          source: 'capture',
          captureStartMs: 0,
          captureEndMs: 1000,
          rate: 1,
          outStartMs: 0,
          outDurationMs: 1000,
        },
      ],
      timeMap: {
        kind: 'piecewise-linear',
        knots: [
          [0, 0],
          [1000, 1000],
        ],
      },
      warnings: [],
    },
  };
  const assPath = `${input.output}.ass`;
  await writeFile(assPath, generateAss({ plan, staticFrame: true }));
  const graph = buildFilterGraph({ assPath, plan, progressBar: false });
  await runFfmpeg({
    ffmpegPath: 'ffmpeg',
    args: [
      '-v',
      'error',
      '-y',
      '-loop',
      '1',
      '-i',
      input.image,
      '-filter_complex',
      graph.filterComplex,
      '-map',
      graph.videoLabel,
      '-frames:v',
      '1',
      input.output,
    ],
  });
}
