import type { RunManifest } from '@repro/contracts';
import type { CapturedEvent } from './interaction-events.js';

export function correlateDiagnostics(
  events: CapturedEvent[],
  steps: RunManifest['steps'],
): RunManifest['diagnostics'] {
  const requests = new Map<string, number>();
  const result: RunManifest['diagnostics'] = [];
  for (const event of events) {
    const data = event.payload;
    if (event.kind === 'browser.request' && typeof data.requestId === 'string')
      requests.set(data.requestId, event.t_mono);
    const kind = event.kind.replace(/^browser\./, '');
    if (
      kind !== 'console' &&
      kind !== 'exception' &&
      kind !== 'request-failure' &&
      kind !== 'http-error'
    )
      continue;
    const matches = steps.filter(
      (step) => event.t_mono >= step.startMs && event.t_mono <= step.endMs,
    );
    const start =
      typeof data.requestId === 'string'
        ? requests.get(data.requestId)
        : undefined;
    result.push({
      eventId: event.id,
      kind,
      pageId: event.pageId,
      timeMs: event.t_mono,
      timing: 'host-receipt',
      uncertaintyMs: null,
      stepId: matches.length === 1 ? (matches[0]?.id ?? null) : null,
      message: typeof data.message === 'string' ? data.message : '',
      ...(typeof data.level === 'string' ? { level: data.level } : {}),
      ...(typeof data.requestId === 'string'
        ? { requestId: data.requestId }
        : {}),
      ...(start !== undefined ? { requestStartedMs: start } : {}),
      ...(typeof data.url === 'string' ? { url: data.url } : {}),
      ...(typeof data.method === 'string' ? { method: data.method } : {}),
      ...(typeof data.status === 'number' ? { status: data.status } : {}),
    });
  }
  return result;
}
