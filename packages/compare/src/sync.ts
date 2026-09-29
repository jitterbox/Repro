import { bandedDtw } from './dtw.js';

import type { DtwSample } from './dtw.js';

import type { SyncAnchor } from '@jitterbox/repro-contracts';
export type { SyncAnchor } from '@jitterbox/repro-contracts';

export interface SyncMap {
  readonly strategy: 'anchored-dtw';
  readonly anchors: readonly SyncAnchor[];
  readonly knots: readonly (readonly [number, number, number, number])[];
  readonly lowConfidenceSpans: readonly {
    readonly outStartMs: number;
    readonly outEndMs: number;
    readonly confidence: number;
  }[];
}

type Knot = [number, number, number, number];

const DEFAULT_BAND_RADIUS_MS = 250;
const DEFAULT_MAX_STRETCH = 2.5;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function buildSyncMap(input: {
  readonly anchors: readonly SyncAnchor[];
  readonly signatureA: readonly Float32Array[];
  readonly signatureB: readonly Float32Array[];
  readonly timesA: readonly number[];
  readonly timesB: readonly number[];
  readonly bandRadiusMs?: number;
  readonly maxStretch?: number;
  readonly outOffsetMs?: number;
}): SyncMap {
  const bandRadiusMs = input.bandRadiusMs ?? DEFAULT_BAND_RADIUS_MS;
  const maxStretch = input.maxStretch ?? DEFAULT_MAX_STRETCH;
  const outOffsetMs = input.outOffsetMs ?? 0;
  const anchors = sortAnchors(input.anchors);
  const bandRadius = indexBandForMs(input.timesA, bandRadiusMs);

  const knots: Knot[] = [];
  const segments = anchorSegments(anchors, input.timesA, input.timesB);

  for (const segment of segments) {
    const left = sliceSamples(
      input.timesA,
      input.signatureA,
      segment.aStart,
      segment.aEnd,
    );
    const right = sliceSamples(
      input.timesB,
      input.signatureB,
      segment.bStart,
      segment.bEnd,
    );

    if (left.length === 0 || right.length === 0) {
      knots.push([segment.aStart, segment.bStart, segment.outStart, 1]);
      continue;
    }

    const dtw = bandedDtw(left, right, {
      bandRadius,
      maxDistance: 1,
    });
    const outEnd = segment.outEnd;
    const spanA = segment.aEnd - segment.aStart || 1;
    const spanOut = outEnd - segment.outStart || 1;

    for (const point of dtw.path) {
      const leftSample = left[point.left];
      const rightSample = right[point.right];

      if (leftSample === undefined || rightSample === undefined) {
        continue;
      }

      const ratio = (leftSample.timeMs - segment.aStart) / spanA;
      knots.push([
        leftSample.timeMs,
        rightSample.timeMs,
        segment.outStart + ratio * spanOut,
        dtw.confidence,
      ]);
    }
  }

  for (const anchor of anchors) {
    knots.push([
      anchor.aMs,
      anchor.bMs,
      anchor.outMs ?? anchor.aMs + outOffsetMs,
      1,
    ]);
  }

  const deduped = dedupeKnots(knots);
  const normalized = enforceMonotoneAndStretch(deduped, maxStretch);

  return {
    anchors,
    knots: normalized,
    lowConfidenceSpans: findLowConfidenceSpans(normalized),
    strategy: 'anchored-dtw',
  };
}

interface AnchorSegment {
  readonly aStart: number;
  readonly aEnd: number;
  readonly bStart: number;
  readonly bEnd: number;
  readonly outStart: number;
  readonly outEnd: number;
}

function sortAnchors(anchors: readonly SyncAnchor[]): SyncAnchor[] {
  return [...anchors].sort((left, right) => left.aMs - right.aMs);
}

function anchorSegments(
  anchors: readonly SyncAnchor[],
  timesA: readonly number[],
  timesB: readonly number[],
): readonly AnchorSegment[] {
  const endA = timesA[timesA.length - 1] ?? 0;
  const endB = timesB[timesB.length - 1] ?? 0;

  if (anchors.length === 0) {
    return [
      {
        aEnd: endA,
        aStart: timesA[0] ?? 0,
        bEnd: endB,
        bStart: timesB[0] ?? 0,
        outEnd: endA,
        outStart: 0,
      },
    ];
  }

  const segments: AnchorSegment[] = [];
  const first = anchors[0];

  if (first !== undefined && first.aMs > (timesA[0] ?? 0)) {
    segments.push({
      aEnd: first.aMs,
      aStart: timesA[0] ?? 0,
      bEnd: first.bMs,
      bStart: timesB[0] ?? 0,
      outEnd: first.outMs ?? first.aMs,
      outStart: 0,
    });
  }

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const current = anchors[index];
    const next = anchors[index + 1];

    if (current === undefined || next === undefined) {
      continue;
    }

    segments.push({
      aEnd: next.aMs,
      aStart: current.aMs,
      bEnd: next.bMs,
      bStart: current.bMs,
      outEnd: next.outMs ?? next.aMs,
      outStart: current.outMs ?? current.aMs,
    });
  }

  const last = anchors[anchors.length - 1];

  if (last !== undefined) {
    segments.push({
      aEnd: endA,
      aStart: last.aMs,
      bEnd: endB,
      bStart: last.bMs,
      outEnd: endA,
      outStart: last.outMs ?? last.aMs,
    });
  }

  return segments;
}

function sliceSamples(
  times: readonly number[],
  signatures: readonly Float32Array[],
  startMs: number,
  endMs: number,
): readonly DtwSample[] {
  const samples: DtwSample[] = [];

  for (let index = 0; index < times.length; index += 1) {
    const timeMs = times[index];
    const signature = signatures[index];

    if (
      timeMs === undefined ||
      signature === undefined ||
      timeMs < startMs ||
      timeMs > endMs
    ) {
      continue;
    }

    samples.push({ timeMs, value: meanSignature(signature) });
  }

  return samples;
}

function meanSignature(signature: Float32Array): number {
  if (signature.length === 0) {
    return 0;
  }

  let total = 0;

  for (const value of signature) {
    total += value;
  }

  return total / signature.length;
}

function indexBandForMs(times: readonly number[], radiusMs: number): number {
  if (times.length < 2) {
    return 1;
  }

  const intervals: number[] = [];

  for (let index = 1; index < times.length; index += 1) {
    const current = times[index];
    const previous = times[index - 1];

    if (current !== undefined && previous !== undefined) {
      intervals.push(Math.max(1, current - previous));
    }
  }

  intervals.sort((left, right) => left - right);
  const median = intervals[Math.floor(intervals.length / 2)] ?? 33;

  return Math.max(1, Math.ceil(radiusMs / median));
}

function dedupeKnots(knots: readonly Knot[]): Knot[] {
  const seen = new Set<string>();
  const output: Knot[] = [];

  for (const knot of [...knots].sort((left, right) => left[0] - right[0])) {
    const key = knot.map((value) => value.toFixed(3)).join(':');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(knot);
  }

  return output;
}

function enforceMonotoneAndStretch(
  knots: readonly Knot[],
  maxStretch: number,
): Knot[] {
  if (knots.length === 0) {
    return [];
  }

  const sorted = [...knots].sort((left, right) => left[0] - right[0]);
  const output: Knot[] = [requireValue(sorted[0])];
  let previousOut = sorted[0]?.[2] ?? 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const knot = sorted[index];
    const previous = sorted[index - 1];

    if (knot === undefined || previous === undefined) {
      continue;
    }

    const [aMs, bMs, outMs, confidence] = knot;
    const [prevA, prevB] = previous;
    const deltaA = aMs - prevA || 1;
    const deltaB = bMs - prevB || 1;
    let adjustedOut = Math.max(outMs, previousOut);
    const deltaOut = adjustedOut - previousOut;

    if (Math.abs(deltaOut / deltaA) > maxStretch) {
      adjustedOut = previousOut + Math.sign(deltaOut) * deltaA * maxStretch;
    }

    if (Math.abs((adjustedOut - previousOut) / deltaB) > maxStretch) {
      adjustedOut = previousOut + Math.sign(deltaOut) * deltaB * maxStretch;
    }

    adjustedOut = Math.max(adjustedOut, previousOut);
    output.push([aMs, bMs, adjustedOut, confidence]);
    previousOut = adjustedOut;
  }

  return output;
}

function findLowConfidenceSpans(
  knots: readonly Knot[],
): SyncMap['lowConfidenceSpans'] {
  const spans: SyncMap['lowConfidenceSpans'][number][] = [];
  let spanStart: number | null = null;
  let minConfidence = 1;

  for (let index = 0; index < knots.length; index += 1) {
    const knot = knots[index];

    if (knot === undefined) {
      continue;
    }

    const [, , outMs, confidence] = knot;

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      spanStart ??= outMs;
      minConfidence = Math.min(minConfidence, confidence);
      continue;
    }

    if (spanStart !== null) {
      const previous = knots[index - 1];

      spans.push({
        confidence: minConfidence,
        outEndMs: previous?.[2] ?? outMs,
        outStartMs: spanStart,
      });
      spanStart = null;
      minConfidence = 1;
    }
  }

  const last = knots[knots.length - 1];

  if (spanStart !== null && last !== undefined) {
    spans.push({
      confidence: minConfidence,
      outEndMs: last[2],
      outStartMs: spanStart,
    });
  }

  return spans;
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
