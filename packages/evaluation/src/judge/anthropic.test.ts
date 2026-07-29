import { describe, expect, it } from 'vitest';

import { anthropicJudge } from './anthropic.js';

describe('anthropicJudge', () => {
  it('throws a clear error when apiKey is missing', () => {
    expect(() => anthropicJudge({ apiKey: '' })).toThrow(
      /requires a non-empty apiKey/i,
    );
  });
});
