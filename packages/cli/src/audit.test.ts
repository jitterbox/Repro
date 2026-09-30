import { expect, it, vi } from 'vitest';
import type * as Pipeline from '@jitterbox/repro-pipeline';
const calls = vi.hoisted(() => ({
  audit: vi.fn(() => Promise.resolve({ ok: true })),
  frame: vi.fn(() => Promise.resolve({ context: '/private/frame.png' })),
}));
vi.mock('@jitterbox/repro-pipeline', async (original) => ({
  ...(await original<typeof Pipeline>()),
  auditEvidence: calls.audit,
  inspectFrame: calls.frame,
}));
import { createReproProgram } from './index.js';
it('exposes privacy audits and output-time inspection through the CLI', async () => {
  const output: string[] = [];
  await createReproProgram((value) => output.push(value)).parseAsync(
    ['audit', '/run', '--json'],
    { from: 'user' },
  );
  expect(calls.audit).toHaveBeenCalledWith('/run');
  expect(JSON.parse(output[0] ?? '')).toEqual({ ok: true });
  await createReproProgram(() => undefined).parseAsync(
    ['frame', '/run', '--presentation', '--time-ms', '24102'],
    { from: 'user' },
  );
  expect(calls.frame).toHaveBeenCalledWith(
    '/run',
    expect.objectContaining({ presentation: true, timeMs: 24102 }),
  );
});
