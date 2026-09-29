import { overlayTheme, parseTimeline } from '@jitterbox/repro-contracts';

import type { BeatDraft, TimeRange } from './types.js';

import type {
  Beat,
  BeatKind,
  BeatBadge,
  BeatSource,
  Timeline,
} from '@jitterbox/repro-contracts';
export type {
  BeatKind,
  BeatSource,
  BeatBadge,
  BeatTransition,
  Beat,
  TimeMap,
  Timeline,
} from '@jitterbox/repro-contracts';

export interface CompileTimelineInput {
  readonly captureDurationMs: number;
  readonly drafts?: readonly BeatDraft[];
  readonly includeSlate?: boolean;
  readonly slateHoldMs?: number;
  readonly slateDissolveMs?: number;
  readonly outcomeHoldMs?: number;
  readonly targetDurationMs?: number;
}

const HOLDS = overlayTheme.holdsMs;
const DURATION = overlayTheme.duration;
const FPS = 30 as const;

/**
 * Compile a beat timeline BEFORE annotation planning.
 * Publishes a monotone timeMap; mapTime() is the only capture→output conversion.
 */
export function compileTimeline(input: CompileTimelineInput): Timeline {
  const warnings: string[] = [];
  const beats: Beat[] = [];
  const knots: [number, number][] = [];
  let outCursor = 0;

  const frameMs = 1000 / FPS;
  const slateHold =
    Math.round((input.slateHoldMs ?? HOLDS.slate.typical) / frameMs) * frameMs;
  const dissolveMs = Math.min(
    slateHold,
    Math.round(
      (input.slateDissolveMs ?? overlayTheme.motion.slateToContent.ms) /
        frameMs,
    ) * frameMs,
  );

  if (input.includeSlate !== false) {
    beats.push({
      id: 'slate',
      kind: 'insert',
      source: 'composited',
      assetRef: 'slate.png',
      rate: 1,
      outStartMs: 0,
      outDurationMs: slateHold,
      minOutDurationMs: HOLDS.slate.min,
      transitionOut: { kind: 'dissolve', ms: dissolveMs },
    });
    // The body begins when the dissolve begins, not after the slate ends.
    outCursor = slateHold - dissolveMs;
  }

  const drafts = input.drafts ?? [];
  const captureEnd = Math.max(0, input.captureDurationMs);
  const body = expandDrafts(drafts, captureEnd);

  for (const draft of body) {
    const beat = materializeBeat(draft, outCursor, warnings);
    beats.push(beat);
    appendKnots(knots, beat);
    outCursor = beat.outStartMs + beat.outDurationMs;
  }

  if (input.outcomeHoldMs !== undefined && input.outcomeHoldMs > 0) {
    // Hold the last in-range frame; captureEnd itself can sit past EOF.
    const at = Math.max(0, captureEnd - 1_000 / FPS);
    const holdMs = Math.max(HOLDS.outcome.min, input.outcomeHoldMs);
    const beat: Beat = {
      id: 'outcome-bed',
      kind: 'hold',
      source: 'capture',
      captureAtMs: at,
      rate: 1,
      outStartMs: outCursor,
      outDurationMs: holdMs,
      minOutDurationMs: HOLDS.outcome.min,
    };
    beats.push(beat);
    appendKnots(knots, beat, captureEnd);
    outCursor += holdMs;
  }

  const minTarget =
    input.targetDurationMs ??
    (input.outcomeHoldMs === undefined
      ? DURATION.hardMinMs
      : DURATION.filedReproMinMs);
  if (outCursor < minTarget) {
    const padMs = minTarget - outCursor;
    const last = beats[beats.length - 1];
    if (last?.kind === 'hold') {
      const extended: Beat = {
        ...last,
        outDurationMs: last.outDurationMs + padMs,
      };
      beats[beats.length - 1] = extended;
      // Last two knots are the hold; bump the end out-time.
      if (knots.length >= 2) {
        const [capture] = requireValue(knots[knots.length - 1]);
        knots[knots.length - 1] = [
          capture,
          extended.outStartMs + extended.outDurationMs,
        ];
      }
      warnings.push(
        `padded outcome hold by ${String(padMs)}ms to meet ` +
          `${String(minTarget)}ms target`,
      );
    } else {
      const at = Math.max(0, captureEnd - 1_000 / FPS);
      const pad: Beat = {
        id: 'duration-pad',
        kind: 'hold',
        source: 'capture',
        captureAtMs: at,
        rate: 1,
        outStartMs: outCursor,
        outDurationMs: padMs,
        minOutDurationMs: padMs,
        badge: 'FREEZE',
      };
      beats.push(pad);
      appendKnots(knots, pad, captureEnd);
      warnings.push(
        `padded ${String(padMs)}ms freeze to meet ${String(minTarget)}ms target`,
      );
    }
    outCursor = minTarget;
  }

  if (knots.length === 0) {
    knots.push([0, outCursor > 0 ? outCursor : 0]);
  }

  if (outCursor < DURATION.hardMinMs) {
    warnings.push(
      `duration ${String(outCursor)}ms below hardMin ${String(DURATION.hardMinMs)}ms`,
    );
  }
  if (outCursor > DURATION.hardMaxMs) {
    warnings.push(
      `duration ${String(outCursor)}ms above hardMax ${String(DURATION.hardMaxMs)}ms`,
    );
  }
  if (
    input.outcomeHoldMs !== undefined &&
    (outCursor < DURATION.filedReproMinMs ||
      outCursor > DURATION.filedReproMaxMs)
  ) {
    warnings.push(
      `filed repro duration ${String(outCursor)}ms outside ` +
        `${String(DURATION.filedReproMinMs)}-${String(DURATION.filedReproMaxMs)}ms`,
    );
  }

  return parseTimeline({
    schemaVersion: '1.0.0',
    fps: FPS,
    ...(input.targetDurationMs === undefined
      ? {}
      : { targetDurationMs: input.targetDurationMs }),
    beats,
    timeMap: { kind: 'piecewise-linear', knots },
    warnings,
  });
}

/** Map capture-time ms through the compiled timeMap to output-time ms. */
export function mapTime(timeline: Timeline, captureMs: number): number {
  const knots = timeline.timeMap.knots;
  if (knots.length === 0) {
    return captureMs;
  }

  if (captureMs <= requireValue(knots[0])[0]) {
    return requireValue(knots[0])[1];
  }

  for (let i = 1; i < knots.length; i += 1) {
    const [c0, o0] = requireValue(knots[i - 1]);
    const [c1, o1] = requireValue(knots[i]);

    if (captureMs <= c1 || i === knots.length - 1) {
      if (c1 === c0) {
        // Hold: capture frozen; prefer the later out time when past the hold start
        return captureMs >= c0 ? o1 : o0;
      }
      const t = (captureMs - c0) / (c1 - c0);
      return o0 + t * (o1 - o0);
    }
  }

  return requireValue(knots[knots.length - 1])[1];
}

export function mapTimeRange(timeline: Timeline, range: TimeRange): TimeRange {
  const start = mapTime(timeline, range.start);
  const end = Math.max(start, mapTime(timeline, range.end));
  return { start, end };
}

export function timelineDurationMs(timeline: Timeline): number {
  if (timeline.beats.length === 0) {
    return 0;
  }
  const last = requireValue(timeline.beats[timeline.beats.length - 1]);
  return last.outStartMs + last.outDurationMs;
}

interface InternalDraft {
  readonly id: string;
  readonly kind: BeatKind;
  readonly captureStartMs?: number;
  readonly captureEndMs?: number;
  readonly captureAtMs?: number;
  readonly rate: number;
  readonly minOutDurationMs?: number;
  readonly badge?: BeatBadge;
  readonly assetRef?: string;
  readonly source: BeatSource;
}

function expandDrafts(
  drafts: readonly BeatDraft[],
  captureEnd: number,
): readonly InternalDraft[] {
  if (drafts.length === 0) {
    return [
      {
        id: 'body',
        kind: 'play',
        source: 'capture',
        captureStartMs: 0,
        captureEndMs: Math.max(captureEnd, 1),
        rate: 1,
      },
    ];
  }

  const sorted = [...drafts].sort((a, b) => draftStart(a) - draftStart(b));
  const result: InternalDraft[] = [];
  let cursor = 0;

  for (const draft of sorted) {
    const start = draftStart(draft);
    if (start > cursor) {
      result.push({
        id: `play-${String(cursor)}`,
        kind: 'play',
        source: 'capture',
        captureStartMs: cursor,
        captureEndMs: start,
        rate: 1,
      });
    }

    if (draft.kind === 'hold' || draft.kind === 'pause') {
      const at = draft.captureAtMs ?? start;
      result.push({
        id: draft.id,
        kind: 'hold',
        source: 'capture',
        captureAtMs: at,
        rate: 1,
        minOutDurationMs: draft.minOutDurationMs ?? HOLDS.pause.typical,
        badge: draft.badge ?? 'PAUSED',
      });
      cursor = Math.max(cursor, at);
      continue;
    }

    if (draft.kind === 'slowmo') {
      const end = draft.captureEndMs ?? start + 400;
      const rate = draft.rate ?? 0.25;
      const captureDur = Math.max(1, end - start);
      const minOut = draft.minOutDurationMs ?? HOLDS.slowmo.typical;
      const stretchedRate = Math.min(rate, captureDur / minOut);
      result.push({
        id: draft.id,
        kind: 'play',
        source: 'capture',
        captureStartMs: start,
        captureEndMs: end,
        rate: stretchedRate,
        minOutDurationMs: minOut,
        badge: 'SLOWMO',
      });
      cursor = Math.max(cursor, end);
      continue;
    }

    if (draft.kind === 'insert') {
      result.push({
        id: draft.id,
        kind: 'insert',
        source: 'composited',
        rate: 1,
        ...(draft.assetRef === undefined ? {} : { assetRef: draft.assetRef }),
        ...(draft.minOutDurationMs === undefined
          ? {}
          : { minOutDurationMs: draft.minOutDurationMs }),
      });
      continue;
    }

    const end = draft.captureEndMs ?? start + 1;
    result.push({
      id: draft.id,
      kind: 'play',
      source: 'capture',
      captureStartMs: start,
      captureEndMs: end,
      rate: draft.rate ?? 1,
      ...(draft.minOutDurationMs === undefined
        ? {}
        : { minOutDurationMs: draft.minOutDurationMs }),
      ...(draft.badge === undefined ? {} : { badge: draft.badge }),
    });
    cursor = Math.max(cursor, end);
  }

  if (cursor < captureEnd) {
    result.push({
      id: `play-tail-${String(cursor)}`,
      kind: 'play',
      source: 'capture',
      captureStartMs: cursor,
      captureEndMs: captureEnd,
      rate: 1,
    });
  }

  return result;
}

function draftStart(draft: BeatDraft): number {
  if (draft.captureAtMs !== undefined) {
    return draft.captureAtMs;
  }
  if (draft.captureStartMs !== undefined) {
    return draft.captureStartMs;
  }
  return 0;
}

function materializeBeat(
  draft: InternalDraft,
  outStartMs: number,
  warnings: string[],
): Beat {
  if (draft.kind === 'hold') {
    const min = draft.minOutDurationMs ?? HOLDS.pause.typical;
    return {
      id: draft.id,
      kind: 'hold',
      source: draft.source,
      captureAtMs: draft.captureAtMs ?? 0,
      rate: 1,
      outStartMs,
      outDurationMs: min,
      minOutDurationMs: min,
      ...(draft.badge === undefined ? {} : { badge: draft.badge }),
    };
  }

  if (draft.kind === 'insert') {
    const dur = draft.minOutDurationMs ?? HOLDS.slate.typical;
    return {
      id: draft.id,
      kind: 'insert',
      source: 'composited',
      ...(draft.assetRef === undefined ? {} : { assetRef: draft.assetRef }),
      rate: 1,
      outStartMs,
      outDurationMs: dur,
      minOutDurationMs: dur,
    };
  }

  const start = draft.captureStartMs ?? 0;
  const end = draft.captureEndMs ?? start + 1;
  const captureDur = Math.max(1, end - start);
  let rate = draft.rate > 0 ? draft.rate : 1;
  let outDur = captureDur / rate;

  if (draft.minOutDurationMs !== undefined && outDur < draft.minOutDurationMs) {
    rate = captureDur / draft.minOutDurationMs;
    outDur = draft.minOutDurationMs;
    warnings.push(
      `stretched ${draft.id} rate to ${rate.toFixed(3)} to meet min hold`,
    );
  }

  return {
    id: draft.id,
    kind: 'play',
    source: 'capture',
    captureStartMs: start,
    captureEndMs: end,
    rate,
    outStartMs,
    outDurationMs: outDur,
    ...(draft.minOutDurationMs === undefined
      ? {}
      : { minOutDurationMs: draft.minOutDurationMs }),
    ...(draft.badge === undefined ? {} : { badge: draft.badge }),
  };
}

function appendKnots(
  knots: [number, number][],
  beat: Beat,
  holdBoundaryMs = beat.captureAtMs ?? 0,
): void {
  if (beat.kind === 'hold') {
    // Terminal holds begin at capture EOF, while their image is sampled from
    // the last in-range frame. Sampling that frame must not rewind the map.
    const at = holdBoundaryMs;
    knots.push([at, beat.outStartMs]);
    knots.push([at, beat.outStartMs + beat.outDurationMs]);
    return;
  }

  if (beat.kind === 'insert') {
    // Inserted cards do not advance capture time
    if (knots.length === 0) {
      knots.push([0, beat.outStartMs]);
    }
    const lastCapture = requireValue(knots[knots.length - 1])[0];
    knots.push([lastCapture, beat.outStartMs + beat.outDurationMs]);
    return;
  }

  const c0 = beat.captureStartMs ?? 0;
  const c1 = beat.captureEndMs ?? c0;
  knots.push([c0, beat.outStartMs]);
  knots.push([c1, beat.outStartMs + beat.outDurationMs]);
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
