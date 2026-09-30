import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const eventSchema = z.discriminatedUnion('event', [
  z.object({
    schemaVersion: z.literal('1.0.0'),
    event: z.literal('started'),
    id: z.string(),
    command: z.string(),
    at: z.iso.datetime(),
    cliVersion: z.string().optional(),
  }),
  z.object({
    schemaVersion: z.literal('1.0.0'),
    event: z.literal('finished'),
    id: z.string(),
    at: z.iso.datetime(),
    durationMs: z.number().nonnegative(),
    status: z.enum(['passed', 'failed']),
    errorCode: z.string().optional(),
    reportPath: z.string().optional(),
    runId: z.string().optional(),
    presentationId: z.string().optional(),
    phases: z.record(z.string(), z.number().nonnegative()).optional(),
    metrics: z.record(z.string(), z.number().nonnegative()).optional(),
  }),
]);
/** Allowlisted timings and identities only: never argv, URLs, output, environment or raw errors. */
export async function startWorkflowCommand(
  file: string,
  command: string,
  cliVersion?: string,
) {
  await mkdir(dirname(file), { recursive: true });
  const id = randomUUID(),
    started = performance.now();
  const write = (event: object) =>
    appendFile(
      file,
      JSON.stringify({
        schemaVersion: '1.0.0',
        id,
        at: new Date().toISOString(),
        ...event,
      }) + '\n',
      { mode: 0o600 },
    );
  await write({
    event: 'started',
    command,
    ...(cliVersion ? { cliVersion } : {}),
  });
  return async (
    status: 'passed' | 'failed',
    details: {
      errorCode?: string;
      reportPath?: string;
      runId?: string;
      presentationId?: string;
      phases?: Record<string, number>;
      metrics?: Record<string, number>;
    } = {},
  ) =>
    write({
      ...details,
      event: 'finished',
      status,
      durationMs: performance.now() - started,
    });
}
export async function workflowReport(file: string) {
  const events = (await readFile(file, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => eventSchema.parse(JSON.parse(line)));
  const starts = events.filter((e) => e.event === 'started');
  const finished = new Map(
    events.filter((e) => e.event === 'finished').map((e) => [e.id, e]),
  );
  const commands = starts.map((e) => {
    const end = finished.get(e.id);
    return {
      id: e.id,
      command: e.command,
      startedAt: e.at,
      status: end?.status ?? 'incomplete',
      durationMs: end?.durationMs ?? null,
      cliVersion: e.cliVersion ?? null,
      errorCode: end?.errorCode ?? null,
      reportPath: end?.reportPath ?? null,
      runId: end?.runId ?? null,
      presentationId: end?.presentationId ?? null,
      phases: end?.phases ?? {},
      metrics: end?.metrics ?? {},
    };
  });
  const byCommand = [...new Set(commands.map((c) => c.command))].map(
    (command) => {
      const group = commands.filter((c) => c.command === command);
      return {
        command,
        count: group.length,
        failed: group.filter((c) => c.status === 'failed').length,
        incomplete: group.filter((c) => c.status === 'incomplete').length,
        durationMs: group.reduce((n, c) => n + (c.durationMs ?? 0), 0),
      };
    },
  );
  return {
    schemaVersion: '1.0.0',
    coverage: 'instrumented-cli-commands-only',
    commands,
    byCommand,
    captureInvocations: commands.filter((c) =>
      ['run', 'capture', 'record'].includes(c.command),
    ).length,
    limitations: [
      'Multiple captures may be legitimate; the harness transcript must supply scenario identity and reasons.',
      'Durations are command wall time and may overlap; they are not total agent time.',
      'Incomplete entries have unknown outcomes. Abrupt termination may leave only a start record.',
      'Use the native harness transcript for prompts, browser exploration, non-Repro tools, user waits and retries. This log is not a complete agent audit.',
    ],
  };
}
