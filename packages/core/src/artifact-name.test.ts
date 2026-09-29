import { expect, it } from 'vitest';
import { artifactSlug, artifactBaseName } from './artifact-name.js';
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

it('uses a supplied issue ID only when the naming policy permits it', () => {
  const issue = {
    workItem: 'DASH2R-949',
    description: 'Mobile metric overflow',
    scenarioId: 'metric-overflow',
  };
  expect(artifactBaseName(issue)).toBe('DASH2R-949');
  const descriptive = artifactBaseName({ ...issue, useWorkItemId: false });
  expect(descriptive).toMatch(/^Mobile-metric-overflow-[a-f0-9]{8}$/);
  expect(artifactBaseName({ ...issue, workItem: undefined })).toBe(descriptive);
  expect(
    artifactBaseName({
      ...issue,
      useWorkItemId: false,
      scenarioId: 'other-issue',
    }),
  ).not.toBe(descriptive);
});
