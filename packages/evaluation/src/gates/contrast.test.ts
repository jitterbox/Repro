import { describe, expect, it } from 'vitest';

import { checkContrast } from './contrast.js';

describe('contrast gate', () => {
  it('passes when no plates are planned', async () => {
    const result = await checkContrast({
      plan: { annotations: [] },
    });
    expect(result.pass).toBe(true);
    expect(
      (result.details as Record<string, unknown> | undefined)?.skipped,
    ).toBeUndefined();
  });

  it('fails closed when plates exist without video', async () => {
    const result = await checkContrast({
      plan: {
        annotations: [
          {
            id: 'p1',
            component: 'plate',
            bounds: { x: 10, y: 10, width: 100, height: 40 },
            outTimeRange: { start: 1000, end: 2000 },
          },
        ],
      },
    });
    expect(result.pass).toBe(false);
    expect(
      (result.details as Record<string, unknown> | undefined)?.skipped,
    ).toBeUndefined();
  });
});
