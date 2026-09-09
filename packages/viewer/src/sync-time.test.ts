import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { mapComparisonTime } from './sync-time.js';
import type { SyncKnot } from './sync-time.js';

it('uses every knot across before, after and output time and clamps outside measured evidence', () => {
  const knots: SyncKnot[] = [
    [0, 0, 0, 1],
    [1000, 2000, 2000, 1],
    [3000, 3000, 4000, 1],
  ];
  expect(mapComparisonTime(500, knots, 0, 1)).toBe(1000);
  expect(mapComparisonTime(2000, knots, 0, 1)).toBe(2500);
  expect(mapComparisonTime(2000, knots, 0, 2)).toBe(3000);
  expect(mapComparisonTime(2500, knots, 1, 0)).toBe(2000);
  expect(mapComparisonTime(-100, knots, 0, 1)).toBe(0);
  expect(mapComparisonTime(4000, knots, 0, 1)).toBe(3000);
  expect(mapComparisonTime(500, [], 0, 1)).toBe(500);
  expect(mapComparisonTime(500, [[0, 0, 0, 1]], 0, 1)).toBe(500);
});

it('ships a portable timing module that resolves without workspace package imports', async () => {
  const script = await readFile(
    new URL('../dist/sync-time.js', import.meta.url),
    'utf8',
  );
  const portable = (await import(
    `data:text/javascript;base64,${Buffer.from(script).toString('base64')}`
  )) as { mapComparisonTime: typeof mapComparisonTime };
  expect(
    portable.mapComparisonTime(
      50,
      [
        [0, 0, 0, 1],
        [100, 300, 300, 1],
      ],
      0,
      1,
    ),
  ).toBe(150);
});
