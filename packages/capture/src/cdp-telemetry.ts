import type { CDPSession, Page } from 'playwright';
import type { JsonValue } from '@repro/core';

import type { CaptureEventSink } from './events.js';

export interface CdpTelemetryOptions {
  readonly page: Page;
  readonly pageId: string;
  readonly sink: CaptureEventSink;
}

export interface CdpTelemetry {
  dispose(): Promise<void>;
}

interface EventListener {
  readonly handler: (event: CdpEvent) => void;
}

export async function startCdpTelemetry(
  options: CdpTelemetryOptions,
): Promise<CdpTelemetry> {
  const client = await options.page.context().newCDPSession(options.page);
  const listener = telemetryListener(options);

  client.on('event', listener.handler);
  await enableTelemetryDomains(client);

  return {
    dispose: async () => {
      client.off('event', listener.handler);
      await client.detach().catch(() => undefined);
    },
  };
}

interface CdpEvent {
  readonly method: string;
  readonly params?: object;
}

function telemetryListener(options: CdpTelemetryOptions): EventListener {
  return {
    handler: (event) => {
      routeTelemetryEvent(options, event);
    },
  };
}

function routeTelemetryEvent(
  options: CdpTelemetryOptions,
  event: CdpEvent,
): void {
  if (event.method === 'Runtime.consoleAPICalled') {
    emitTelemetry(options, 'cdp.console', consolePayload(event.params));
    return;
  }

  if (event.method === 'Log.entryAdded') {
    emitTelemetry(options, 'cdp.log', logPayload(event.params));
    return;
  }

  if (event.method === 'Runtime.exceptionThrown') {
    emitTelemetry(options, 'cdp.exception', exceptionPayload(event.params));
  }
}

async function enableTelemetryDomains(client: CDPSession): Promise<void> {
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Debugger.enable');
}

function emitTelemetry(
  options: CdpTelemetryOptions,
  kind: string,
  payload: JsonValue,
): void {
  options.sink.emitEvent({
    kind,
    pageId: options.pageId,
    payload,
  });
}

function consolePayload(params: unknown): JsonValue {
  const record = recordFrom(params);

  return {
    args: arrayFrom(record.args).map(remoteObjectPayload),
    executionContextId: numberOrNull(record.executionContextId),
    timestamp: numberOrNull(record.timestamp),
    type: stringOrNull(record.type),
  };
}

function logPayload(params: unknown): JsonValue {
  const entry = recordFrom(recordFrom(params).entry);

  return {
    level: stringOrNull(entry.level),
    lineNumber: numberOrNull(entry.lineNumber),
    source: stringOrNull(entry.source),
    text: stringOrNull(entry.text),
    timestamp: numberOrNull(entry.timestamp),
    url: stringOrNull(entry.url),
  };
}

function exceptionPayload(params: unknown): JsonValue {
  const details = recordFrom(recordFrom(params).exceptionDetails);

  return {
    columnNumber: numberOrNull(details.columnNumber),
    exception: remoteObjectPayload(details.exception),
    lineNumber: numberOrNull(details.lineNumber),
    text: stringOrNull(details.text),
    url: stringOrNull(details.url),
  };
}

function remoteObjectPayload(value: unknown): JsonValue {
  if (value === undefined) {
    return null;
  }

  const record = recordFrom(value);
  return {
    className: stringOrNull(record.className),
    description: stringOrNull(record.description),
    subtype: stringOrNull(record.subtype),
    type: stringOrNull(record.type),
    value: jsonValueOrNull(record.value),
  };
}

function jsonValueOrNull(value: unknown): JsonValue {
  if (value === null || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return null;
}

function arrayFrom(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
