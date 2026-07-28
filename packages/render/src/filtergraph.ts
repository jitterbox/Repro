import { composeRedactionFilter } from './compose-redaction.js';

import type { ReproPlan, Segment } from '@repro/plan';

export interface SkiaOverlayInput {
  readonly streamIndex: number;
  readonly x?: number;
  readonly y?: number;
  readonly enable?: string;
}

export interface BuildFilterGraphInput {
  readonly assPath: string;
  readonly plan: ReproPlan;
  readonly skiaOverlays?: readonly SkiaOverlayInput[];
  readonly progressBar?: boolean;
  readonly videoPreFilters?: readonly string[];
}

export interface FilterGraph {
  readonly filterComplex: string;
  readonly videoLabel: string;
}

export function buildFilterGraph(input: BuildFilterGraphInput): FilterGraph {
  const chains: string[] = [];
  let current = '[0:v]';
  let labelIndex = 0;

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

  const assLabel = label(labelIndex);
  labelIndex += 1;
  chains.push(`${current}ass=${quote(input.assPath)}${assLabel}`);
  current = assLabel;

  for (const overlay of input.skiaOverlays ?? []) {
    const next = label(labelIndex);
    labelIndex += 1;
    chains.push(overlayChain(current, overlay, next));
    current = next;
  }

  const timed = timingFilters(input.plan.segments);
  if (timed.length > 0) {
    const next = label(labelIndex);
    labelIndex += 1;
    chains.push(`${current}${timed.join(',')}${next}`);
    current = next;
  }

  if (input.progressBar === true) {
    const next = label(labelIndex);
    chains.push(`${current}${progressFilters(input.plan)}${next}`);
    current = next;
  }

  return {
    filterComplex: chains.join(';'),
    videoLabel: current,
  };
}

function overlayChain(
  current: string,
  overlay: SkiaOverlayInput,
  next: string,
): string {
  const x = overlay.x ?? 0;
  const y = overlay.y ?? 0;
  const enable = overlay.enable === undefined ? '' : `:enable='${overlay.enable}'`;
  return `${current}[${String(overlay.streamIndex)}:v]overlay=x=${String(x)}` +
    `:y=${String(y)}${enable}${next}`;
}

function timingFilters(segments: readonly Segment[]): readonly string[] {
  const filters: string[] = [];
  const pauseDuration = totalPauseSeconds(segments);
  const slowmo = segments.filter((segment) => segment.kind === 'slowmo');

  if (pauseDuration > 0) {
    filters.push(
      `tpad=stop_mode=clone:stop_duration=${String(pauseDuration)}`,
    );
  }

  if (slowmo.length > 0) {
    filters.push(`setpts='${slowmoExpression(slowmo)}'`);
  }

  return filters;
}

function progressFilters(plan: ReproPlan): string {
  const duration = Math.max(plan.metadata.durationMs / 1_000, 0.001);
  const width = `min(iw,iw*t/${String(duration)})`;
  const box = `drawbox=x=0:y=ih-8:w='${width}':h=8:color=white@0.75:t=fill`;
  const text = "drawtext=text='%{pts\\:hms}':x=16:y=h-42:fontsize=18";

  return `${box},${text}:fontcolor=white:box=1:boxcolor=black@0.35`;
}

function totalPauseSeconds(segments: readonly Segment[]): number {
  return segments
    .filter((segment) => segment.kind === 'pause')
    .reduce((sum, segment) => sum + durationSeconds(segment), 0);
}

function slowmoExpression(segments: readonly Segment[]): string {
  const offsets = segments.map((segment) => {
    const start = segment.timeRange.start / 1_000;
    const factor = Math.max(1, segment.factor);
    const extra = durationSeconds(segment) * (factor - 1);
    return `if(gte(T,${String(start)}),${String(extra)},0)`;
  });

  return `PTS+(${offsets.join('+')})/TB`;
}

function durationSeconds(segment: Segment): number {
  return Math.max(0, segment.timeRange.end - segment.timeRange.start) / 1_000;
}

function label(index: number): string {
  return `[v${String(index)}]`;
}

function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}
