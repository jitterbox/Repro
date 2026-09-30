import { expect, it } from 'vitest';
import {
  withOperationTelemetry,
  operationMetadata,
  type OperationTelemetry,
} from './telemetry.js';
it('keeps concurrent command telemetry isolated and accumulates asset totals', async () => {
  const a: OperationTelemetry = { phases: {}, metrics: {} },
    b: OperationTelemetry = { phases: {}, metrics: {} };
  await Promise.all(
    [a, b].map((value, index) =>
      withOperationTelemetry(value, async () => {
        operationMetadata({
          runId: `run-${index}`,
          phases: { decodeMs: index + 1 },
          metrics: { frames: 2 },
        });
        await new Promise((resolve) => setTimeout(resolve, index));
        operationMetadata({ phases: { decodeMs: 3 }, metrics: { frames: 4 } });
      }),
    ),
  );
  expect(a).toMatchObject({
    runId: 'run-0',
    phases: { decodeMs: 4 },
    metrics: { frames: 6 },
  });
  expect(b).toMatchObject({
    runId: 'run-1',
    phases: { decodeMs: 5 },
    metrics: { frames: 6 },
  });
  operationMetadata({ runId: 'outside' });
  expect(a.runId).toBe('run-0');
});
