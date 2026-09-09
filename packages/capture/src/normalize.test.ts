import { expect, it } from 'vitest';
import { editorialFrames } from './normalize.js';
it('preserves stationary intervals and popup cuts through recording end', () => {
  const frames = [
    { path: 'a', pageId: 'main', timeMs: 0 },
    { path: 'b', pageId: 'main', timeMs: 900 },
    { path: 'p', pageId: 'popup', timeMs: 1000 },
    { path: 'c', pageId: 'main', timeMs: 1200 },
  ];
  const result = editorialFrames(
    frames,
    [
      { pageId: 'popup', timeMs: 1000 },
      { pageId: 'main', timeMs: 1800 },
    ],
    2500,
  );
  expect(result[0]?.durationMs).toBe(900);
  expect(result.find((f) => f.timeMs === 1200)?.path).toBe('p');
  expect(result.at(-1)).toMatchObject({ path: 'c', durationMs: 700 });
});
