import { describe, expect, it } from 'vitest';

import { generateAss } from './ass.js';

import type { ReproPlan } from '@repro/plan';

describe('ASS generation', () => {
  it('generates dialogue events for boxes, labels, and chapters', () => {
    const script = generateAss({ plan: planFixture() });

    expect(script).toContain('[Script Info]');
    expect(script).toContain('PlayResX: 1280');
    expect(script).toContain('Dialogue:');
    expect(script).toContain('Click \\{Save\\}');
    expect(script).toContain('Chapter 1');
    expect(script).toContain('{\\pos(100,100)\\p1}');
  });
});

function planFixture(): ReproPlan {
  return {
    annotations: [
      {
        bounds: { height: 40, width: 160, x: 100, y: 100 },
        collisionPolicy: 'avoid',
        confidence: 1,
        feature: 'clickViz',
        id: 'annotation-1',
        kind: 'info',
        label: 'Click {Save}',
        placement: 'auto',
        priority: 10,
        severity: 'info',
        timeRange: { end: 1_200, start: 200 },
      },
    ],
    chapters: [
      {
        id: 'chapter-1',
        timeRange: { end: 2_000, start: 0 },
        title: 'Chapter 1',
      },
    ],
    metadata: { durationMs: 2_000, generatedAtEpoch: 1 },
    redactionRects: [],
    schemaVersion: 1,
    segments: [],
    viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
  };
}
