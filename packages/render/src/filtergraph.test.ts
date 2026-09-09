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
    expect(graph.filterComplex).toContain('interleave=nb_inputs=');
    expect(graph.filterComplex).toContain('loop=loop=');
    // Quantization padding is bounded by each published segment's frame count.
    expect(graph.filterComplex).toContain('trim=end_frame=30');
    expect(graph.filterComplex).toContain('trim=end_frame=49');
    expect(graph.filterComplex).toContain("ass='/tmp/overlay.ass'");
    expect(graph.filterComplex).toContain('xfade=transition=fade');
    expect(graph.filterComplex).toContain('[2:v]overlay=x=10:y=20');
    expect(graph.filterComplex).toContain('drawbox=x=0:y=ih-4');

    const fpsAt = graph.filterComplex.indexOf('fps=30');
    const assAt = graph.filterComplex.indexOf("ass='/tmp/overlay.ass'");
    const mergeAt = graph.filterComplex.indexOf('interleave=');
    expect(fpsAt).toBeLessThan(mergeAt);
    expect(mergeAt).toBeLessThan(assAt);
  });

  it('places pixel redaction before fps normalisation and ASS', () => {
    const graph = buildFilterGraph({
      assPath: '/tmp/overlay.ass',
      plan: {
        ...planFixture(),
        redactionRects: [{ height: 40, width: 120, x: 10, y: 20 }],
      },
    });

    expect(graph.filterComplex).toContain('color=black@1:t=fill');
    expect(graph.filterComplex.indexOf('color=black@1:t=fill')).toBeLessThan(
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
