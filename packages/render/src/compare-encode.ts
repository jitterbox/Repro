import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runProcess, h264Profile } from '@repro/core';
import { parseCompareComposition } from '@repro/contracts';
import { burnInFont } from './theme.js';

import {
  blinkLayout,
  croppedRoiLayout,
  differenceLayout,
  edgeOverlayLayout,
  onionLayout,
  wipeLayout,
} from '@repro/compare';

import type { CompareComposition } from '@repro/compare';

export interface RenderCompareInput {
  readonly composition: CompareComposition | Record<string, unknown>;
  readonly videoA: string;
  readonly videoB: string;
  readonly outDir: string;
  readonly ffmpegPath?: string;
}

export interface RenderCompareResult {
  readonly outputPath: string;
  readonly compositionPath: string;
  readonly timing: 'synchronized' | 'original';
  readonly outputTiming?: ReturnType<typeof comparisonOutputTiming>;
}

const BT709_ARGS = h264Profile;

const FRAME_W = 1280;
const FRAME_H = 720;
const PANE_W = 612;
const PANE_H = 345;
const PANE_Y = 124;
const PANE_GAP = 24;
const PANE_A_X = 24;
const PANE_B_X = PANE_A_X + PANE_W + PANE_GAP;

export async function renderCompare(
  input: RenderCompareInput,
): Promise<RenderCompareResult> {
  const composition = parseCompareComposition(input.composition);
  if (composition.output.width !== 1280 || composition.output.height !== 720)
    throw new Error('This renderer currently supports 1280x720 output only');
  await mkdir(input.outDir, { recursive: true });
  const compositionPath = join(input.outDir, 'compare-composition.json');
  const outputName =
    composition.output.filename ?? `${composition.layout}_compare.mp4`;
  const outputPath = join(input.outDir, outputName);
  const ffmpegPath = input.ffmpegPath ?? 'ffmpeg';
  const graph = buildCompareFilterGraph(composition);

  await writeFile(compositionPath, `${JSON.stringify(composition, null, 2)}\n`);
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      input.videoA,
      '-i',
      input.videoB,
      '-filter_complex',
      graph.filterComplex,
      '-map',
      graph.videoLabel,
      '-map',
      '0:a?',
      ...BT709_ARGS,
      '-c:a',
      'copy',
      outputPath,
    ],
    ffmpegPath,
  });

  return {
    compositionPath,
    outputPath,
    timing: composition.sync.knots.length >= 2 ? 'synchronized' : 'original',
    outputTiming: comparisonOutputTiming(composition),
  };
}

interface CompareFilterGraph {
  readonly filterComplex: string;
  readonly videoLabel: string;
}

function buildCompareFilterGraph(
  composition: CompareComposition,
): CompareFilterGraph {
  return {
    filterComplex:
      `${buildLayoutFilter(composition)};${checkpointOverlay(composition)};${scenarioOverlay(composition)}`.replaceAll(
        'drawtext=',
        `drawtext=font='${escapeDrawtext(burnInFont())}':`,
      ),
    videoLabel: '[proof]',
  };
}

function buildLayoutFilter(composition: CompareComposition): string {
  const synced = syncPrep(composition);
  const labelA = escapeDrawtext(composition.panes.a.label);
  const labelB = escapeDrawtext(composition.panes.b.label);
  const bugId = escapeDrawtext(composition.bugId ?? 'COMPARE');
  const delta = escapeDrawtext(primaryDeltaCaption(composition));

  switch (composition.layout) {
    case 'side-by-side':
      return [
        synced.a,
        synced.b,
        `[aSync]scale=${String(PANE_W)}:${String(PANE_H)}:force_original_aspect_ratio=decrease,` +
          `pad=${String(PANE_W)}:${String(PANE_H)}:(ow-iw)/2:(oh-ih)/2,setsar=1[aPane]`,
        `[bSync]scale=${String(PANE_W)}:${String(PANE_H)}:force_original_aspect_ratio=decrease,` +
          `pad=${String(PANE_W)}:${String(PANE_H)}:(ow-iw)/2:(oh-ih)/2,setsar=1[bPane]`,
        `[aPane]pad=${String(FRAME_W)}:${String(FRAME_H)}:${String(PANE_A_X)}:` +
          `${String(PANE_Y)}:color=0x101319[withA]`,
        `[withA][bPane]overlay=x=${String(PANE_B_X)}:y=${String(PANE_Y)}:shortest=1[panes]`,
        `[panes]drawtext=font='${escapeDrawtext(burnInFont())}':text='${labelA}':x=${String(PANE_A_X)}:y=84:` +
          `fontsize=18:fontcolor=white:box=1:boxcolor=0x5B6B8C@0.85[lA]`,
        `[lA]drawtext=font='${escapeDrawtext(burnInFont())}':text='${labelB}':x=${String(PANE_B_X)}:y=84:` +
          `fontsize=18:fontcolor=white:box=1:boxcolor=0x1B7F4A@0.85[lB]`,
        `[lB]drawtext=font='${escapeDrawtext(burnInFont())}':text='${bugId}':x=24:y=24:fontsize=20:fontcolor=white[id]`,
        `[id]null[step]`,
        `[step]drawtext=font='${escapeDrawtext(burnInFont())}':text='${delta}':x=24:y=h-56:fontsize=16:fontcolor=white:` +
          `box=1:boxcolor=black@0.55[delta]`,
        `[delta]drawbox=x=24:y=h-12:w=iw-48:h=4:color=white@0.75:t=fill[v]`,
      ].join(';');
    case 'onion':
      return [
        synced.a,
        synced.b,
        onionLayout({ left: '[aSync]', output: '[blend]', right: '[bSync]' }),
        scaleToFrame('[blend]', '[framed]'),
        chromeOverlay('[framed]', '[v]', {
          bugId,
          delta,
          layout: 'ONION',
          labelA,
          labelB,
        }),
      ].join(';');
    case 'wipe':
      return [
        synced.a,
        synced.b,
        wipeLayout({
          left: '[aSync]',
          output: '[wipe]',
          progress: composition.wipe?.restAt ?? 0.5,
          right: '[bSync]',
        }),
        scaleToFrame('[wipe]', '[framed]'),
        chromeOverlay('[framed]', '[v]', {
          bugId,
          delta,
          layout: 'WIPE',
          labelA,
          labelB,
        }),
      ].join(';');
    case 'blink':
      return [
        synced.a,
        synced.b,
        blinkLayout({ left: '[aSync]', output: '[blink]', right: '[bSync]' }),
        scaleToFrame('[blink]', '[framed]'),
        chromeOverlay('[framed]', '[v]', {
          bugId,
          delta,
          layout: 'BLINK',
          labelA,
          labelB,
        }),
      ].join(';');
    case 'difference':
      return [
        synced.a,
        synced.b,
        differenceLayout({
          left: '[aSync]',
          output: '[diff]',
          right: '[bSync]',
        }),
        scaleToFrame('[diff]', '[framed]'),
        chromeOverlay('[framed]', '[v]', {
          bugId,
          delta,
          layout: 'DIFF',
          labelA,
          labelB,
        }),
      ].join(';');
    case 'edge':
      return [
        synced.a,
        synced.b,
        edgeOverlayLayout({
          left: '[aSync]',
          output: '[edge]',
          right: '[bSync]',
        }),
        scaleToFrame('[edge]', '[framed]'),
        chromeOverlay('[framed]', '[v]', {
          bugId,
          delta,
          layout: 'EDGE',
          labelA,
          labelB,
        }),
      ].join(';');
    case 'cropped-roi': {
      const rect = requireValue(composition.croppedRoi?.rect);
      return [
        synced.a,
        synced.b,
        croppedRoiLayout({
          left: '[aSync]',
          output: '[roi]',
          rect,
          right: '[bSync]',
          ...(composition.croppedRoi?.magnification === undefined
            ? {}
            : { magnification: composition.croppedRoi.magnification }),
        }),
        scaleToFrame('[roi]', '[framed]'),
        chromeOverlay('[framed]', '[v]', {
          bugId,
          delta,
          layout: 'ROI',
          labelA,
          labelB,
        }),
      ].join(';');
    }
    default:
      return buildLayoutFilter({ ...composition, layout: 'side-by-side' });
  }
}

/**
 * Apply every measured synchronization knot so unequal intervals share output time.
 */
function syncPrep(composition: CompareComposition): {
  readonly a: string;
  readonly b: string;
} {
  const knots = composition.sync.knots;
  const fps = composition.output.fps || 30;
  if (knots.length < 2) {
    return {
      a: `[0:v]fps=${String(fps)},settb=1/${String(fps)},setpts=PTS-STARTPTS[aSync]`,
      b: `[1:v]fps=${String(fps)},settb=1/${String(fps)},setpts=PTS-STARTPTS[bSync]`,
    };
  }

  // The final capture interval can end between source frames. Preserve its
  // terminal image through the measured endpoint instead of letting the
  // shortest pane truncate a late checkpoint (or its label).
  const endMs = requireValue(knots.at(-1))[2];
  const frameCount = requireValue(
    comparisonOutputTiming(composition),
  ).frameCount;
  const tail = `fps=${fps},tpad=stop_mode=clone:stop_duration=${endMs / 1000},trim=end_frame=${frameCount},settb=1/${fps}`;
  return {
    a: `[0:v]setpts='${piecewisePts(knots, 0)}',${tail}[aSync]`,
    b: `[1:v]setpts='${piecewisePts(knots, 1)}',${tail}[bSync]`,
  };
}

/** Include a frame at or after every cue, even inside the final fractional interval. */
export function comparisonOutputTiming(composition: CompareComposition) {
  if (composition.sync.knots.length < 2) return undefined;
  const measuredDurationMs = requireValue(composition.sync.knots.at(-1))[2];
  const fps = composition.output.fps;
  const latestCueMs = Math.max(
    0,
    ...comparisonCheckpointLabels(composition).map((label) => label.atMs),
    ...comparisonScenarioLabels(composition).map((label) => label.startMs),
  );
  if (latestCueMs > measuredDurationMs)
    throw new Error('Comparison cue falls outside measured synchronization');
  const measuredFrames = Math.ceil((measuredDurationMs * fps) / 1000);
  const frameCount = Math.max(
    measuredFrames,
    Math.ceil((latestCueMs * fps) / 1000) + 1,
  );
  return {
    measuredDurationMs,
    frameCount,
    durationMs: (frameCount * 1000) / fps,
    terminalPaddingFrames: frameCount - measuredFrames,
  };
}

export function piecewisePts(
  knots: CompareComposition['sync']['knots'],
  side: 0 | 1,
): string {
  let expression = 'PTS-STARTPTS';
  for (let i = knots.length - 2; i >= 0; i--) {
    const a = requireValue(knots[i]),
      b = requireValue(knots[i + 1]);
    if (b[side] <= a[side] || b[2] < a[2])
      throw new Error('Sync knots must increase in source and output time');
    const rate = (b[2] - a[2]) / (b[side] - a[side]);
    const mapped = `${a[2] / 1000}/TB+(PTS-STARTPTS-${a[side] / 1000}/TB)*${rate}`;
    expression =
      i === knots.length - 2
        ? mapped
        : `if(lt((PTS-STARTPTS)*TB,${b[side] / 1000}),${mapped},${expression})`;
  }
  return expression;
}

function primaryDeltaCaption(composition: CompareComposition): string {
  const delta = composition.deltas?.[0];
  if (delta?.caption !== undefined && delta.caption.length > 0) {
    return delta.caption;
  }
  if (delta === undefined) {
    return 'No measured delta';
  }
  const parts: string[] = [];
  if (typeof delta.dx === 'number') {
    parts.push(`Δx=${formatDelta(delta.dx)}`);
  }
  if (typeof delta.dy === 'number') {
    parts.push(`Δy=${formatDelta(delta.dy)}`);
  }
  return parts.length > 0 ? parts.join(' ') : `${delta.class} delta`;
}

function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${String(value)}px`;
}

export function comparisonCheckpointLabels(composition: CompareComposition) {
  return (composition.sync.anchors ?? []).flatMap((anchor, index, anchors) => {
    const knot = composition.sync.knots.find(
      (point) => point[0] === anchor.aMs && point[1] === anchor.bMs,
    );
    return knot
      ? [
          {
            atMs: knot[2],
            text: `CHECKPOINT ${index + 1} / ${anchors.length} - ${anchor.title ?? anchor.stepId}`,
          },
        ]
      : [];
  });
}

function checkpointOverlay(composition: CompareComposition): string {
  if (composition.chrome?.stepCounter === false) return '[v]null[progress]';
  const labels = comparisonCheckpointLabels(composition);
  if (!labels.length) return '[v]null[progress]';
  return labels
    .map((label, index) => {
      const next = labels[index + 1];
      const input = index === 0 ? '[v]' : `[checkpoint${index - 1}]`;
      const output =
        index === labels.length - 1 ? '[progress]' : `[checkpoint${index}]`;
      const enable = next
        ? `gte(t,${label.atMs / 1000})*lt(t,${next.atMs / 1000})`
        : `gte(t,${label.atMs / 1000})`;
      return `${input}drawtext=font='${escapeDrawtext(burnInFont())}':text='${escapeDrawtext(label.text)}':x=24:y=h-96:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55:enable='${enable}'${output}`;
    })
    .join(';');
}

/** Timings and observation references are committed in the comparison document. */
export function comparisonScenarioLabels(composition: CompareComposition) {
  const presentation = composition.presentation;
  if (!presentation) return [];
  const labels: {
    text: string;
    startMs: number;
    endMs?: number;
    x: number;
    y: number;
  }[] = [];
  for (const role of ['before', 'after'] as const) {
    const x = role === 'before' ? PANE_A_X : PANE_B_X;
    const steps = presentation.steps.filter((s) => s.role === role);
    steps.forEach((step, index) =>
      labels.push({
        text: `STEP ${step.index} / ${steps.length}: ${step.title}${step.trigger ? ' [Trigger]' : ''}`,
        startMs: step.startMs,
        ...(steps[index + 1]
          ? { endMs: requireValue(steps[index + 1]).startMs }
          : {}),
        x,
        y: 496,
      }),
    );
    const outcome = presentation.outcomes.find((o) => o.role === role);
    if (outcome) {
      labels.push({
        text: `Expected: ${outcome.expected}`,
        startMs: 0,
        x,
        y: 526,
      });
      labels.push({
        text: `Observed: ${outcome.observed}`,
        startMs: outcome.atMs,
        x,
        y: 552,
      });
      labels.push({ text: outcome.label, startMs: outcome.atMs, x, y: 578 });
    }
  }
  return labels;
}
function scenarioOverlay(composition: CompareComposition): string {
  const labels = comparisonScenarioLabels(composition);
  if (!labels.length) return '[progress]null[proof]';
  return labels
    .map((label, index) => {
      const input = index ? `[proof${index - 1}]` : '[progress]';
      const output =
        index === labels.length - 1 ? '[proof]' : `[proof${index}]`;
      const enable =
        `gte(t,${label.startMs / 1000})` +
        (label.endMs === undefined ? '' : `*lt(t,${label.endMs / 1000})`);
      const text =
        label.text.length > 66 ? label.text.slice(0, 63) + '...' : label.text;
      return `${input}drawtext=font='${escapeDrawtext(burnInFont())}':text='${escapeDrawtext(text)}':x=${label.x}:y=${label.y}:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.75:enable='${enable}'${output}`;
    })
    .join(';');
}

function scaleToFrame(input: string, output: string): string {
  return (
    `${input}scale=${String(FRAME_W)}:${String(FRAME_H)}:` +
    `force_original_aspect_ratio=decrease,` +
    `pad=${String(FRAME_W)}:${String(FRAME_H)}:(ow-iw)/2:(oh-ih)/2:` +
    `color=0x101319,setsar=1${output}`
  );
}

function chromeOverlay(
  input: string,
  output: string,
  labels: {
    readonly bugId: string;
    readonly delta: string;
    readonly layout: string;
    readonly labelA: string;
    readonly labelB: string;
  },
): string {
  return [
    `${input}drawtext=font='${escapeDrawtext(burnInFont())}':text='${labels.layout} · ${labels.labelA} / ${labels.labelB}':` +
      `x=24:y=84:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.9[c0]`,
    `[c0]drawtext=font='${escapeDrawtext(burnInFont())}':text='${labels.bugId}':x=24:y=24:fontsize=20:fontcolor=white[c1]`,
    `[c1]null[c2]`,
    `[c2]drawtext=font='${escapeDrawtext(burnInFont())}':text='${labels.delta}':x=24:y=h-56:fontsize=16:fontcolor=white:` +
      `box=1:boxcolor=black@0.55[c3]`,
    `[c3]drawbox=x=24:y=h-12:w=iw-48:h=4:color=white@0.75:t=fill${output}`,
  ].join(';');
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

async function runFfmpeg(input: {
  readonly ffmpegPath: string;
  readonly args: readonly string[];
}): Promise<void> {
  await runProcess(input.ffmpegPath, input.args);
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
