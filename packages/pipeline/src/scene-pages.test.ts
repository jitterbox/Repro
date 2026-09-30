import { expect, it } from 'vitest';
import { splitScenePages } from './scene-pages.js';

it('splits at recorded page cuts without changing retimed source instants', () => {
  const result = splitScenePages(
    [
      {
        id: 'replay',
        kind: 'play',
        sourceStartMs: 100,
        rate: 0.2,
        outStartMs: 2000,
        outDurationMs: 5000,
      },
    ],
    [
      { t_mono: 400, pageId: 'popup' },
      { t_mono: 900, pageId: 'main' },
    ],
    'main',
  );
  expect(
    result.map((s) => [
      s.pageId,
      s.sourceStartMs,
      s.outStartMs,
      s.outDurationMs,
    ]),
  ).toEqual([
    ['main', 100, 2000, 1500],
    ['popup', 400, 3500, 2500],
    ['main', 900, 6000, 1000],
  ]);
  expect(result.reduce((n, s) => n + s.outDurationMs, 0)).toBe(5000);
});
it('uses the last cut at a boundary and preserves checkpoint page identity', () => {
  const hold = {
    id: 'hold',
    kind: 'hold' as const,
    sourceStartMs: 500,
    rate: 0,
    outStartMs: 0,
    outDurationMs: 100,
    pageId: 'main',
  };
  expect(
    splitScenePages([hold], [{ t_mono: 500, pageId: 'popup' }], 'main'),
  ).toEqual([hold]);
  expect(
    splitScenePages(
      [
        {
          id: 'play',
          kind: 'play',
          sourceStartMs: 500,
          rate: 1,
          outStartMs: 0,
          outDurationMs: 100,
        },
      ],
      [{ t_mono: 500, pageId: 'popup' }],
      'main',
    )[0]?.pageId,
  ).toBe('popup');
});
