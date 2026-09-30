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
it('keeps fractional comparison boundaries inside their semantic beat, including holds', () => {
  const a = [
    { id: 'first', startMs: 0, durationMs: 45 },
    { id: 'second', startMs: 45, durationMs: 80 },
  ];
  const b = [
    { id: 'first', startMs: 0, durationMs: 80 },
    { id: 'second', startMs: 80, durationMs: 120 },
  ];
  const frames = comparisonFrameMap(a, b);
  for (const f of frames) {
    const ai = a.find((beat) => beat.id === f.beat);
    const bi = b.find((beat) => beat.id === f.beat);
    if (!ai || !bi) throw new Error('Missing semantic beat');
    for (const [pane, beat] of [
      [f.a, ai],
      [f.b, bi],
    ] as const) {
      expect((pane.outputFrame * 1000) / 30).toBeGreaterThanOrEqual(
        beat.startMs,
      );
      expect((pane.outputFrame * 1000) / 30).toBeLessThan(
        beat.startMs + beat.durationMs,
      );
    }
  }
  expect(() =>
    comparisonFrameMap(
      [{ id: 'tiny', startMs: 1, durationMs: 1 }],
      [{ id: 'tiny', startMs: 1, durationMs: 1 }],
    ),
  ).toThrow('no output frame');
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

it('holds the last real frame when a generated tail lies between output samples', () => {
  const a = [
    { id: 'action', startMs: 0, durationMs: 105 },
    { id: 'tail', startMs: 105, durationMs: 1 },
  ];
  const b = [
    { id: 'action', startMs: 0, durationMs: 100 },
    { id: 'tail', startMs: 100, durationMs: 50 },
  ];
  const frames = comparisonFrameMap(a, b);
  expect(frames.at(-1)?.a).toEqual({
    outputFrame: 3,
    held: true,
    heldReason: 'tail-below-frame-resolution',
  });
  expect(frames.at(-1)?.b).toEqual({ outputFrame: 3, held: false });
  expect(() =>
    comparisonFrameMap(
      [{ id: 'tail', startMs: 1, durationMs: 1 }],
      [{ id: 'tail', startMs: 1, durationMs: 1 }],
    ),
  ).toThrow('no output frame');
});
