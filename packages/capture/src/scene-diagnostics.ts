import { observeWebMcp } from './webmcp-observer.js';
import type { Page } from 'playwright';
import type { CaptureEventSink } from './events.js';
import { diagnosticUrl } from './browser-diagnostics.js';

/** Passive CDP network domain. Never enables Debugger or reads response bodies. */
export async function startSceneDiagnostics(
  page: Page,
  pageId: string,
  sink: CaptureEventSink,
) {
  const emit = (
    kind: string,
    payload: Record<string, string | number | boolean | null>,
  ) => {
    sink.emitEvent({
      pageId,
      kind,
      payload: {
        ...payload,
        source: 'cdp',
        timing: 'host-receipt-with-browser-timestamp',
        uncertaintyMs: null,
      },
    });
  };
  const coverage = (collector: string, status: string, reason: string) => {
    emit('diagnostic.coverage', { collector, status, reason });
  };
  const client = await page
    .context()
    .newCDPSession(page)
    .catch(() => null);
  if (!client) {
    coverage('cdp-network', 'unsupported', 'CDP session unavailable');
    return { dispose: () => Promise.resolve() };
  }
  let transferred = 0;
  const requestBytes = new Map<string, number>();
  client.on(
    'Network.requestWillBeSent',
    (e: {
      requestId: string;
      timestamp: number;
      request: { url: string; method: string };
      frameId?: string;
    }) => {
      emit('browser.network', {
        phase: 'start',
        requestId: e.requestId,
        browserTimestamp: e.timestamp,
        frameId: e.frameId ?? null,
        url: diagnosticUrl(e.request.url),
        method: e.request.method,
      });
    },
  );
  client.on(
    'Network.responseReceived',
    (e: {
      requestId: string;
      timestamp: number;
      response: { status: number; mimeType: string; fromDiskCache?: boolean };
    }) => {
      emit('browser.network', {
        phase: 'response',
        requestId: e.requestId,
        browserTimestamp: e.timestamp,
        status: e.response.status,
        mimeType: e.response.mimeType,
        fromDiskCache: e.response.fromDiskCache ?? false,
      });
    },
  );
  client.on(
    'Network.dataReceived',
    (e: {
      requestId: string;
      timestamp: number;
      dataLength: number;
      encodedDataLength: number;
    }) => {
      transferred += e.encodedDataLength;
      requestBytes.set(
        e.requestId,
        (requestBytes.get(e.requestId) ?? 0) + e.encodedDataLength,
      );
      emit('browser.transfer', {
        requestId: e.requestId,
        browserTimestamp: e.timestamp,
        decodedBytes: e.dataLength,
        encodedBytes: e.encodedDataLength,
        cumulativeBytes: transferred,
      });
    },
  );
  client.on(
    'Network.loadingFinished',
    (e: {
      requestId: string;
      timestamp: number;
      encodedDataLength: number;
    }) => {
      const remaining = Math.max(
        0,
        e.encodedDataLength - (requestBytes.get(e.requestId) ?? 0),
      );
      transferred += remaining;
      requestBytes.delete(e.requestId);
      emit('browser.transfer', {
        requestId: e.requestId,
        browserTimestamp: e.timestamp,
        encodedBytes: remaining,
        cumulativeBytes: transferred,
        totalEncodedBytes: e.encodedDataLength,
        phase: 'complete',
      });
      emit('browser.network', {
        phase: 'end',
        requestId: e.requestId,
        browserTimestamp: e.timestamp,
        totalEncodedBytes: e.encodedDataLength,
      });
    },
  );
  client.on(
    'Network.loadingFailed',
    (e: {
      requestId: string;
      timestamp: number;
      errorText: string;
      canceled?: boolean;
    }) => {
      requestBytes.delete(e.requestId);
      emit('browser.network', {
        phase: 'failed',
        requestId: e.requestId,
        browserTimestamp: e.timestamp,
        error: e.errorText,
        canceled: e.canceled ?? false,
      });
    },
  );
  await client.send('Network.enable');
  const webmcp = await observeWebMcp(client, pageId, sink, () => {
    try {
      return new URL(page.url()).origin;
    } catch {
      return 'unknown';
    }
  });
  coverage(
    'cdp-network',
    'captured',
    'Browser timestamps retained; cross-clock calibration is not assumed. Transfer samples exclude cache and unsampled delivery overhead.',
  );
  for (const collector of [
    'response-bodies',
    'storage',
    'worker-state',
    'performance-trace',
  ])
    coverage(
      collector,
      'disabled',
      'Deep collection requires an explicit adapter; not included in the passive baseline.',
    );
  const navigation = () => {
    void page
      .evaluate(() => ({
        available: 'modelContext' in navigator,
        origin: location.origin,
      }))
      .then((value) => {
        coverage(
          'webmcp-page-api',
          value.available ? 'captured' : 'unsupported',
          value.available
            ? 'WebMCP page surface detected. Protocol event coverage is reported separately; no tool was invoked.'
            : 'Browser does not expose navigator.modelContext.',
        );
      })
      .catch(() => undefined);
  };
  page.on('domcontentloaded', navigation);
  return {
    dispose: async () => {
      page.off('domcontentloaded', navigation);
      webmcp.dispose();
      await client.detach().catch(() => undefined);
    },
  };
}
