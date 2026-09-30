import { expect, it } from 'vitest';
import { parseScenePlan } from '@jitterbox/repro-contracts';
import { sceneCaptions } from './scene-captions.js';
it('uses output-time cue intervals and escapes text without inventing narration', () => {
  const scene = parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: 1280, height: 720 },
    output: { width: 1688, height: 960, fps: 30 },
    sourceOrigin: { x: 24, y: 96 },
    segments: [
      {
        id: 'hold',
        kind: 'hold',
        outStartMs: 0,
        outDurationMs: 5000,
        sourceStartMs: 100,
        rate: 0,
      },
    ],
    cues: [
      {
        id: 's',
        kind: 'step',
        layer: 50,
        startMs: 200,
        endMs: 4200,
        title: 'Inspect <result>',
        detail: 'A & B',
      },
      {
        id: 'private',
        kind: 'data-panel',
        layer: 50,
        startMs: 0,
        endMs: 5000,
        title: 'Diagnostic values',
      },
    ],
  });
  expect(sceneCaptions(scene, { s: 3000 })).toContain(
    '00:00:00.200 --> 00:00:03.000',
  );
  expect(sceneCaptions(scene)).toBe(
    'WEBVTT\n\n1\n00:00:00.200 --> 00:00:04.200\nInspect &lt;result&gt;\nA &amp; B\n',
  );
});
