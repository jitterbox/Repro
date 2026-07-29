import { describe, expect, it } from 'vitest';

import {
  compileTimeline,
  mapTime,
  timelineDurationMs,
} from './timeline.js';

describe('compileTimeline', () => {
  it('prepends a slate beat and holds at the beat not the tail', () => {
    const timeline = compileTimeline({
      captureDurationMs: 5_000,
      drafts: [
        {
          id: 'pause-1',
          kind: 'hold',
          captureAtMs: 2_000,
          minOutDurationMs: 1_400,
          badge: 'PAUSED',
        },
      ],
      includeSlate: true,
    });

    expect(timeline.beats[0]?.id).toBe('slate');
    expect(timeline.beats[0]?.outDurationMs).toBeGreaterThanOrEqual(2_000);

    const hold = timeline.beats.find((beat) => beat.id === 'pause-1');
    expect(hold?.kind).toBe('hold');
    expect(hold?.outDurationMs).toBe(1_400);
    expect(hold?.outStartMs).toBeGreaterThan(2_000);

    // Hold is two knots sharing capture time
    const holdKnots = timeline.timeMap.knots.filter(
      ([capture]) => capture === 2_000,
    );
    expect(holdKnots.length).toBeGreaterThanOrEqual(2);
  });

  it('stretches slowmo until min hold is met', () => {
    const timeline = compileTimeline({
      captureDurationMs: 1_000,
      drafts: [
        {
          id: 'slow-1',
          kind: 'slowmo',
          captureStartMs: 0,
          captureEndMs: 200,
          rate: 0.25,
          minOutDurationMs: 1_200,
        },
      ],
      includeSlate: false,
    });

    const slow = timeline.beats.find((beat) => beat.id === 'slow-1');
    expect(slow?.outDurationMs).toBeGreaterThanOrEqual(1_200);
    expect(mapTime(timeline, 0)).toBe(0);
    expect(mapTime(timeline, 200)).toBeGreaterThanOrEqual(1_200);
  });

  it('pads filed repro timelines to 15s via outcome hold', () => {
    const timeline = compileTimeline({
      captureDurationMs: 2_000,
      drafts: [],
      includeSlate: true,
      outcomeHoldMs: 2_500,
    });

    expect(timelineDurationMs(timeline)).toBeGreaterThanOrEqual(15_000);
    const outcome = timeline.beats.find((beat) => beat.id === 'outcome-bed');
    expect(outcome?.outDurationMs).toBeGreaterThan(2_500);
    expect(
      timeline.warnings.some((warning) => warning.includes('padded')),
    ).toBe(true);
  });

  it('mapTime is monotone non-decreasing', () => {
    const timeline = compileTimeline({
      captureDurationMs: 4_000,
      drafts: [
        {
          id: 'pause-1',
          kind: 'hold',
          captureAtMs: 1_000,
          minOutDurationMs: 1_000,
        },
        {
          id: 'slow-1',
          kind: 'slowmo',
          captureStartMs: 2_000,
          captureEndMs: 2_400,
          rate: 0.25,
        },
      ],
      includeSlate: true,
    });

    let previous = -1;
    for (let capture = 0; capture <= 4_000; capture += 50) {
      const out = mapTime(timeline, capture);
      expect(out).toBeGreaterThanOrEqual(previous);
      previous = out;
    }

    expect(timelineDurationMs(timeline)).toBeGreaterThan(0);
  });
});
