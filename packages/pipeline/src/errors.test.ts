import { expect, it } from 'vitest';
import { ProcessCancelledError } from '@jitterbox/repro-core';
import { pipelineProblem } from './errors.js';
it('classifies startup and subprocess cancellation consistently', () => {
  expect(pipelineProblem(new ProcessCancelledError('node')).error.category).toBe('cancelled');
  expect(pipelineProblem(new Error('Watch server startup cancelled')).error.category).toBe('cancelled');
});
