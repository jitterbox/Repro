import type { CompareComposition } from './comparison.js';
export type SyncKnot = CompareComposition['sync']['knots'][number];

/** Browser-safe and self-contained: also embedded in the local review shell. */
export function mapComparisonTime(
  sourceMs: number,
  knots: readonly SyncKnot[],
  from: 0 | 1 | 2,
  to: 0 | 1 | 2,
): number {
  if (from === to || knots.length < 2) return sourceMs;
  const sorted = [...knots].sort((a, b) => a[from] - b[from]);
  const first = sorted[0],
    last = sorted.at(-1);
  if (!first || !last) return sourceMs;
  if (sourceMs <= first[from]) return first[to];
  if (sourceMs >= last[from]) return last[to];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1],
      b = sorted[i];
    if (!a || !b || sourceMs > b[from]) continue;
    const span = b[from] - a[from];
    return span <= 0
      ? b[to]
      : a[to] + ((sourceMs - a[from]) / span) * (b[to] - a[to]);
  }
  return sourceMs;
}
