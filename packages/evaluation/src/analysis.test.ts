import { expect, it } from 'vitest';
import { sharedAnalysis, withFrameAnalysis } from './analysis.js';
it('coalesces concurrent decoded measurements and isolates independent quality runs', async () => {
  let calls = 0,
    active = 0,
    peak = 0;
  const work = async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return 7;
  };
  const output = await withFrameAnalysis(() =>
    Promise.all(
      ['a', 'a', 'b', 'c', 'c'].map((key) => sharedAnalysis(key, work)),
    ),
  );
  expect(output.result).toEqual([7, 7, 7, 7, 7]);
  expect(output.analysis.cacheHits).toBe(2);
  expect(calls).toBe(3);
  expect(peak).toBe(2);
  await withFrameAnalysis(() => sharedAnalysis('a', work));
  expect(calls).toBe(4);
});
