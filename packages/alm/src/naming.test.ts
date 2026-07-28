import { describe, expect, it } from 'vitest';

import { evidenceFilename } from './naming.js';

describe('evidenceFilename', () => {
  it('uses double underscores, slug tokens, sha7, and basic UTC', () => {
    const name = evidenceFilename({
      env: 'QA East',
      issueId: 'BUG 123',
      recordedAt: '2026-07-27T23:51:09.000Z',
      sha: 'ABCDEF123456',
      slug: 'Button Fails Here',
    });

    expect(name).toBe(
      'BUG-123__button-fails-here__qa-east__abcdef1__20260727T235109Z.mp4',
    );
    expect(name).not.toContain(' ');
  });
});
