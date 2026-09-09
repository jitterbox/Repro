import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  listener: undefined as undefined | ((event: string, file: string) => void),
  close: vi.fn(),
  run: vi.fn(),
}));
vi.mock('node:fs', () => ({
  watch: (
    _directory: string,
    _options: unknown,
    listener: typeof mocks.listener,
  ) => {
    mocks.listener = listener;
    return { close: mocks.close };
  },
}));
vi.mock('./execute.js', () => ({ runScenario: mocks.run }));
import { watchScenario } from './watch.js';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('coalesces edits received during cancellation and reports only the latest run', async () => {
  vi.useFakeTimers();
  let finish: ((value: unknown) => void) | undefined;
  let signal: AbortSignal | undefined;
  mocks.run
    .mockImplementationOnce((options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    })
    .mockResolvedValue({ ok: true });
  const changed = vi.fn();
  const stop = watchScenario(
    { spec: 'scenario.ts', evidence: 'evidence.json' },
    changed,
  );
  for (let edit = 0; edit < 3; edit++) {
    mocks.listener?.('change', 'scenario.ts');
    await vi.advanceTimersByTimeAsync(201);
  }
  expect(signal?.aborted).toBe(true);
  expect(mocks.run).toHaveBeenCalledTimes(1);
  finish?.({ ok: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.run).toHaveBeenCalledTimes(2);
  expect(changed).toHaveBeenCalledExactlyOnceWith({ ok: true });
  await stop();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('reports invalid source input and recovers after the next edit', async () => {
  vi.useFakeTimers();
  mocks.run
    .mockRejectedValueOnce(new Error('Unresolved scenario import'))
    .mockResolvedValue({ ok: true });
  const changed = vi.fn();
  const stop = watchScenario(
    { spec: 'scenario.ts', evidence: 'evidence.json' },
    changed,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ok: false,
      executionError: 'Unresolved scenario import',
    }),
  );
  mocks.listener?.('change', 'scenario.ts');
  await vi.advanceTimersByTimeAsync(201);
  expect(changed).toHaveBeenLastCalledWith({ ok: true });
  await stop();
});
