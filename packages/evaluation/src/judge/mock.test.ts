import { describe, expect, it } from 'vitest';

import { mockJudge } from './mock.js';

describe('mockJudge', () => {
  it('returns the configured verdict', async () => {
    const judge = mockJudge({
      pass: false,
      score: 0.2,
      summary: 'Overlays missing',
      findings: [{ message: 'No callouts visible', confidence: 0.9 }],
    });

    const verdict = await judge.assess({ videoPath: '/tmp/sample.mp4' });

    expect(verdict.pass).toBe(false);
    expect(verdict.summary).toBe('Overlays missing');
    expect(verdict.findings).toHaveLength(1);
  });
});
