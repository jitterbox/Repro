export function pipelineProblem(error: unknown) {
  const message = error instanceof Error ? error.message : 'Pipeline failed';
  const category = /abort/i.test(message)
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
