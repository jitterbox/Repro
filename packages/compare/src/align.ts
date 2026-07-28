export interface TimelineStep {
  readonly id: string;
  readonly label: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly animated?: boolean;
}

export interface WarpPoint {
  readonly sourceMs: number;
  readonly canonicalMs: number;
}

export interface StepAlignment {
  readonly kind: 'matched' | 'deleted' | 'inserted';
  readonly canonicalStartMs: number;
  readonly canonicalDurationMs: number;
  readonly stepA?: TimelineStep;
  readonly stepB?: TimelineStep;
  readonly warpA: readonly WarpPoint[];
  readonly warpB: readonly WarpPoint[];
}

export interface ResampleFrame<T> {
  readonly timeMs: number;
  readonly value: T;
}

export function alignSteps(
  stepsA: readonly TimelineStep[],
  stepsB: readonly TimelineStep[],
): readonly StepAlignment[] {
  const pairs = lcsPairs(stepsA, stepsB);
  const alignments: StepAlignment[] = [];
  let indexA = 0;
  let indexB = 0;
  let canonicalStartMs = 0;

  for (const pair of pairs) {
    canonicalStartMs = appendDeleted(alignments, stepsA, indexA, pair.a);
    indexA = pair.a;
    canonicalStartMs = appendInserted(alignments, stepsB, indexB, pair.b);
    indexB = pair.b;
    canonicalStartMs = appendMatch(
      alignments,
      stepsA[pair.a],
      stepsB[pair.b],
      canonicalStartMs,
    );
    indexA += 1;
    indexB += 1;
  }

  canonicalStartMs = appendDeleted(alignments, stepsA, indexA, stepsA.length);
  appendInserted(alignments, stepsB, indexB, stepsB.length, canonicalStartMs);

  return alignments;
}

export function piecewiseLinearWarp(
  points: readonly WarpPoint[],
  sourceMs: number,
): number {
  const first = points[0];
  const last = points[points.length - 1];

  if (first === undefined || last === undefined) {
    return sourceMs;
  }

  if (sourceMs <= first.sourceMs) {
    return first.canonicalMs;
  }

  if (sourceMs >= last.sourceMs) {
    return last.canonicalMs;
  }

  return interpolate(points, sourceMs);
}

export function zeroOrderHoldResample<T>(input: {
  readonly frames: readonly ResampleFrame<T>[];
  readonly sampleTimesMs: readonly number[];
}): readonly ResampleFrame<T>[] {
  const samples: ResampleFrame<T>[] = [];
  let frameIndex = 0;

  for (const timeMs of input.sampleTimesMs) {
    frameIndex = advanceFrame(input.frames, frameIndex, timeMs);
    const frame = input.frames[frameIndex];

    if (frame !== undefined) {
      samples.push({ timeMs, value: frame.value });
    }
  }

  return samples;
}

interface LcsPair {
  readonly a: number;
  readonly b: number;
}

function appendDeleted(
  output: StepAlignment[],
  steps: readonly TimelineStep[],
  start: number,
  end: number,
): number {
  let canonicalStartMs = endStart(output);

  for (let index = start; index < end; index += 1) {
    const step = steps[index];
    if (step === undefined) {
      continue;
    }

    output.push(singleSide('deleted', step, canonicalStartMs, 'A'));
    canonicalStartMs += step.durationMs;
  }

  return canonicalStartMs;
}

function appendInserted(
  output: StepAlignment[],
  steps: readonly TimelineStep[],
  start: number,
  end: number,
  canonicalStartMs = endStart(output),
): number {
  let nextStartMs = canonicalStartMs;

  for (let index = start; index < end; index += 1) {
    const step = steps[index];
    if (step === undefined) {
      continue;
    }

    output.push(singleSide('inserted', step, nextStartMs, 'B'));
    nextStartMs += step.durationMs;
  }

  return nextStartMs;
}

function appendMatch(
  output: StepAlignment[],
  stepA: TimelineStep | undefined,
  stepB: TimelineStep | undefined,
  canonicalStartMs: number,
): number {
  if (stepA === undefined || stepB === undefined) {
    return canonicalStartMs;
  }

  const duration = Math.max(stepA.durationMs, stepB.durationMs);
  output.push({
    canonicalDurationMs: duration,
    canonicalStartMs,
    kind: 'matched',
    stepA,
    stepB,
    warpA: warpFor(stepA, canonicalStartMs, duration),
    warpB: warpFor(stepB, canonicalStartMs, duration),
  });

  return canonicalStartMs + duration;
}

function singleSide(
  kind: 'deleted' | 'inserted',
  step: TimelineStep,
  canonicalStartMs: number,
  side: 'A' | 'B',
): StepAlignment {
  const duration = step.durationMs;
  const base = {
    canonicalDurationMs: duration,
    canonicalStartMs,
    kind,
    warpA: side === 'A' ? warpFor(step, canonicalStartMs, duration) : [],
    warpB: side === 'B' ? warpFor(step, canonicalStartMs, duration) : [],
  };

  return side === 'A' ? { ...base, stepA: step } : { ...base, stepB: step };
}

function warpFor(
  step: TimelineStep,
  canonicalStartMs: number,
  canonicalDurationMs: number,
): readonly WarpPoint[] {
  return [
    { canonicalMs: canonicalStartMs, sourceMs: step.startMs },
    {
      canonicalMs: canonicalStartMs + canonicalDurationMs,
      sourceMs: step.startMs + step.durationMs,
    },
  ];
}

function lcsPairs(
  stepsA: readonly TimelineStep[],
  stepsB: readonly TimelineStep[],
): readonly LcsPair[] {
  const dp = buildLcsTable(stepsA, stepsB);
  const pairs: LcsPair[] = [];
  let a = stepsA.length;
  let b = stepsB.length;

  while (a > 0 && b > 0) {
    if (sameStep(stepsA[a - 1], stepsB[b - 1])) {
      pairs.push({ a: a - 1, b: b - 1 });
      a -= 1;
      b -= 1;
      continue;
    }

    if (cell(dp, a - 1, b) >= cell(dp, a, b - 1)) {
      a -= 1;
      continue;
    }

    b -= 1;
  }

  return pairs.reverse();
}

function buildLcsTable(
  stepsA: readonly TimelineStep[],
  stepsB: readonly TimelineStep[],
): readonly (readonly number[])[] {
  const dp = Array.from({ length: stepsA.length + 1 }, () =>
    Array.from({ length: stepsB.length + 1 }, () => 0),
  );

  for (let a = 1; a <= stepsA.length; a += 1) {
    for (let b = 1; b <= stepsB.length; b += 1) {
      const row = dp[a];

      if (row !== undefined) {
        row[b] = lcsCell(stepsA, stepsB, dp, a, b);
      }
    }
  }

  return dp;
}

function lcsCell(
  stepsA: readonly TimelineStep[],
  stepsB: readonly TimelineStep[],
  dp: readonly (readonly number[])[],
  a: number,
  b: number,
): number {
  return sameStep(stepsA[a - 1], stepsB[b - 1])
    ? cell(dp, a - 1, b - 1) + 1
    : Math.max(cell(dp, a - 1, b), cell(dp, a, b - 1));
}

function sameStep(
  left: TimelineStep | undefined,
  right: TimelineStep | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    stepKey(left) === stepKey(right)
  );
}

function stepKey(step: TimelineStep): string {
  return step.id.trim() === '' ? step.label : step.id;
}

function interpolate(points: readonly WarpPoint[], sourceMs: number): number {
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    const left = points[index - 1];

    if (
      left === undefined ||
      right === undefined ||
      sourceMs > right.sourceMs
    ) {
      continue;
    }

    const span = right.sourceMs - left.sourceMs || 1;
    const ratio = (sourceMs - left.sourceMs) / span;
    return left.canonicalMs + ratio * (right.canonicalMs - left.canonicalMs);
  }

  return sourceMs;
}

function advanceFrame<T>(
  frames: readonly ResampleFrame<T>[],
  startIndex: number,
  timeMs: number,
): number {
  let index = startIndex;

  let next = frames[index + 1];

  while (next !== undefined && next.timeMs <= timeMs) {
    index += 1;
    next = frames[index + 1];
  }

  return index;
}

function cell(
  dp: readonly (readonly number[])[],
  a: number,
  b: number,
): number {
  return dp[a]?.[b] ?? 0;
}

function endStart(output: readonly StepAlignment[]): number {
  const last = output[output.length - 1];

  return last === undefined
    ? 0
    : last.canonicalStartMs + last.canonicalDurationMs;
}
