import { expect, it } from 'vitest';
import { mapBounded } from './workers.js';

it('bounds active work and returns input order', async () => {
  let active = 0,
    peak = 0;
  const result = await mapBounded([30, 10, 5, 1], 2, async (delay, index) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active--;
    return index;
  });
  expect(result).toEqual([0, 1, 2, 3]);
  expect(peak).toBe(2);
  expect(active).toBe(0);
});

it('drains active work and stops scheduling after failure', async () => {
  const started: number[] = [],
    finished: number[] = [];
  await expect(
    mapBounded([0, 1, 2, 3], 2, async (index) => {
      started.push(index);
      if (index === 0) throw new Error('worker failed');
      await new Promise((resolve) => setTimeout(resolve, 15));
      finished.push(index);
    }),
  ).rejects.toThrow('worker failed');
  expect(started).toEqual([0, 1]);
  expect(finished).toEqual([1]);
  await expect(mapBounded([], 0, () => Promise.resolve(1))).rejects.toThrow(
    'positive integer',
  );
});
