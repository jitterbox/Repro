import { it, expect } from 'vitest';
import { mkdtemp, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startWorkflowCommand, workflowReport } from './workflow-log.js';
it('reports completed and interrupted attempts without recording private arguments', async () => {
  const file = join(
    await mkdtemp(join(tmpdir(), 'repro-log-')),
    'workflow.jsonl',
  );
  const done = await startWorkflowCommand(file, 'run');
  await done('passed');
  await startWorkflowCommand(file, 'run');
  const failed = await startWorkflowCommand(file, 'render');
  await failed('failed');
  const report = await workflowReport(file);
  expect(report.captureInvocations).toBe(2);
  expect(report.byCommand.find((c) => c.command === 'run')?.incomplete).toBe(1);
  expect(report.byCommand.find((c) => c.command === 'render')?.failed).toBe(1);
  const event = JSON.parse(
    (await readFile(file, 'utf8')).split('\n')[0] ?? '',
  ) as Record<string, unknown>;
  expect(Object.keys(event).sort()).toEqual([
    'at',
    'command',
    'event',
    'id',
    'schemaVersion',
  ]);
  await appendFile(file, '{bad log}\n');
  await expect(workflowReport(file)).rejects.toThrow();
});
