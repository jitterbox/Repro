import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '@repro/core';
import { describe, expect, it } from 'vitest';

import { buildFilterGraph } from './filtergraph.js';

import type { ReproPlan, Timeline } from '@repro/plan';

describe('filtergraph builder', () => {
  it('opens subtitle paths with spaces, quotes and filter delimiters', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repro-filter-'));
    // The absolute path includes a drive colon and backslashes on Windows.
    // A colon is also a legal filename character on Linux.
    const filename =
      process.platform === 'win32'
        ? "team's [review],draft;.ass"
        : "C:\\team's [review],draft;.ass";
    const assPath = join(directory, filename);
    try {
      await writeFile(
        assPath,
        `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Path verified
`,
      );
      const plan = planFixture();
      const graph = buildFilterGraph({
        assPath,
        plan,
        timeline: { ...plan.timeline, beats: [] },
      });
      await runProcess('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=black:s=1280x720:d=0.1',
        '-filter_complex',
        graph.filterComplex,
        '-map',
        graph.videoLabel,
        '-frames:v',
        '1',
        '-f',
        'null',
        '-',
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20000);

  it('retains pixel redaction without loading subtitles for a source-only frame', async () => {
    const plan = planFixture();
    const graph = buildFilterGraph({
      plan: {
        ...plan,
        redactionRects: [{ x: 0, y: 0, width: 1280, height: 720 }],
      },
      timeline: { ...plan.timeline, beats: [] },
    });
    expect(graph.filterComplex).not.toContain('ass=');
    const input = ['-v', 'error', '-f', 'lavfi', '-i'];
    const output = ['-frames:v', '1', '-pix_fmt', 'yuv420p', '-f', 'md5', '-'];
    const masked = await runProcess('ffmpeg', [
      ...input,
      'color=red:s=1280x720:d=0.1',
      '-filter_complex',
      graph.filterComplex,
      '-map',
      graph.videoLabel,
      ...output,
    ]);
    const black = await runProcess('ffmpeg', [
      ...input,
      'color=black:s=1280x720:d=0.1',
      ...output,
    ]);
    expect(masked.trim()).toBe(black.trim());
  }, 20000);

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
