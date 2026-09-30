import { expect, it, vi } from 'vitest';
import type * as Pipeline from '@jitterbox/repro-pipeline';
const calls = vi.hoisted(() => ({ render: vi.fn(), pair: vi.fn() }));
vi.mock('@jitterbox/repro-pipeline', async (original) => ({
  ...(await original<typeof Pipeline>()),
  renderEvidence: calls.render,
  renderScenePair: calls.pair,
}));
import { createReproProgram } from './index.js';
it('renders treatments by default without a backend switch', async () => {
  await createReproProgram(() => undefined).parseAsync(
    ['render', '/run', '--treatment', 'style.json'],
    { from: 'user' },
  );
  expect(calls.render).toHaveBeenCalledWith('/run', {
    treatment: 'style.json',
  });
});
it('pairs scenes through the same render command', async () => {
  await createReproProgram(() => undefined).parseAsync(
    ['render', '/after', '--baseline', '/before', '--observational'],
    { from: 'user' },
  );
  expect(calls.pair).toHaveBeenCalledWith('/before', '/after', true);
});
it('does not expose the removed event-file or backend interfaces', async () => {
  const program = createReproProgram(() => undefined)
    .exitOverride()
    .configureOutput({ writeErr: () => undefined });
  expect(program.commands.map((c) => c.name())).not.toEqual(
    expect.arrayContaining(['annotate']),
  );
  expect(program.commands.map((c) => c.name())).not.toContain('render-compare');
  program.commands.find((c) => c.name() === 'render')?.exitOverride();
  await expect(
    program.parseAsync(['render', '/run', '--renderer', 'legacy'], {
      from: 'user',
    }),
  ).rejects.toMatchObject({ code: 'commander.unknownOption' });
});
