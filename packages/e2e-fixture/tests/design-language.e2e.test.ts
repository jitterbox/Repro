import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluateCoverage } from '@repro/evaluation';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, '../../../.repro/fixture-videos');

describe('design-language coverage ledger', () => {
  it('requires ≥2 planned Overlay Kit instances and compare output files (not pixel verification)', async () => {
    const report = await evaluateCoverage({ fixtureRoot: FIXTURE_ROOT });
    const missingOverlay = report.overlay.filter((row) => !row.pass);
    const missingCompare = report.compare.filter((row) => !row.pass);

    if (!report.pass) {
      const overlayMsg = missingOverlay
        .map(
          (row) =>
            `${row.component}: ${String(row.found)}/${String(row.required)}`,
        )
        .join(', ');
      const compareMsg = missingCompare
        .map(
          (row) =>
            `${row.layout}: ${String(row.found)}/${String(row.required)}`,
        )
        .join(', ');
      expect.fail(
        `Coverage gaps — overlay: [${overlayMsg}]; compare: [${compareMsg}]`,
      );
    }

    expect(report.pass).toBe(true);
  }, 30_000);
});
