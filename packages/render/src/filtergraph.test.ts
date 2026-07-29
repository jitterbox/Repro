import { describe, expect, it } from 'vitest';

import { buildFilterGraph } from './filtergraph.js';

import type { ReproPlan, Timeline } from '@repro/plan';

describe('filtergraph builder', () => {
  it('applies time surgery before ASS burn-in', () => {
    const graph = buildFilterGraph({
      assPath: '/tmp/overlay.ass',
      plan: planFixture(),
      progressBar: true,
      compositorOverlays: [{ streamIndex: 2, x: 10, y: 20 }],
      slateStreamIndex: 1,
    });

    expect(graph.filterComplex).toContain('fps=30');
    expect(graph.filterComplex).toContain('split=');
    expect(graph.filterComplex).toContain('concat=n=');
    expect(graph.filterComplex).toContain('loop=loop=');
    expect(graph.filterComplex).not.toContain('tpad=');
    expect(graph.filterComplex).toContain("ass='/tmp/overlay.ass'");
    expect(graph.filterComplex).toContain('xfade=transition=fade');
    expect(graph.filterComplex).toContain('[2:v]overlay=x=10:y=20');
    expect(graph.filterComplex).toContain('drawbox=x=0:y=ih-4');

    const fpsAt = graph.filterComplex.indexOf('fps=30');
    const assAt = graph.filterComplex.indexOf("ass='/tmp/overlay.ass'");
    const concatAt = graph.filterComplex.indexOf('concat=');
    expect(fpsAt).toBeLessThan(concatAt);
    expect(concatAt).toBeLessThan(assAt);
  });

  it('places pixel redaction before fps normalisation and ASS', () => {
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
      graph.filterComplex.indexOf('fps=30'),
    );
    expect(graph.filterComplex.indexOf('fps=30')).toBeLessThan(
      graph.filterComplex.indexOf("ass='/tmp/overlay.ass'"),
    );
  });
});

function planFixture(): ReproPlan {
  const timeline: Timeline = {
    schemaVersion: '1.0.0',
    fps: 30,
    beats: [
      {
        id: 'slate',
        kind: 'insert',
        source: 'composited',
        assetRef: 'slate.png',
        rate: 1,
        outStartMs: 0,
        outDurationMs: 2_200,
        transitionOut: { kind: 'dissolve', ms: 320 },
      },
      {
        id: 'play-0',
        kind: 'play',
        source: 'capture',
        captureStartMs: 0,
        captureEndMs: 1_000,
        rate: 1,
        outStartMs: 2_200,
        outDurationMs: 1_000,
      },
      {
        id: 'hold-0',
        kind: 'hold',
        source: 'capture',
        captureAtMs: 1_000,
        rate: 1,
        outStartMs: 3_200,
        outDurationMs: 1_400,
        badge: 'PAUSED',
      },
      {
        id: 'slow-0',
        kind: 'play',
        source: 'capture',
        captureStartMs: 1_000,
        captureEndMs: 1_400,
        rate: 0.25,
        outStartMs: 4_600,
        outDurationMs: 1_600,
        badge: 'SLOWMO',
      },
    ],
    timeMap: {
      kind: 'piecewise-linear',
      knots: [
        [0, 2_200],
        [1_000, 3_200],
        [1_000, 4_600],
        [1_400, 6_200],
      ],
    },
    warnings: [],
  };

  return {
    annotations: [],
    chapters: [],
    metadata: { durationMs: 6_200, generatedAtEpoch: 1 },
    redactionRects: [],
    schemaVersion: 1,
    segments: [],
    timeline,
    viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
  };
}
