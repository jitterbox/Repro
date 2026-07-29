import { describe, expect, it } from 'vitest';

import { checkDuration } from './duration.js';

describe('duration gate', () => {
  it('fails filed repro clips outside 15-30s', async () => {
    const result = await checkDuration({
      timeline: { targetDurationMs: 4000 },
      mode: 'repro',
    });

    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/outside hard bounds/i);
  });

  it('passes filed repro clips within 15-30s', async () => {
    const result = await checkDuration({
      timeline: { targetDurationMs: 22000 },
      mode: 'repro',
    });

    expect(result.pass).toBe(true);
  });

  it('allows demo mode inside hard bounds but outside filed range', async () => {
    const result = await checkDuration({
      timeline: { targetDurationMs: 12000 },
      mode: 'demo',
    });

    expect(result.pass).toBe(true);
  });
});
