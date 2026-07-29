import { describe, expect, it } from 'vitest';

import { checkDuplicateLabels } from './duplicate-labels.js';

describe('duplicate-labels gate', () => {
  it('fails overlapping identical labels', () => {
    const result = checkDuplicateLabels({
      plan: {
        annotations: [
          {
            id: 'a',
            component: 'chapter',
            label: 'Inspect Save',
            outTimeRange: { start: 1000, end: 3000 },
          },
          {
            id: 'b',
            component: 'plate',
            label: 'inspect save',
            outTimeRange: { start: 2000, end: 4000 },
          },
        ],
      },
    });
    expect(result.pass).toBe(false);
  });

  it('passes non-overlapping duplicates', () => {
    const result = checkDuplicateLabels({
      plan: {
        annotations: [
          {
            id: 'a',
            component: 'plate',
            label: 'Same',
            outTimeRange: { start: 0, end: 1000 },
          },
          {
            id: 'b',
            component: 'plate',
            label: 'Same',
            outTimeRange: { start: 1000, end: 2000 },
          },
        ],
      },
    });
    expect(result.pass).toBe(true);
  });
});
