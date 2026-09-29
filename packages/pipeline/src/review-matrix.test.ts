import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FeatureFlagsSchema } from '@jitterbox/repro-contracts/config';
import { bugStrategies } from './bug-strategies.js';
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../testdata/evaluation/review-matrix.json', import.meta.url),
    'utf8',
  ),
) as {
  features: Record<string, string[]>;
  strategies: Record<string, string>;
  exceptions: Record<string, string>;
};
it('requires balanced review cases for every feature and every strategy, including future additions', () => {
  expect(Object.keys(catalog.features).sort()).toEqual(
    [...FeatureFlagsSchema.keyof().options].sort(),
  );
  expect(Object.keys(catalog.strategies).sort()).toEqual(
    bugStrategies.map((s) => s.id).sort(),
  );
  for (const [feature, ids] of Object.entries(catalog.features))
    expect(new Set(ids).size).toBeGreaterThanOrEqual(
      catalog.exceptions[feature] ? 1 : 2,
    );
});
