/** Preserve input order and drain active work before propagating a failure. */
export async function mapBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new RangeError('Worker concurrency must be a positive integer');
  const output = new Array<R>(items.length);
  let cursor = 0;
  const state: { failed: boolean; failure?: unknown } = { failed: false };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!state.failed && cursor < items.length) {
        const index = cursor++;
        try {
          output[index] = await work(items[index] as T, index);
        } catch (error) {
          state.failure ??= error;
          state.failed = true;
        }
      }
    }),
  );
  if (state.failed) throw state.failure;
  return output;
}
