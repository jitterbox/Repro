import { describe, expect, it } from 'vitest';

import {
  alignSteps,
  piecewiseLinearWarp,
  zeroOrderHoldResample,
} from './align.js';

import type { TimelineStep } from './align.js';

describe('step alignment', () => {
  it('preserves unmatched steps and maxes matched durations', () => {
    const alignments = alignSteps(
      [step('open', 0, 100), step('save', 100, 200)],
      [step('open', 0, 150), step('toast', 150, 50)],
    );

    expect(alignments.map((item) => item.kind)).toEqual([
      'matched',
      'deleted',
      'inserted',
    ]);
    expect(alignments[0]?.canonicalDurationMs).toBe(150);
    expect(alignments[1]?.canonicalStartMs).toBe(150);
    expect(alignments[2]?.canonicalStartMs).toBe(350);
  });

  it('applies piecewise linear warp and zero-order-hold resample', () => {
    expect(
      piecewiseLinearWarp(
        [
          { canonicalMs: 0, sourceMs: 0 },
          { canonicalMs: 200, sourceMs: 100 },
        ],
        50,
      ),
    ).toBe(100);

    expect(
      zeroOrderHoldResample({
        frames: [
          { timeMs: 0, value: 'a' },
          { timeMs: 100, value: 'b' },
        ],
        sampleTimesMs: [0, 50, 120],
      }).map((sample) => sample.value),
    ).toEqual(['a', 'a', 'b']);
  });
});

function step(id: string, startMs: number, durationMs: number): TimelineStep {
  return { durationMs, id, label: id, startMs };
}
