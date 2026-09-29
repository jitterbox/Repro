import { expect, it, vi } from 'vitest';
import { MonotonicClockBridge } from '@jitterbox/repro-core';
import type { ReproStore } from '@jitterbox/repro-core';
import { StoreEventSink } from './events.js';

it('does not borrow another document calibration when fixed-date origins are equal', () => {
  const appendEvent = vi.fn();
  const clock = new MonotonicClockBridge();
  clock.calibrate(1704067200000, 'document-a', {
    pageNowMs: 20,
    runTimeMs: 100,
    uncertaintyMs: 1,
  });
  clock.calibrate(1704067200000, 'document-b', {
    pageNowMs: 5,
    runTimeMs: 200,
    uncertaintyMs: 2,
  });
  const sink = new StoreEventSink(
    { appendEvent } as unknown as ReproStore,
    'run',
    clock,
    undefined,
    true,
  );
  for (const documentId of ['document-a', 'document-b', 'new-navigation'])
    sink.emitEvent({
      kind: 'probe.pointer:path',
      pageId: 'page-1',
      documentId,
      pageNowMs: 40,
      pageTimeOriginMs: 1704067200000,
      payload: { documentId },
    });
  expect(appendEvent).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ t_mono: 120 }),
  );
  expect(appendEvent).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ t_mono: 235 }),
  );
  expect(appendEvent).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      payload: {
        documentId: 'new-navigation',
        captureClock: { method: 'uncalibrated-receipt', uncertaintyMs: null },
      },
    }),
  );
});

it('normalizes fixed-date probe events using the measured offset and exposes uncertainty', () => {
  const appendEvent = vi.fn();
  const clock = new MonotonicClockBridge();
  clock.calibrate(1704067200000, 'page-1', {
    pageNowMs: 20,
    runTimeMs: 100,
    uncertaintyMs: 1,
  });
  const sink = new StoreEventSink(
    { appendEvent } as unknown as ReproStore,
    'run',
    clock,
    undefined,
    true,
  );
  sink.emitEvent({
    kind: 'probe.pointer:path',
    pageId: 'page-1',
    pageNowMs: 40,
    pageTimeOriginMs: 1704067200000,
    payload: { x: 12.5 },
  });
  expect(appendEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      t_mono: 120,
      payload: {
        x: 12.5,
        captureClock: { method: 'page-sampled', uncertaintyMs: 1 },
      },
    }),
  );
});

it('labels receipt timing explicitly when a controlled document has no calibration', () => {
  const appendEvent = vi.fn();
  const sink = new StoreEventSink(
    { appendEvent } as unknown as ReproStore,
    'run',
    new MonotonicClockBridge(),
    undefined,
    true,
  );
  sink.emitEvent({
    kind: 'probe.pointer:path',
    pageId: 'popup',
    pageNowMs: 40,
    pageTimeOriginMs: 2524608000000,
    payload: { x: 12.5 },
  });
  expect(appendEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        x: 12.5,
        captureClock: { method: 'uncalibrated-receipt', uncertaintyMs: null },
      },
    }),
  );
});
