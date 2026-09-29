import type { CaptureEventSink } from './events.js';
import type { JsonValue } from '@jitterbox/repro-core';

export interface PassiveProtocol {
  send(method: string): Promise<unknown>;
  on(event: string, listener: (payload: unknown) => void): unknown;
  off(event: string, listener: (payload: unknown) => void): unknown;
}
/** Observe the experimental protocol only. No tool invocation or discovery calls. */
export async function observeWebMcp(
  client: PassiveProtocol,
  pageId: string,
  sink: CaptureEventSink,
  origin: () => string,
) {
  const listeners = new Map<string, (payload: unknown) => void>();
  const coverage = (status: string, reason: string) => {
    sink.emitEvent({
      pageId,
      kind: 'diagnostic.coverage',
      payload: {
        collector: 'webmcp',
        status,
        reason,
        timing: 'host-receipt',
        uncertaintyMs: null,
      },
    });
  };
  for (const event of [
    'toolsAdded',
    'toolsRemoved',
    'toolInvoked',
    'toolResponded',
  ]) {
    const handler = (value: unknown) => {
      const serialized: unknown = JSON.stringify(value);
      if (
        typeof serialized !== 'string' ||
        Buffer.byteLength(serialized, 'utf8') > 65536
      ) {
        coverage('dropped', 'WebMCP event exceeds 64 KiB');
        return;
      }
      sink.emitEvent({
        pageId,
        kind: `browser.webmcp.${event}`,
        payload: {
          pageOrigin: origin(),
          source: 'cdp-webmcp',
          timing: 'host-receipt',
          uncertaintyMs: null,
          untrusted: true,
          observation: JSON.parse(serialized) as JsonValue,
        },
      });
    };
    listeners.set(`WebMCP.${event}`, handler);
    client.on(`WebMCP.${event}`, handler);
  }
  try {
    await client.send('WebMCP.enable');
    coverage(
      'captured',
      'Passive tool metadata, registration changes and observable calls/results; no tools invoked.',
    );
  } catch {
    for (const [event, handler] of listeners) client.off(event, handler);
    listeners.clear();
    coverage(
      'unsupported',
      'Browser does not support the experimental WebMCP protocol domain.',
    );
  }
  return {
    dispose() {
      for (const [event, handler] of listeners) client.off(event, handler);
      listeners.clear();
    },
  };
}
