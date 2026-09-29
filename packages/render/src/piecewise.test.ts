import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCompareComposition } from '@jitterbox/repro-contracts';
import {
  piecewisePts,
  comparisonOutputTiming,
  comparisonCheckpointLabels,
} from './compare-encode.js';
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

it.each([4001.053, 4028.083, 4000, 3900])(
  'retains a cue at %s ms without showing it early',
  (atMs) => {
    const base = JSON.parse(
      readFileSync(
        new URL(
          '../../contracts/fixtures/compare-composition.valid.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const composition = parseCompareComposition({
      ...base,
      sync: {
        strategy: 'anchors-only',
        anchors: [{ stepId: 'result', aMs: atMs, bMs: atMs }],
        knots: [
          [0, 0, 0, 1],
          ...(atMs < 4028.083 ? [[atMs, atMs, atMs, 1]] : []),
          [4028.083, 4028.083, 4028.083, 1],
        ],
      },
    });
    const timing = comparisonOutputTiming(composition);
    expect(timing).toBeDefined();
    expect(timing?.frameCount).toBe(atMs > 4000 ? 122 : 121);
    expect(timing?.terminalPaddingFrames).toBe(atMs > 4000 ? 1 : 0);
    expect(comparisonCheckpointLabels(composition)[0]?.atMs).toBe(atMs);
  },
);
