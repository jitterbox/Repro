import { expect, it } from 'vitest';
import { artifactSlug } from './artifact-name.js';
it('keeps ticket IDs readable and makes freeform names safe on both supported OSes', () => {
  expect(artifactSlug('DASH2R-949')).toBe('DASH2R-949');
  expect(artifactSlug(' Metric overflow / iPhone: 393px ')).toBe(
    'Metric-overflow-iPhone-393px',
  );
  expect(artifactSlug('../../CON')).toBe('item-CON');
  expect(artifactSlug('...')).toBe('work-item');
  expect(artifactSlug('LPT1')).toBe('item-LPT1');
  const long = '指标'.repeat(80);
  expect(Buffer.byteLength(artifactSlug(long))).toBeLessThanOrEqual(72);
  expect(artifactSlug(long)).not.toBe(artifactSlug(long + 'x'));
});
