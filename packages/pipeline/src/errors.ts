export function pipelineProblem(error: unknown) {
  if (
    error instanceof Error &&
    error.message.includes('Operation is locked by another writer')
  )
    return {
      ok: false,
      error: {
        category: 'busy',
        code: 'RUN_BUSY',
        message: error.message,
        nextAction:
          'Wait for the active command on this run to finish, then retry. Do not recapture.',
      },
    };
  // Never serialize raw OCR findings into a harness transcript.
  if (error instanceof Error && error.name === 'GateError') {
    const audit = error as Error & {
      code?: string;
      reportPath?: string;
      hits?: readonly unknown[];
      timings?: Record<string, number>;
    };
    return {
      ok: false,
      error: {
        category: 'audit-failed',
        message: audit.message,
        code: audit.code ?? 'OCR_AUDIT_UNAVAILABLE',
        hitCount: audit.hits?.length ?? 0,
        ...(audit.reportPath ? { reportPath: audit.reportPath } : {}),
        ...(audit.timings ? { timings: audit.timings } : {}),
        nextAction:
          'Open the private report and its review images. Correct measured privacy masks or investigate spatial OCR grouping, then rerender only if presentation inputs change and retry. Keep strict auditing enabled.',
      },
    };
  }
  const message = error instanceof Error ? error.message : 'Pipeline failed';
  const category = /abort|cancelled/i.test(message)
    ? 'cancelled'
    : /OCR|audit|Sensitive/.test(message)
      ? 'audit-failed'
      : /Corrupt|changed while|changed during/.test(message)
        ? 'artifact-corrupt'
        : /missing|incomplete/i.test(message)
          ? 'evidence-incomplete'
          : /unsupported|unavailable|ENOENT/i.test(message)
            ? 'unavailable'
            : message.includes('exited')
              ? 'process-failed'
              : 'invalid-input';
  return { ok: false, error: { category, message } };
}
