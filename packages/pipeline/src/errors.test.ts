import { expect, it } from 'vitest';
import { ProcessCancelledError } from '@jitterbox/repro-core';
import { pipelineProblem } from './errors.js';
it('classifies startup and subprocess cancellation consistently', () => {
  expect(
    pipelineProblem(new ProcessCancelledError('node')).error.category,
  ).toBe('cancelled');
  expect(
    pipelineProblem(new Error('Watch server startup cancelled')).error.category,
  ).toBe('cancelled');
});

it('returns actionable OCR diagnostics without leaking findings into transcripts', () => {
  const error = Object.assign(new Error('Strict OCR blocked export'), {
    name: 'GateError',
    code: 'OCR_PII_DETECTED',
    reportPath: '/private/audit/report.json',
    hits: [{ text: 'private-value' }],
    timings: { ocrMs: 12 },
  });
  const problem = pipelineProblem(error);
  expect(problem.error).toMatchObject({
    code: 'OCR_PII_DETECTED',
    hitCount: 1,
    reportPath: '/private/audit/report.json',
    timings: { ocrMs: 12 },
  });
  expect(JSON.stringify(problem)).not.toContain('private-value');
});

it('classifies run contention independently of words in the directory name', () => {
  expect(
    pipelineProblem(
      new Error(
        'Operation is locked by another writer: /runs/audit-retry/render.lock',
      ),
    ).error,
  ).toMatchObject({ category: 'busy', code: 'RUN_BUSY' });
});
