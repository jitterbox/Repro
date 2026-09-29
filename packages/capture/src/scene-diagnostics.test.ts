import { it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Page } from 'playwright';
import type { CaptureEventInput } from './events.js';
import { startSceneDiagnostics } from './scene-diagnostics.js';
it('reconciles encoded transfer totals and preserves lifecycle timestamps', async () => {
  const client = Object.assign(new EventEmitter(), {
    send: () => Promise.resolve({}),
    detach: () => Promise.resolve(),
  });
  const page = Object.assign(new EventEmitter(), {
    context: () => ({ newCDPSession: () => Promise.resolve(client) }),
    url: () => 'https://qa.example/report',
  });
  const events: CaptureEventInput[] = [];
  const observer = await startSceneDiagnostics(
    page as unknown as Page,
    'page',
    {
      emitEvent: (e) => {
        events.push(e);
      },
    },
  );
  client.emit('Network.dataReceived', {
    requestId: 'r',
    timestamp: 1,
    dataLength: 1000,
    encodedDataLength: 100,
  });
  client.emit('Network.loadingFinished', {
    requestId: 'r',
    timestamp: 2,
    encodedDataLength: 140,
  });
  const transfers = events.filter((e) => e.kind === 'browser.transfer');
  expect(transfers[0]?.payload).toMatchObject({
    cumulativeBytes: 100,
    decodedBytes: 1000,
  });
  expect(transfers[1]?.payload).toMatchObject({
    cumulativeBytes: 140,
    encodedBytes: 40,
    totalEncodedBytes: 140,
  });
  expect(
    events.find((e) => e.kind === 'browser.network')?.payload,
  ).toMatchObject({ phase: 'end', browserTimestamp: 2, uncertaintyMs: null });
  await observer.dispose();
});
