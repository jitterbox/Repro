import { runProcess } from '@repro/core';
import { watchServerSchema, type WatchServerOptions } from '@repro/contracts';
export { watchServerSchema, type WatchServerOptions } from '@repro/contracts';
import { watchScenario } from './watch.js';

/** One owned build/server process survives isolated Playwright scenario reruns. */
export async function startScenarioServer(
  options: WatchServerOptions,
  signal?: AbortSignal,
) {
  const config = watchServerSchema.parse(options),
    url = new URL(config.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Watch server readiness URL must be a loopback HTTP(S) URL',
    );
  const existing = await fetch(config.url, {
    signal: AbortSignal.timeout(500),
    redirect: 'manual',
  }).catch(() => undefined);
  await existing?.body?.cancel();
  if (existing)
    throw new Error(
      'Watch server URL is already serving; Repro will not adopt an unowned process',
    );
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  if (signal?.aborted) throw new Error('Watch server startup cancelled');
  signal?.addEventListener('abort', abort, { once: true });
  const state: { exited?: string } = {};
  const done = runProcess(config.command, config.args, {
    signal: controller.signal,
    ...(config.cwd ? { cwd: config.cwd } : {}),
  }).then(
    () => {
      state.exited = 'Watch server exited';
      return state.exited;
    },
    (error: unknown) => {
      state.exited = error instanceof Error ? error.message : String(error);
      return state.exited;
    },
  );
  const close = async () => {
    signal?.removeEventListener('abort', abort);
    controller.abort();
    await done;
  };
  try {
    const deadline = Date.now() + config.startupTimeoutMs;
    while (Date.now() <= deadline) {
      if (signal?.aborted) throw new Error('Watch server startup cancelled');
      if (state.exited) throw new Error(state.exited);
      const response = await fetch(config.url, {
        signal: AbortSignal.timeout(500),
        redirect: 'manual',
      }).catch(() => undefined);
      await response?.body?.cancel();
      if (response?.ok) return { close, done };
      if (Date.now() >= deadline)
        throw new Error('Watch server readiness timed out');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Watch server readiness timed out');
  } catch (error) {
    await close();
    throw error;
  }
}

export async function watchScenarioWithServer(
  options: Parameters<typeof watchScenario>[0],
  changed: Parameters<typeof watchScenario>[1],
  serverOptions?: WatchServerOptions,
) {
  if (!serverOptions) return watchScenario(options, changed);
  const server = await startScenarioServer(serverOptions, options.signal);
  let stop: ReturnType<typeof watchScenario>;
  try {
    stop = watchScenario(options, changed);
  } catch (error) {
    await server.close();
    throw error;
  }
  let closed = false;
  void server.done.then(async (message) => {
    if (closed) return;
    closed = true;
    await stop();
    changed({
      ok: false,
      runs: [],
      comparisons: [],
      incompleteAttempts: [],
      executionError: message,
      baseline: options.baseline ?? null,
    });
  });
  return async () => {
    if (closed) return;
    closed = true;
    await stop();
    await server.close();
  };
}
