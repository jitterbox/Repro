/** Self-contained so Playwright can serialize this function into each frame. */
export function sampleDocumentClock() {
  const scope = window as unknown as { __REPRO_DOCUMENT_ID__?: string };
  // Preserve 128 random bits using a letter-only alphabet. Decimal groups can
  // accidentally satisfy card/phone detectors and lose their correlation ID.
  scope.__REPRO_DOCUMENT_ID__ ??=
    'doc-' +
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      String.fromCharCode(65 + (byte >> 4), 65 + (byte & 15)),
    ).join('');
  return {
    documentId: scope.__REPRO_DOCUMENT_ID__,
    timeOrigin: performance.timeOrigin,
    now: performance.now(),
  };
}
