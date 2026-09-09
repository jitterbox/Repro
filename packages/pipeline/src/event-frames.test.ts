import { expect, it } from 'vitest';
import { validateEvidence } from '@repro/contracts';
import { selectEventFrame } from './event-frames.js';
const spec = validateEvidence({
  schemaVersion: '1.0.0',
  id: 'flash',
  title: 'Flash during loading',
  variant: { id: 'before', role: 'before', label: 'Before' },
  claim: 'Content flashes',
  expected: 'Content stays visible',
  steps: [{ id: 'trigger', title: 'Load', trigger: true }],
  segments: [{ id: 'loading', title: 'Loading interval', step: 'trigger' }],
  checkpoints: [
    {
      id: 'flash',
      title: 'During loading',
      step: 'trigger',
      observations: ['screenshot'],
      timing: 'transient',
      frame: {
        segment: 'loading',
        event: { kind: 'probe.pointer:path', match: { phase: 'pointerdown' } },
        offsetMs: 40,
      },
    },
  ],
  outputs: ['png'],
});
const checkpoint = spec.checkpoints[0];
if (!checkpoint) throw new Error('Missing test checkpoint');
const segment = {
  id: 'loading',
  title: 'Loading interval',
  step: 'trigger',
  pageId: 'page-1',
  startMs: 50,
  endMs: 200,
  status: 'passed' as const,
};
const event = {
  id: 'event-1',
  kind: 'probe.pointer:path',
  pageId: 'page-1',
  t_mono: 100,
  payload: {
    phase: 'pointerdown',
    captureClock: { method: 'page-sampled', uncertaintyMs: 2 },
  },
};
const frame = { path: 'frame.jpeg', pageId: 'page-1', timeMs: 150 };
it('selects captured pixels within the same page and segment and reports actual timing', () => {
  expect(
    selectEventFrame(
      checkpoint,
      [segment],
      [event],
      [{ ...frame, pageId: 'popup', timeMs: 140 }, frame],
    ),
  ).toMatchObject({
    frame,
    requestedMs: 140,
    selectionOffsetMs: 10,
    uncertaintyMs: 12,
    event: { id: 'event-1' },
  });
});
it('rejects missing events, unknown clocks, frames outside the segment, and excessive selection error', () => {
  for (const [events, frames] of [
    [[], [frame]],
    [[{ ...event, payload: { phase: 'pointerdown' } }], [frame]],
    [[event], [{ ...frame, timeMs: 210 }]],
    [[event], [{ ...frame, timeMs: 60 }]],
  ] as const)
    expect(() =>
      selectEventFrame(checkpoint, [segment], [...events], [...frames]),
    ).toThrow();
});
