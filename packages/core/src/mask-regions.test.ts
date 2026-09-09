import { expect, it } from 'vitest';
import { motionMaskEnvelopes } from './mask-regions.js';
it('covers interpolated fractional positions while keeping independent selectors separate', () => {
  const samples = [
    { group: 'page/secret', x: 0.25, y: 20.5, width: 10, height: 5 },
    { group: 'page/secret', x: 100.75, y: 40.25, width: 20, height: 10 },
    { group: 'page/other', x: 500, y: 500, width: 10, height: 10 },
  ];
  expect(motionMaskEnvelopes(samples)).toEqual([
    { x: 0.25, y: 20.5, width: 120.5, height: 29.75 },
    { x: 500, y: 500, width: 10, height: 10 },
  ]);
  expect(() =>
    motionMaskEnvelopes([
      { group: 'invalid', x: 0, y: 0, width: NaN, height: 10 },
    ]),
  ).toThrow('Invalid');
});
