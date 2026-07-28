import { describe, expect, it } from 'vitest';

import {
  ALM_DEFAULT_BUDGET_BYTES,
  ALM_HARD_CAP_BYTES,
  assertSizeBudget,
} from './http.js';

describe('ALM size budgets', () => {
  it('allows artifacts inside the default 40MB budget', () => {
    expect(() => {
      assertSizeBudget(ALM_DEFAULT_BUDGET_BYTES);
    }).not.toThrow();
  });

  it('rejects budgets above 40MB', () => {
    expect(() => {
      assertSizeBudget(1, { budgetBytes: ALM_DEFAULT_BUDGET_BYTES + 1 });
    }).toThrow(/40MB/u);
  });

  it('rejects artifacts above the 60MB hard cap', () => {
    expect(() => {
      assertSizeBudget(ALM_HARD_CAP_BYTES + 1, {
        budgetBytes: ALM_DEFAULT_BUDGET_BYTES,
      });
    }).toThrow(/60MB/u);
  });
});
