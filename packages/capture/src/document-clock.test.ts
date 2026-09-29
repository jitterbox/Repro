import { expect, it, vi } from 'vitest';
import { sampleDocumentClock } from '@jitterbox/repro-probe';
import { createPresidioLikeRedactor } from '@jitterbox/repro-core/redactor';

it('keeps document IDs stable through privacy redaction while masking actual sensitive text', () => {
  const redact = createPresidioLikeRedactor();
  expect(
    redact.redactText('627718557-4044508633-345080125-2960513499').hits.length,
  ).toBeGreaterThan(0);
  try {
    const ids = new Set<string>();
    // Exercise every byte without probabilistic detector collisions.
    for (let byte = 0; byte < 256; byte++) {
      vi.stubGlobal('window', {});
      vi.stubGlobal('crypto', {
        getRandomValues: (bytes: Uint8Array) => bytes.fill(byte),
      });
      const first = sampleDocumentClock();
      expect(first.documentId).toMatch(/^doc-[A-P]{32}$/);
      expect(sampleDocumentClock().documentId).toBe(first.documentId);
      ids.add(first.documentId);
      const result = redact.redactJson({
        documentId: first.documentId,
        email: 'private@example.com',
      });
      expect(result.value).toEqual({
        documentId: first.documentId,
        email: '[redacted]',
      });
    }
    expect(ids.size).toBe(256);
  } finally {
    vi.unstubAllGlobals();
  }
});
