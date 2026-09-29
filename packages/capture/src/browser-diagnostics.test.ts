import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import type { CaptureEventSink } from './events.js';
import type { Page } from 'playwright';
import {
  diagnosticUrl,
  startBrowserDiagnostics,
} from './browser-diagnostics.js';

it('records distinct HTTP and transport failures, correlates requests, and detaches listeners', async () => {
  const page = new EventEmitter();
  const emitEvent = vi.fn<CaptureEventSink['emitEvent']>();
  const capture = startBrowserDiagnostics(page as unknown as Page, 'popup', {
    emitEvent,
  });
  const request = {
    url: () => 'https://user:secret@example.com/api?token=secret#private',
    method: () => 'GET',
    resourceType: () => 'fetch',
    failure: () => ({ errorText: 'net::ERR_FAILED' }),
  };
  page.emit('request', request);
  page.emit('response', { status: () => 500, request: () => request });
  page.emit('requestfailed', request);
  expect(emitEvent.mock.calls.map(([event]) => event.kind)).toEqual([
    'browser.request',
    'browser.response',
    'browser.http-error',
    'browser.request-failure',
  ]);
  for (const [event] of emitEvent.mock.calls)
    expect(event).toMatchObject({
      pageId: 'popup',
      payload: {
        requestId: 'popup-request-1',
        url: 'https://example.com/api',
        timing: 'host-receipt',
        uncertaintyMs: null,
      },
    });
  expect(emitEvent.mock.calls[2]?.[0].payload).toMatchObject({ status: 500 });
  await capture.dispose();
  page.emit('request', request);
  expect(emitEvent).toHaveBeenCalledTimes(4);
});

it('does not expose opaque URL data or credentials', () => {
  expect(diagnosticUrl('data:text/plain,private@example.com')).toBe(
    '[unavailable URL]',
  );
  expect(diagnosticUrl('blob:https://example.com/private')).toBe(
    '[unavailable URL]',
  );
  expect(diagnosticUrl('')).toBe('');
});
