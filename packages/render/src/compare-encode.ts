import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

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
  await mkdir(input.outDir, { recursive: true });

  const composition = input.composition as CompareComposition;
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

  return { compositionPath, outputPath };
}

interface CompareFilterGraph {
  readonly filterComplex: string;
  readonly videoLabel: string;
}

function buildCompareFilterGraph(
  composition: CompareComposition,
): CompareFilterGraph {
  return {
    filterComplex: buildLayoutFilter(composition),
    videoLabel: '[v]',
  };
}

function buildLayoutFilter(composition: CompareComposition): string {
  const synced = syncPrep(composition);
  const labelA = escapeDrawtext(composition.panes.a.label);
  const labelB = escapeDrawtext(composition.panes.b.label);
  const bugId = escapeDrawtext(composition.bugId ?? 'COMPARE');
  const delta = escapeDrawtext(primaryDeltaCaption(composition));
  const step = escapeDrawtext(stepCounterLabel(composition));

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
        `[panes]drawtext=text='${labelA}':x=${String(PANE_A_X)}:y=84:` +
          `fontsize=18:fontcolor=white:box=1:boxcolor=0x5B6B8C@0.85[lA]`,
        `[lA]drawtext=text='${labelB}':x=${String(PANE_B_X)}:y=84:` +
          `fontsize=18:fontcolor=white:box=1:boxcolor=0x1B7F4A@0.85[lB]`,
        `[lB]drawtext=text='${bugId}':x=24:y=24:fontsize=20:fontcolor=0x2457D6[id]`,
        `[id]drawtext=text='${step}':x=w-220:y=24:fontsize=18:fontcolor=white:` +
          `box=1:boxcolor=black@0.55[step]`,
        `[step]drawtext=text='${delta}':x=24:y=h-56:fontsize=16:fontcolor=white:` +
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
          step,
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
          step,
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
          step,
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
          step,
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
          step,
        }),
      ].join(';');
    case 'cropped-roi': {
      const source = composition.croppedRoi?.rect;
      const rect = {
        x: source?.x ?? 400,
        y: source?.y ?? 200,
        w: source?.w ?? 160,
        h: source?.h ?? 80,
      };
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
          step,
        }),
      ].join(';');
    }
    default:
      return buildLayoutFilter({ ...composition, layout: 'side-by-side' });
  }
}

/**
 * Apply a coarse sync warp from first/last knots so both streams share
 * output duration. Full per-segment DTW concat is a follow-up.
 */
function syncPrep(composition: CompareComposition): {
  readonly a: string;
  readonly b: string;
} {
  const knots = composition.sync?.knots ?? [];
  const fps = composition.output.fps || 30;
  if (knots.length < 2) {
    return {
      a: `[0:v]fps=${String(fps)},settb=1/${String(fps)},setpts=PTS-STARTPTS[aSync]`,
      b: `[1:v]fps=${String(fps)},settb=1/${String(fps)},setpts=PTS-STARTPTS[bSync]`,
    };
  }

  const first = knots[0]!;
  const last = knots[knots.length - 1]!;
  const aSpan = Math.max(1, last[0] - first[0]);
  const bSpan = Math.max(1, last[1] - first[1]);
  const outSpan = Math.max(1, last[2] - first[2]);
  const aRate = outSpan / aSpan;
  const bRate = outSpan / bSpan;

  return {
    a:
      `[0:v]fps=${String(fps)},settb=1/${String(fps)},` +
      `setpts=${aRate.toFixed(6)}*(PTS-STARTPTS)[aSync]`,
    b:
      `[1:v]fps=${String(fps)},settb=1/${String(fps)},` +
      `setpts=${bRate.toFixed(6)}*(PTS-STARTPTS)[bSync]`,
  };
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

function stepCounterLabel(composition: CompareComposition): string {
  const anchors = composition.sync?.anchors ?? [];
  if (anchors.length === 0) {
    return 'STEP —';
  }
  return `STEP 1 / ${String(anchors.length)}`;
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
    readonly step: string;
  },
): string {
  return [
    `${input}drawtext=text='${labels.layout} · ${labels.labelA} / ${labels.labelB}':` +
      `x=24:y=84:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55[c0]`,
    `[c0]drawtext=text='${labels.bugId}':x=24:y=24:fontsize=20:fontcolor=0x2457D6[c1]`,
    `[c1]drawtext=text='${labels.step}':x=w-220:y=24:fontsize=18:fontcolor=white:` +
      `box=1:boxcolor=black@0.55[c2]`,
    `[c2]drawtext=text='${labels.delta}':x=24:y=h-56:fontsize=16:fontcolor=white:` +
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

function runFfmpeg(input: {
  readonly ffmpegPath: string;
  readonly args: readonly string[];
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.ffmpegPath, [...input.args]);
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
