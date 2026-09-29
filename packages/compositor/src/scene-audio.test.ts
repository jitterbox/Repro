import { it, expect } from 'vitest';
import { parseScenePlan } from '@jitterbox/repro-contracts';
import { actionWave } from './scene-audio.js';
it('places optional action audio on output time with silence before the observed action', () => {
  const scene = parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: 393, height: 720 },
    output: { width: 802, height: 960, fps: 30 },
    sourceOrigin: { x: 24, y: 128 },
    segments: [
      {
        id: 'play',
        kind: 'play',
        outStartMs: 0,
        outDurationMs: 1000,
        sourceStartMs: 0,
        rate: 1,
      },
    ],
    cues: [
      {
        id: 'click',
        kind: 'pointer',
        startMs: 500,
        endMs: 850,
        layer: 50,
        title: 'Click',
        action: 'click',
      },
    ],
  });
  const audio = actionWave(scene);
  expect(audio.subarray(0, 4).toString()).toBe('RIFF');
  expect(audio.readUInt32LE(24)).toBe(24000);
  expect(audio.subarray(44, 24044).every((b) => b === 0)).toBe(true);
  expect(audio.subarray(24044, 26000).some((b) => b !== 0)).toBe(true);
  expect(actionWave(scene)).toEqual(audio);
});
