import { expect, it } from 'vitest';
import { alignSceneBeats, comparisonFrameMap } from './scene-compare.js';
import { magnifierRegion } from './scene-render.js';

it('holds the shorter pane without stretching its source clock, then aligns the next beat', () => {
  const a = [
    { id: 'action', startMs: 0, durationMs: 100 },
    { id: 'replay', startMs: 100, durationMs: 100 },
  ];
  const b = [
    { id: 'action', startMs: 0, durationMs: 200 },
    { id: 'replay', startMs: 200, durationMs: 100 },
  ];
  const frames = comparisonFrameMap(a, b);
  expect(frames[3]?.a).toEqual({ outputFrame: 2, held: true });
  expect(frames[3]?.b).toEqual({ outputFrame: 3, held: false });
  expect(frames[6]?.beat).toBe('replay');
  expect(frames[6]?.a).toEqual({ outputFrame: 3, held: false });
  expect(frames[6]?.b).toEqual({ outputFrame: 6, held: false });
});
it('rejects missing or reordered semantic comparison beats', () => {
  const a = [{ id: 'first', startMs: 0, durationMs: 100 }];
  expect(() => alignSceneBeats(a, [])).toThrow('matching ordered');
  expect(() =>
    alignSceneBeats(a, [{ id: 'other', startMs: 0, durationMs: 100 }]),
  ).toThrow('matching ordered');
});
it('keeps an exact 2x/4x crop within the captured viewport without stretching pixels', () => {
  const viewport = { width: 1280, height: 720 },
    target = { x: 1250, y: 710, width: 30, height: 10 };
  for (const factor of [2, 4]) {
    const crop = magnifierRegion(target, viewport, factor);
    expect(crop.width * factor).toBe(312);
    expect(crop.height * factor).toBe(176);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1280);
    expect(crop.y + crop.height).toBeLessThanOrEqual(720);
  }
});
