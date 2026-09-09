import { watch } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { runScenario } from './execute.js';
import type { RunOptions } from './execute.js';
/** Coalesces edits, cancels superseded executions, and keeps runs serial. */
export function watchScenario(
  options: RunOptions,
  changed: (result: Awaited<ReturnType<typeof runScenario>>) => void,
  directory = process.cwd(),
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let pending = Promise.resolve();
  let closed = false;
  const isClosed = () => closed;
  let running = false;
  let revision = 0;
  const run = () => {
    revision++;
    controller?.abort();
    if (running) return;
    running = true;
    pending = (async () => {
      let completedRevision = -1;
      while (!closed && completedRevision !== revision) {
        const executingRevision = revision;
        controller = new AbortController();
        let result: Awaited<ReturnType<typeof runScenario>>;
        try {
          result = await runScenario({ ...options, signal: controller.signal });
        } catch (error) {
          result = {
            ok: false,
            runs: [],
            comparisons: [],
            incompleteAttempts: [],
            executionError:
              error instanceof Error ? error.message : String(error),
            baseline: options.baseline ?? null,
          };
        }
        completedRevision = executingRevision;
        if (!isClosed() && executingRevision === revision) changed(result);
      }
    })().finally(() => {
      running = false;
    });
  };
  const watcher = watch(directory, { recursive: true }, (_event, file) => {
    if (
      !file ||
      /(^|\/)(node_modules|dist|\.git|\.repro|test-results)(\/|$)/.test(file)
    )
      return;
    const fromOutput = relative(
      resolve(options.outDir ?? '.repro/runs'),
      resolve(directory, file),
    );
    if (
      fromOutput === '' ||
      (!isAbsolute(fromOutput) &&
        fromOutput !== '..' &&
        !fromOutput.startsWith(`..${sep}`))
    )
      return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 200);
  });
  run();
  return async () => {
    closed = true;
    watcher.close();
    if (timer) clearTimeout(timer);
    controller?.abort();
    await pending.catch(() => undefined);
  };
}
