import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertNoCanaryLeak,
  DEFAULT_CANARY_SECRET,
} from './canaries.js';
import { redactText } from './presidio.js';
import { enforceOcrAudit, GateError } from '../redaction.js';

describe('redaction canaries', () => {
  it('finds a planted secret in nested JSON', () => {
    const assertion = assertNoCanaryLeak({
      session: {
        events: [
          { message: 'safe' },
          { token: `visible ${DEFAULT_CANARY_SECRET}` },
        ],
      },
    });

    expect(assertion.ok).toBe(false);
    expect(assertion.leaks).toContainEqual({
      path: '$.session.events[1].token',
      value: `visible ${DEFAULT_CANARY_SECRET}`,
    });
  });

  it('removes email and SSN text', () => {
    const result = redactText(
      'Contact ada@example.com with SSN 123-45-6789',
    );

    expect(result.redacted).not.toContain('ada@example.com');
    expect(result.redacted).not.toContain('123-45-6789');
    expect(result.hits.map((hit) => hit.entity)).toEqual(['email', 'ssn']);
  });

  it('throws in strict mode when no OCR audit inputs exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repro-ocr-test-'));

    try {
      await expect(
        enforceOcrAudit({
          path: join(dir, 'rendered.mp4'),
          redaction: { masks: [], strict: true },
        }),
      ).rejects.toThrow(GateError);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
