import { expect, it } from 'vitest';
import { parseScenePlan } from '@repro/contracts';
import { selectSceneFrame } from './scene-render.js';
it('selects preceding source pixels on the correct page and rejects missing history', () => {
  const plan = parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: 1280, height: 720 },
    output: { width: 1688, height: 864, fps: 30 },
    sourceOrigin: { x: 24, y: 96 },
    cues: [],
    segments: [
      {
        id: 'play',
        kind: 'play',
        outStartMs: 0,
        outDurationMs: 1000,
        sourceStartMs: 0,
        rate: 1,
        pageId: 'main',
      },
    ],
  });
  const sources = [
    { id: 'a', path: 'a.png', sha256: 'a', pageId: 'main', timeMs: 10 },
    { id: 'popup', path: 'b.png', sha256: 'b', pageId: 'popup', timeMs: 90 },
    { id: 'c', path: 'c.png', sha256: 'c', pageId: 'main', timeMs: 200 },
  ];
  expect(() => selectSceneFrame(plan, sources, 0)).toThrow('No source frame');
  expect(selectSceneFrame(plan, sources, 150)?.source.id).toBe('a');
  expect(selectSceneFrame(plan, sources, 200)?.source.id).toBe('c');
  for (const time of [800, 150, 200, 150])
    expect(selectSceneFrame(plan, sources, time)?.source.id).toBe(
      time >= 200 ? 'c' : 'a',
    );
});
it('holds the committed checkpoint even when a newer movie frame exists', () => {
  const plan = parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: 1280, height: 720 },
    output: { width: 1688, height: 864, fps: 30 },
    sourceOrigin: { x: 24, y: 96 },
    cues: [],
    segments: [
      {
        id: 'hold',
        kind: 'hold',
        outStartMs: 0,
        outDurationMs: 1000,
        sourceStartMs: 100,
        rate: 0,
        checkpoint: 'observed',
      },
    ],
  });
  const sources = [
    { id: 'movie', path: 'a.png', sha256: 'a', pageId: 'main', timeMs: 100 },
    {
      id: 'shot',
      checkpoint: 'observed',
      path: 'b.png',
      sha256: 'b',
      pageId: 'main',
      timeMs: 100,
    },
  ];
  expect(selectSceneFrame(plan, sources, 0)?.source.id).toBe('shot');
  expect(selectSceneFrame(plan, sources, 999)?.source.id).toBe('shot');
});
