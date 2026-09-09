import { describe, expect, it } from 'vitest';

import { generateAss } from './ass.js';

import type { ReproPlan, Timeline } from '@repro/plan';

describe('ASS generation', () => {
  it('uses legible explicit text sizes and omits animation fades for checkpoint images', () => {
    const fixture = planFixture();
    const source = fixture.annotations[0];
    if (!source) throw new Error('Missing annotation fixture');
    const plan = {
      ...fixture,
      chapters: [],
      annotations: [
        { ...source, component: 'step-badge' as const, fontSize: 32 },
      ],
    };
    const moving = generateAss({ plan });
    expect(moving).toContain('\\fs32');
    expect(moving).toContain('\\fad(');
    expect(generateAss({ plan, staticFrame: true })).not.toContain('\\fad(');
  });
  it('uses DejaVu Sans and severity-aware plate/ring styles', () => {
    const script = generateAss({ plan: planFixture() });

    expect(script).toContain('[Script Info]');
    expect(script).toContain('PlayResX: 1280');
    expect(script).toContain('DejaVu Sans');
    expect(script).toContain('Style: Plate');
    expect(script).toContain('Style: RingInfo');
    expect(script).toContain('Dialogue:');
    expect(script).toContain('Click \\{Save\\}');
    expect(script).toContain('Chapter 1');
    expect(script).toContain('\\fad(');
  });
});

function emptyTimeline(): Timeline {
  return {
    schemaVersion: '1.0.0',
    fps: 30,
    beats: [
      {
        id: 'body',
        kind: 'play',
        source: 'capture',
        captureStartMs: 0,
        captureEndMs: 2_000,
        rate: 1,
        outStartMs: 0,
        outDurationMs: 2_000,
      },
    ],
    timeMap: {
      kind: 'piecewise-linear',
      knots: [
        [0, 0],
        [2_000, 2_000],
      ],
    },
    warnings: [],
  };
}

function planFixture(): ReproPlan {
  return {
    annotations: [
      {
        bounds: { height: 40, width: 160, x: 100, y: 100 },
        collisionPolicy: 'avoid',
        component: 'plate',
        confidence: 1,
        feature: 'clickViz',
        id: 'annotation-1',
        kind: 'info',
        label: 'Click {Save}',
        placement: 'auto',
        plate: { kicker: 'CLICK', label: 'Click {Save}' },
        priority: 10,
        renderer: 'ass',
        severity: 'info',
        timeRange: { end: 1_200, start: 200 },
        outTimeRange: { end: 1_200, start: 200 },
        anchor: {
          bbox: { x: 200, y: 200, w: 40, h: 40 },
          pad: 6,
          track: 'static',
        },
      },
    ],
    chapters: [
      {
        id: 'chapter-1',
        timeRange: { end: 2_000, start: 0 },
        outTimeRange: { end: 2_000, start: 0 },
        title: 'Chapter 1',
      },
    ],
    metadata: { durationMs: 2_000, generatedAtEpoch: 1 },
    redactionRects: [],
    schemaVersion: 1,
    segments: [],
    timeline: emptyTimeline(),
    viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
  };
}
