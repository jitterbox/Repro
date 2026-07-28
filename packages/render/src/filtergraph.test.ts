import { describe, expect, it } from 'vitest';

import { buildFilterGraph } from './filtergraph.js';

import type { ReproPlan } from '@repro/plan';

describe('filtergraph builder', () => {
  it('builds ASS, PNG overlay, timing, and progress filters', () => {
    const graph = buildFilterGraph({
      assPath: '/tmp/overlay.ass',
      plan: planFixture(),
      progressBar: true,
      skiaOverlays: [{ streamIndex: 1, x: 10, y: 20 }],
    });

    expect(graph.filterComplex).toContain("ass='/tmp/overlay.ass'");
    expect(graph.filterComplex).toContain('[1:v]overlay=x=10:y=20');
    expect(graph.filterComplex).toContain('tpad=stop_mode=clone');
    expect(graph.filterComplex).toContain("setpts='PTS+");
    expect(graph.filterComplex).toContain('drawbox=x=0:y=ih-8');
    expect(graph.videoLabel).toMatch(/^\[v\d+\]$/u);
  });

  it('places pixel redaction before ASS overlay', () => {
    const graph = buildFilterGraph({
      assPath: '/tmp/overlay.ass',
      plan: {
        ...planFixture(),
        redactionRects: [{ height: 40, width: 120, x: 10, y: 20 }],
      },
    });

    expect(graph.filterComplex).toContain('color=c=black:s=1280x720');
    expect(graph.filterComplex).toContain('maskedmerge');
    expect(graph.filterComplex.indexOf('maskedmerge')).toBeLessThan(
      graph.filterComplex.indexOf("ass='/tmp/overlay.ass'"),
    );
  });
});

function planFixture(): ReproPlan {
  return {
    annotations: [],
    chapters: [],
    metadata: { durationMs: 5_000, generatedAtEpoch: 1 },
    redactionRects: [],
    schemaVersion: 1,
    segments: [
      {
        factor: 1,
        id: 'pause-1',
        kind: 'pause',
        timeRange: { end: 1_500, start: 1_000 },
      },
      {
        factor: 2,
        id: 'slow-1',
        kind: 'slowmo',
        timeRange: { end: 3_000, start: 2_000 },
      },
    ],
    viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
  };
}
