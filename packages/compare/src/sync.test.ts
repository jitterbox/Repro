import { describe, expect, it } from 'vitest';

import { buildSyncMap } from './sync.js';

function signatures(values: readonly number[]): Float32Array[] {
  return values.map((value) => new Float32Array([value]));
}

describe('buildSyncMap', () => {
  it('builds anchored knots with low-confidence spans', () => {
    const sync = buildSyncMap({
      anchors: [
        { aMs: 0, bMs: 0, outMs: 0, stepId: 'start' },
        { aMs: 1000, bMs: 1200, outMs: 1100, stepId: 'end' },
      ],
      signatureA: signatures([0, 0.2, 0.4, 0.6, 0.8, 1]),
      signatureB: signatures([0, 0.9, 0.1, 0.8, 0.2, 1]),
      timesA: [0, 200, 400, 600, 800, 1000],
      timesB: [0, 240, 480, 720, 960, 1200],
    });

    expect(sync.strategy).toBe('anchored-dtw');
    expect(sync.knots.length).toBeGreaterThan(0);
    expect(sync.knots.some((knot) => knot[0] === 0 && knot[1] === 0)).toBe(true);
    expect(sync.knots.every((knot, index, all) =>
      index === 0 ? true : (all[index - 1]?.[2] ?? 0) <= knot[2],
    )).toBe(true);
  });

  it('uses sakoe-chiba band defaults and stretch cap metadata', () => {
    const sync = buildSyncMap({
      anchors: [{ aMs: 0, bMs: 0, stepId: 'only' }],
      bandRadiusMs: 250,
      maxStretch: 2.5,
      signatureA: signatures([0, 1, 0, 1]),
      signatureB: signatures([0, 1, 0, 1]),
      timesA: [0, 100, 200, 300],
      timesB: [0, 100, 200, 300],
    });

    expect(sync.anchors).toHaveLength(1);
    expect(sync.knots.length).toBeGreaterThan(0);
    expect(
      sync.lowConfidenceSpans.every((span) => span.confidence < 0.6),
    ).toBe(true);
  });

  it('handles empty anchors by syncing full timelines', () => {
    const sync = buildSyncMap({
      anchors: [],
      signatureA: signatures([0.1, 0.2, 0.3]),
      signatureB: signatures([0.1, 0.2, 0.3]),
      timesA: [0, 100, 200],
      timesB: [0, 100, 200],
    });

    expect(sync.knots.length).toBeGreaterThan(0);
    expect(sync.knots[0]?.[2]).toBeGreaterThanOrEqual(0);
  });
});
