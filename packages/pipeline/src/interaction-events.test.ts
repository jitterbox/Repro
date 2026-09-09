import { expect, it } from 'vitest';
import type { Observation } from '@repro/contracts';
import { correlateInteractionEvents } from './interaction-events.js';
import type { CapturedEvent } from './interaction-events.js';

const sample: Observation = {
  id: 'sample',
  checkpoint: 'result',
  kind: 'hit-test',
  pageId: 'page-1',
  timeMs: 100,
  status: 'passed',
  target: 'checkout',
  data: {
    documentId: 'document-1',
    attempted: { x: 10.25, y: 20.75 },
    intendedReceives: false,
  },
};
const step = {
  id: 'trigger',
  title: 'Click Checkout',
  index: 1,
  startMs: 80,
  endMs: 200,
};
const event: CapturedEvent = {
  id: 'pointer-event',
  pageId: 'page-1',
  kind: 'probe.pointer:path',
  t_mono: 150,
  payload: {
    documentId: 'document-1',
    coordinateSpace: 'viewport-css',
    phase: 'pointerdown',
    x: 10.25,
    y: 20.75,
    path: ['#cover', 'body'],
    captureClock: { method: 'page-sampled', uncertaintyMs: 1 },
  },
};
it('preserves actual fractional coordinates and dispatch paths separately from the sample', () => {
  const result = correlateInteractionEvents([sample], [step], [event]);
  expect(result[0]?.data).toMatchObject({
    attempted: { x: 10.25, y: 20.75 },
    intendedReceives: false,
    eventCorrelation: {
      status: 'observed',
      scope: 'same-step-and-page-after-sample',
      stepId: 'trigger',
      events: [
        {
          eventId: 'pointer-event',
          recipient: '#cover',
          point: { x: 10.25, y: 20.75 },
        },
      ],
    },
  });
  expect(sample.data).not.toHaveProperty('eventCorrelation');
});
it('does not invent recipients from other pages, pre-sample events, uncertain timing or overlapping steps', () => {
  const candidates = [
    { ...event, payload: { ...event.payload, documentId: 'new-navigation' } },
    {
      ...event,
      payload: { ...event.payload, coordinateSpace: 'frame-viewport-css' },
    },
    { ...event, pageId: 'page-2' },
    { ...event, t_mono: 90 },
    { ...event, t_mono: 200 },
    {
      ...event,
      payload: {
        ...event.payload,
        captureClock: { method: 'uncalibrated-receipt', uncertaintyMs: null },
      },
    },
    { ...event, payload: { ...event.payload, path: [] } },
  ];
  for (const candidate of candidates)
    expect(
      correlateInteractionEvents([sample], [step], [candidate])[0]?.data
        ?.eventCorrelation,
    ).toMatchObject({ status: 'unavailable', events: [] });
  expect(
    correlateInteractionEvents(
      [sample],
      [step, { ...step, id: 'nested' }],
      [event],
    )[0]?.data?.eventCorrelation,
  ).toMatchObject({ status: 'unavailable', stepId: null, events: [] });
  const unsupported = { ...sample, status: 'unsupported' as const };
  expect(correlateInteractionEvents([unsupported], [step], [event])[0]).toBe(
    unsupported,
  );
});
