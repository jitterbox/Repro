import { expect, it } from 'vitest';
import { piecewisePts } from './compare-encode.js';
it('uses every synchronization knot rather than a global duration ratio', () => {
  const expression = piecewisePts(
    [
      [0, 0, 0, 1],
      [1000, 2000, 2000, 1],
      [3000, 3000, 4000, 1],
    ],
    0,
  );
  expect(expression).toContain('if(lt(');
  expect(expression).toContain('*2');
  expect(expression).toContain('*1');
});
