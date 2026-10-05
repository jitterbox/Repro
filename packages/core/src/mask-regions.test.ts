import { expect, it } from 'vitest';
import {
  hasPrivacyMaskEvent,
  isConcealedInputSelector,
  maskSamplesFromEvents,
  motionMaskEnvelopes,
  privacyMaskVisible,
} from './mask-regions.js';

const passwordEvents = [
  {
    id: '1',
    kind: 'probe.redaction.mask',
    pageId: 'page-1',
    t_mono: 1667.975,
    payload: {
      selector: "input[type='password']",
      x: 328,
      y: 340,
      width: 624,
      height: 44,
    },
  },
  {
    id: '2',
    kind: 'probe.redaction.mask',
    pageId: 'page-1',
    t_mono: 5976.604,
    payload: {
      selector: "input[type='password']",
      x: 473,
      y: 224,
      width: 148,
      height: 38,
    },
  },
  {
    id: '3',
    kind: 'probe.redaction.mask',
    pageId: 'page-1',
    t_mono: 11079.188,
    payload: {
      selector: "input[type='password']",
      x: 473,
      y: 224,
      width: 148,
      height: 38,
    },
  },
];

it('covers interpolated fractional positions while keeping independent selectors separate', () => {
  const samples = [
    { group: 'page/secret', x: 0.25, y: 20.5, width: 10, height: 5 },
    { group: 'page/secret', x: 100.75, y: 40.25, width: 20, height: 10 },
    { group: 'page/other', x: 500, y: 500, width: 10, height: 10 },
  ];
  expect(motionMaskEnvelopes(samples)).toEqual([
    { x: 0.25, y: 20.5, width: 120.5, height: 29.75 },
    { x: 500, y: 500, width: 10, height: 10 },
  ]);
  expect(() =>
    motionMaskEnvelopes([
      { group: 'invalid', x: 0, y: 0, width: NaN, height: 10 },
    ]),
  ).toThrow('Invalid');
});

it('keeps separate password fields on their own intervals', () => {
  expect(isConcealedInputSelector("input[type='password']")).toBe(true);
  expect(isConcealedInputSelector('#secret')).toBe(false);
  expect(hasPrivacyMaskEvent(passwordEvents)).toBe(true);
  expect(
    maskSamplesFromEvents(passwordEvents, { maskConcealedInputs: false }),
  ).toEqual([]);
  expect(
    motionMaskEnvelopes(
      maskSamplesFromEvents(passwordEvents, { maskConcealedInputs: true }),
    ),
  ).toEqual([
    {
      x: 328,
      y: 340,
      width: 624,
      height: 44,
      startMs: 1667.975,
      endMs: 5976.604,
      pageId: 'page-1',
    },
    {
      x: 473,
      y: 224,
      width: 148,
      height: 38,
      startMs: 5976.604,
      pageId: 'page-1',
    },
  ]);
});

it('does not union simultaneous controls that share a selector', () => {
  expect(
    motionMaskEnvelopes([
      {
        group: 'page-1/input[type=password]',
        x: 100,
        y: 100,
        width: 80,
        height: 30,
        timeMs: 10,
      },
      {
        group: 'page-1/input[type=password]',
        x: 100,
        y: 400,
        width: 80,
        height: 30,
        timeMs: 10.4,
      },
    ]),
  ).toEqual([
    {
      x: 100,
      y: 100,
      width: 80,
      height: 30,
      startMs: 10,
      pageId: 'page-1',
    },
    {
      x: 100,
      y: 400,
      width: 80,
      height: 30,
      startMs: 10,
      pageId: 'page-1',
    },
  ]);
});

it('envelopes one control through sampled motion and ends it on clear', () => {
  const moving = Array.from({ length: 8 }, (_, index) => ({
    group: 'page-1/#secret',
    x: 80 + index * 60,
    y: 200 + index * 16,
    width: 600,
    height: 64,
    timeMs: 1000 + index * 16,
  }));
  expect(motionMaskEnvelopes(moving)).toEqual([
    {
      x: 80,
      y: 200,
      width: 1020,
      height: 176,
      startMs: 1000,
      pageId: 'page-1',
    },
  ]);
  expect(
    motionMaskEnvelopes([
      ...moving.slice(0, 1),
      {
        group: 'page-1/#secret',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        timeMs: 1400,
        cleared: true,
      },
    ]),
  ).toEqual([
    {
      x: 80,
      y: 200,
      width: 600,
      height: 64,
      startMs: 1000,
      endMs: 1400,
      pageId: 'page-1',
    },
  ]);
});

it('never merges a different control that appears as another vanishes', () => {
  const field = (x: number, y: number, timeMs: number) => ({
    group: 'page-1/input[type=password]',
    x,
    y,
    width: 148,
    height: 38,
    timeMs,
  });
  // One control jumps far within a frame (fast scroll): same control, one box.
  expect(
    motionMaskEnvelopes([field(80, 330, 1000), field(80, 120, 1016)]),
  ).toEqual([
    {
      x: 80,
      y: 120,
      width: 148,
      height: 248,
      startMs: 1000,
      pageId: 'page-1',
    },
  ]);
  // Two controls, then a different one appears elsewhere within 120 ms.
  expect(
    motionMaskEnvelopes([
      field(100, 100, 1000),
      field(100, 400, 1000),
      field(500, 600, 1050),
    ]),
  ).toEqual([
    {
      x: 100,
      y: 100,
      width: 148,
      height: 38,
      startMs: 1000,
      endMs: 1050,
      pageId: 'page-1',
    },
    {
      x: 100,
      y: 400,
      width: 148,
      height: 38,
      startMs: 1000,
      endMs: 1050,
      pageId: 'page-1',
    },
    {
      x: 500,
      y: 600,
      width: 148,
      height: 38,
      startMs: 1050,
      pageId: 'page-1',
    },
  ]);
});

it('shows a timed mask only on its page and interval', () => {
  const mask = {
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    startMs: 10,
    endMs: 20,
    pageId: 'page-1',
  };
  expect(privacyMaskVisible(mask, 15, 'page-1')).toBe(true);
  expect(privacyMaskVisible(mask, 20, 'page-1')).toBe(false);
  expect(privacyMaskVisible(mask, 15, 'page-2')).toBe(false);
  expect(privacyMaskVisible({}, null)).toBe(true);
});
