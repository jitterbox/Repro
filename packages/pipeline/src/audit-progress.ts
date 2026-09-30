/** Progress goes to stderr, keeping the CLI's final stdout JSON parseable. */
export function auditProgress() {
  let previous = -Infinity;
  return (value: { phase: string; completed: number; total: number }) => {
    if (!process.stderr.isTTY && process.env.REPRO_AUDIT_PROGRESS !== '1')
      return;
    const now = performance.now();
    if (now - previous < 2000 && value.completed !== value.total) return;
    previous = now;
    process.stderr.write(
      JSON.stringify({ event: 'audit-progress', ...value }) + '\n',
    );
  };
}
