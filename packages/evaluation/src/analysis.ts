import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

interface Analysis {
  cache: Map<string, Promise<unknown>>;
  active: number;
  queue: (() => void)[];
  hits: number;
  misses: number;
}
const scope = new AsyncLocalStorage<Analysis>();

/** Invocation-local analysis: no pixels or promises survive a quality run. */
export async function withFrameAnalysis<T>(work: () => Promise<T>) {
  const context: Analysis = {
    cache: new Map(),
    active: 0,
    queue: [],
    hits: 0,
    misses: 0,
  };
  return scope.run(context, async () => {
    const result = await work();
    return {
      result,
      analysis: {
        cacheHits: context.hits,
        computations: context.misses,
        workers: 2,
      },
    };
  });
}

export async function imageIdentity(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

/** Bound expensive decoders and coalesce identical concurrent measurements. */
export async function sharedAnalysis<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const context = scope.getStore();
  if (!context) return work();
  const cached = context.cache.get(key);
  if (cached) {
    context.hits++;
    return cached as Promise<T>;
  }
  context.misses++;
  const pending = (async () => {
    if (context.active >= 2)
      await new Promise<void>((resolve) => context.queue.push(resolve));
    else context.active++;
    try {
      return await work();
    } finally {
      const next = context.queue.shift();
      if (next) next();
      else context.active--;
    }
  })();
  // Cap retained decoded results; eviction affects performance, never validity.
  if (context.cache.size >= 32) {
    const oldest = context.cache.keys().next().value;
    if (oldest !== undefined) context.cache.delete(oldest);
  }
  context.cache.set(key, pending);
  return pending;
}

export async function sharedFrame(
  key: string,
  output: string,
  work: () => Promise<void>,
): Promise<string> {
  const bytes = await sharedAnalysis(key, async () => {
    await work();
    return readFile(output);
  });
  await writeFile(output, bytes);
  return output;
}
