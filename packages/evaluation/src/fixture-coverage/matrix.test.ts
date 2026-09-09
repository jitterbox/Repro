import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluateCoverage, loadCoverageMatrix } from './matrix.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../..');

describe('design-language coverage matrix', () => {
  it('loads the canonical matrix', async () => {
    const matrix = await loadCoverageMatrix();
    expect(matrix.minInstances).toBe(2);
    expect(matrix.overlayKit.length).toBeGreaterThanOrEqual(15);
    expect(matrix.compareLayouts).toContain('side-by-side');
    expect(matrix.compareLayouts).toContain('onion');
  });

  it('evaluates fixture corpus without throwing', async () => {
    const report = await evaluateCoverage({
      fixtureRoot: join(REPO, '.repro/fixture-videos'),
    });
    expect(report.overlay.length).toBeGreaterThan(0);
    expect(report.compare.length).toBe(7);
  });
});
