import { composeRedactionFilter } from './compose-redaction.js';

import type { ReproPlan, Timeline } from '@repro/plan';

export interface CompositorOverlayInput {
  readonly streamIndex: number;
  readonly x?: number;
  readonly y?: number;
  readonly enable?: string;
  readonly width?: number;
  readonly height?: number;
}

/** @deprecated Use CompositorOverlayInput. */
export type SkiaOverlayInput = CompositorOverlayInput;

export interface BuildFilterGraphInput {
  readonly assPath: string;
  readonly plan: ReproPlan;
  readonly timeline?: Timeline;
  readonly slateStreamIndex?: number;
  readonly compositorOverlays?: readonly CompositorOverlayInput[];
  /** @deprecated Use compositorOverlays. */
  readonly skiaOverlays?: readonly CompositorOverlayInput[];
  readonly progressBar?: boolean;
  readonly videoPreFilters?: readonly string[];
  readonly fps?: number;
}

export interface FilterGraph {
  readonly filterComplex: string;
  readonly videoLabel: string;
}

/**
 * Corrected filter graph (spec §4):
 * redact → fps=30 → time surgery → slate xfade → ass → compositor → rail
 */
export function buildFilterGraph(input: BuildFilterGraphInput): FilterGraph {
  const chains: string[] = [];
  let current = '[0:v]';
  let labelIndex = 0;
  const fps = input.fps ?? input.timeline?.fps ?? input.plan.timeline.fps;
  const timeline = input.timeline ?? input.plan.timeline;

  const preFilters = input.videoPreFilters ?? [];
  if (preFilters.length > 0) {
    const next = label(labelIndex);
    labelIndex += 1;
    chains.push(`${current}${preFilters.join(',')}${next}`);
    current = next;
  }

  if (input.plan.redactionRects.length > 0) {
    const next = label(labelIndex);
    const mask = `[redact_mask${String(labelIndex)}]`;
    labelIndex += 1;
    const redaction = composeRedactionFilter({
      inputLabel: current,
      maskLabel: mask,
      outputLabel: next,
      plan: input.plan,
    });
    chains.push(redaction.filter);
    current = next;
  }

  // Normalise VFR → CFR before any trim/concat
  {
    const next = label(labelIndex);
    labelIndex += 1;
    chains.push(`${current}fps=${String(fps)}${next}`);
    current = next;
  }

  const timed = buildTimeSurgery(current, timeline, fps, labelIndex);
  chains.push(...timed.chains);
  current = timed.output;
  labelIndex = timed.nextLabelIndex;

  if (input.slateStreamIndex !== undefined) {
    const slateBeat = timeline.beats.find((beat) => beat.id === 'slate');
    const holdMs = slateBeat?.outDurationMs ?? 2_200;
    const dissolveMs = slateBeat?.transitionOut?.ms ?? 320;
    const holdFrames = Math.max(1, Math.round((holdMs / 1_000) * fps));
    const offset = Math.max(0, (holdMs - dissolveMs) / 1_000);
    const width = input.plan.viewport.width;
    const height = input.plan.viewport.height;
    const slateRaw = `[slateRaw${String(labelIndex)}]`;
    const slateLabel = `[slate${String(labelIndex)}]`;
    const bodyTimed = `[bodyTimed${String(labelIndex)}]`;
    const next = label(labelIndex);
    labelIndex += 1;
    // Match size + CFR timebase on both xfade inputs (PNG stills differ).
    chains.push(
      `[${String(input.slateStreamIndex)}:v]scale=${String(width)}:` +
        `${String(height)},format=yuva420p,fps=${String(fps)},` +
        `trim=end_frame=1,loop=loop=${String(holdFrames - 1)}:size=1,` +
        `setpts=N/${String(fps)}/TB${slateRaw}`,
    );
    chains.push(`${slateRaw}settb=1/${String(fps)}${slateLabel}`);
    chains.push(
      `${current}fps=${String(fps)},settb=1/${String(fps)},` +
        `setpts=PTS-STARTPTS${bodyTimed}`,
    );
    chains.push(
      `${slateLabel}${bodyTimed}xfade=transition=fade:duration=` +
        `${String(dissolveMs / 1_000)}:offset=${String(offset)}${next}`,
    );
    current = next;
  }

  const assLabel = label(labelIndex);
  labelIndex += 1;
  chains.push(`${current}ass=${quote(input.assPath)}${assLabel}`);
  current = assLabel;

  const overlays = [
    ...(input.compositorOverlays ?? []),
    ...(input.skiaOverlays ?? []),
  ];
  for (const overlay of overlays) {
    const next = label(labelIndex);
    labelIndex += 1;
    chains.push(overlayChain(current, overlay, next));
    current = next;
  }

  if (input.progressBar === true || hasProgressRail(input.plan)) {
    const next = label(labelIndex);
    chains.push(`${current}${progressFilters(input.plan, timeline)}${next}`);
    current = next;
  }

  return {
    filterComplex: chains.join(';'),
    videoLabel: current,
  };
}

function buildTimeSurgery(
  inputLabel: string,
  timeline: Timeline,
  fps: number,
  startLabelIndex: number,
): {
  readonly chains: readonly string[];
  readonly output: string;
  readonly nextLabelIndex: number;
} {
  const captureBeats = timeline.beats.filter(
    (beat) =>
      beat.source === 'capture' &&
      beat.kind !== 'insert' &&
      outputFrames(beat.outStartMs, beat.outDurationMs, fps) > 0,
  );

  if (captureBeats.length === 0) {
    return {
      chains: [],
      output: inputLabel,
      nextLabelIndex: startLabelIndex,
    };
  }

  const chains: string[] = [];
  let labelIndex = startLabelIndex;
  const splitCount = captureBeats.length;
  const splitOuts = Array.from(
    { length: splitCount },
    (_, i) => `[s${String(labelIndex)}_${String(i)}]`,
  );
  chains.push(`${inputLabel}split=${String(splitCount)}${splitOuts.join('')}`);

  const bodyLabels: string[] = [];
  for (let i = 0; i < captureBeats.length; i += 1) {
    const beat = requireValue(captureBeats[i]);
    const src = requireValue(splitOuts[i]);
    const out = `[b${String(labelIndex)}_${String(i)}]`;
    bodyLabels.push(out);
    // Quantize absolute boundaries, not each duration independently. Otherwise
    // sub-frame rounding accumulates across long sequences of reading holds.
    const frames = outputFrames(beat.outStartMs, beat.outDurationMs, fps);
    // Supply one terminal frame to establish the last frame's end time. The
    // final CFR trim removes this sentinel, including before slate transitions.
    const segmentFrames = frames + (i === captureBeats.length - 1 ? 1 : 0);
    const firstBeat = requireValue(captureBeats[0]);
    const firstFrame =
      Math.round((beat.outStartMs * fps) / 1000) -
      Math.round((firstBeat.outStartMs * fps) / 1000);
    const presentationPts = `setpts=(N+${String(firstFrame)})/${String(fps)}/TB`;

    if (beat.kind === 'hold') {
      const at = Math.floor(((beat.captureAtMs ?? 0) / 1_000) * fps);
      chains.push(
        `${src}trim=start_frame=${String(at)}:end_frame=${String(at + 1)},setpts=PTS-STARTPTS,` +
          `trim=end_frame=1,loop=loop=${String(segmentFrames - 1)}:size=1,` +
          `${presentationPts}${out}`,
      );
      continue;
    }

    const start = (beat.captureStartMs ?? 0) / 1_000;
    const end = (beat.captureEndMs ?? beat.captureStartMs ?? 0) / 1_000;
    const rate = beat.rate > 0 ? beat.rate : 1;
    // CFR sampling and one source-frame of tail padding cover quantization at
    // either trim edge (also after slow motion). Bound every segment to its
    // published frame interval before concatenation.
    chains.push(
      `${src}trim=start_frame=${String(Math.floor(start * fps))}:end_frame=${String(Math.max(Math.floor(start * fps) + 1, Math.ceil(end * fps)))},` +
        `setpts=${String(1 / rate)}*(PTS-STARTPTS),` +
        `tpad=stop_mode=clone:stop_duration=${String(2 / fps / Math.min(1, rate))},` +
        `fps=${String(fps)},trim=end_frame=${String(segmentFrames)},${presentationPts}${out}`,
    );
  }

  const concatOut = label(labelIndex);
  labelIndex += 1;
  const lastBeat = requireValue(captureBeats.at(-1));
  const bodyFrames =
    Math.round(((lastBeat.outStartMs + lastBeat.outDurationMs) * fps) / 1000) -
    Math.round((requireValue(captureBeats[0]).outStartMs * fps) / 1000);
  chains.push(
    // concat estimates a zero duration for a one-frame video segment. Merge
    // explicitly timestamped segments instead, retaining every output frame.
    `${bodyLabels.join('')}interleave=nb_inputs=${String(bodyLabels.length)}:duration=longest,fps=${String(fps)},trim=end_frame=${String(bodyFrames)},settb=1/${String(fps)}` +
      concatOut,
  );

  return {
    chains,
    output: concatOut,
    nextLabelIndex: labelIndex,
  };
}

function outputFrames(
  startMs: number,
  durationMs: number,
  fps: number,
): number {
  return (
    Math.round(((startMs + durationMs) / 1000) * fps) -
    Math.round((startMs / 1000) * fps)
  );
}

function hasProgressRail(plan: ReproPlan): boolean {
  return plan.annotations.some(
    (annotation) => annotation.component === 'progress-rail',
  );
}

function overlayChain(
  current: string,
  overlay: CompositorOverlayInput,
  next: string,
): string {
  const x = overlay.x ?? 0;
  const y = overlay.y ?? 0;
  const enable =
    overlay.enable === undefined ? '' : `:enable='${overlay.enable}'`;
  const source = `[${String(overlay.streamIndex)}:v]`;
  const scaled = `[overlayScaled${String(overlay.streamIndex)}]`;
  const resize =
    overlay.width !== undefined && overlay.height !== undefined
      ? `${source}scale=${String(overlay.width)}:${String(overlay.height)},setsar=1${scaled};`
      : '';
  return (
    resize +
    `${current}${resize ? scaled : source}overlay=x=${String(x)}` +
    `:y=${String(y)}${enable}${next}`
  );
}

function progressFilters(plan: ReproPlan, timeline: Timeline): string {
  const duration = Math.max(timelineDurationSeconds(timeline, plan), 0.001);
  const width = `min(iw,iw*t/${String(duration)})`;
  const box = `drawbox=x=0:y=ih-4:w='${width}':h=4:color=white@0.75:t=fill`;
  return box;
}

function timelineDurationSeconds(timeline: Timeline, plan: ReproPlan): number {
  if (timeline.beats.length > 0) {
    const last = requireValue(timeline.beats[timeline.beats.length - 1]);
    return (last.outStartMs + last.outDurationMs) / 1_000;
  }
  return plan.metadata.durationMs / 1_000;
}

function label(index: number): string {
  return `[v${String(index)}]`;
}

function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
