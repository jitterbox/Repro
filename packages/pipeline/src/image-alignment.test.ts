import { expect, it, vi } from 'vitest';
import type { Observation } from '@jitterbox/repro-contracts';
import { alignCheckpointImages } from './image-alignment.js';
// Synthetic similarity scores exercise correspondence rules; browser acceptance measures PNG pixels.
vi.mock('@jitterbox/repro-evaluation', () => ({
  compareDecodedPng: (a: Buffer, b: Buffer) => ({
    ratio: a[0] === b[0] ? 0 : 0.2,
  }),
}));
const image = (id: string, timeMs: number, color: number) => ({
  observation: {
    id,
    checkpoint: id,
    kind: 'screenshot',
    status: 'passed',
    pageId: 'page',
    timeMs,
  } as Observation,
  bytes: Buffer.from([color]),
});
it('requires unique reciprocal image matches and preserves semantic anchor ordering', () => {
  const a = [image('a', 100, 1), image('b', 200, 2)],
    b = [image('renamed-a', 150, 1), image('renamed-b', 300, 2)];
  expect(alignCheckpointImages(a, b, [])).toHaveLength(2);
  expect(
    alignCheckpointImages(a, [...b, image('ambiguous', 160, 1)], []).map(
      (p) => p.a.id,
    ),
  ).toEqual(['b']);
  expect(
    alignCheckpointImages(a, b, [{ aMs: 120, bMs: 130 }]).map((p) => p.a.id),
  ).toEqual(['b']);
  expect(
    alignCheckpointImages(
      a,
      [image('reordered-a', 300, 1), image('reordered-b', 150, 2)],
      [],
    ),
  ).toEqual([]);
});
