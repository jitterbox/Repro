import { fileURLToPath } from 'node:url';
import { runProcess } from '@jitterbox/repro-core';

/** Own the worker/browser process group even when invoked directly by the CLI. */
export async function runSceneWorker(request: string, signal?: AbortSignal) {
  const lifecycle = new AbortController();
  const abort = () => {
    lifecycle.abort();
  };
  signal?.addEventListener('abort', abort, { once: true });
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    if (signal?.aborted) lifecycle.abort();
    await runProcess(
      process.execPath,
      [fileURLToPath(new URL('./scene-worker.js', import.meta.url)), request],
      { signal: lifecycle.signal },
    );
  } finally {
    signal?.removeEventListener('abort', abort);
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}
