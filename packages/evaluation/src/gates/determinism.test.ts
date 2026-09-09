import { expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { compareDecodedPng, checkDeterminism } from './determinism.js';
it('compares decoded pixels rather than filenames, size or metadata', () => {
  const image = new PNG({ width: 4, height: 4 });
  image.data.fill(255);
  const a = PNG.sync.write(image);
  image.data[0] = 0;
  image.data[1] = 0;
  image.data[2] = 0;
  const b = PNG.sync.write(image);
  expect(compareDecodedPng(a, a).changed).toBe(0);
  expect(compareDecodedPng(a, b).changed).toBe(1);
});
it('reports absent baselines as skipped, not a successful measurement', async () => {
  expect(await checkDeterminism({})).toMatchObject({
    pass: false,
    status: 'skipped',
  });
});
