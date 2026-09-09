import { expect, it } from 'vitest';
import { correlateDiagnostics } from './diagnostics.js';
import type { CapturedEvent } from './interaction-events.js';

it('associates receipt times with steps and request starts without claiming causality', () => {
  const request: CapturedEvent = {
    id: 'start',
    pageId: 'page-1',
    kind: 'browser.request',
    t_mono: 10,
    payload: { requestId: 'page-1-request-1' },
  };
  const failure: CapturedEvent = {
    ...request,
    id: 'failure',
    kind: 'browser.request-failure',
    t_mono: 80,
    payload: { ...request.payload, message: 'Disconnected' },
  };
  const step = {
    id: 'trigger',
    title: 'Submit',
    index: 1,
    startMs: 0,
    endMs: 50,
  };
  expect(correlateDiagnostics([request, failure], [step])).toEqual([
    expect.objectContaining({
      eventId: 'failure',
      requestStartedMs: 10,
      timeMs: 80,
      stepId: null,
      timing: 'host-receipt',
      uncertaintyMs: null,
    }),
  ]);
  expect(
    correlateDiagnostics([request, { ...failure, t_mono: 40 }], [step])[0]
      ?.stepId,
  ).toBe('trigger');
  expect(
    correlateDiagnostics(
      [request, { ...failure, t_mono: 40 }],
      [step, { ...step, id: 'nested' }],
    )[0]?.stepId,
  ).toBeNull();
});
