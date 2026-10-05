import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { maskTrackerScript } from './mask-tracker.js';
function harness(child = false, invalid = false) {
  const events: Record<string, unknown>[] = [];
  const callbacks: (() => void)[] = [];
  const bounds = { x: 10, y: 20, width: 80, height: 30 };
  const window: {
    top?: unknown;
    __reproEmit: (event: Record<string, unknown>) => void;
  } = { __reproEmit: (event) => events.push(event) };
  window.top = child ? {} : window;
  runInNewContext(maskTrackerScript(['.private']), {
    window,
    performance: { now: () => 1, timeOrigin: 1000 },
    requestAnimationFrame: (callback: () => void) => callbacks.push(callback),
    document: {
      querySelectorAll: () => {
        if (invalid) throw new Error('Invalid selector');
        return [{ getClientRects: () => [bounds] }];
      },
    },
  });
  const tick = () => {
    const callback = callbacks.shift();
    if (!callback) throw new Error('No pending measurement');
    callback();
  };
  return { events, bounds, tick };
}
it('measures untouched fields and follows movement without user interaction', () => {
  const h = harness();
  h.tick();
  expect(h.events[0]).toMatchObject({ type: 'redaction.mask', x: 10, y: 20 });
  h.bounds.y = 70;
  h.tick();
  expect(h.events[1]).toMatchObject({ type: 'redaction.mask', y: 70 });
  h.tick();
  expect(h.events).toHaveLength(2);
});
it('keeps simultaneous fields separate and clears a removed control', () => {
  const events: Record<string, unknown>[] = [];
  const callbacks: (() => void)[] = [];
  const fields = [
    {
      type: 'password',
      rects: [{ x: 328, y: 340, width: 624, height: 44 }],
    },
    { type: 'password', rects: [{ x: 473, y: 224, width: 148, height: 38 }] },
  ];
  let now = 10;
  const window: {
    top?: unknown;
    __reproEmit: (event: Record<string, unknown>) => void;
  } = {
    __reproEmit: (event) => events.push(event),
  };
  window.top = window;
  runInNewContext(maskTrackerScript(['input[type="password"]']), {
    window,
    performance: {
      now: () => now,
      timeOrigin: 1000,
    },
    requestAnimationFrame: (callback: () => void) => callbacks.push(callback),
    document: {
      querySelectorAll: () =>
        fields.map((field) => ({
          type: field.type,
          getClientRects: () => field.rects,
        })),
    },
  });
  const tick = () => {
    const callback = callbacks.shift();
    if (!callback) throw new Error('No pending measurement');
    now += 16;
    callback();
  };
  tick();
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ x: 328, concealed: true, time: 26 });
  expect(events[1]).toMatchObject({ x: 473, time: 26 });
  fields.splice(0, fields.length);
  tick();
  expect(events[2]).toMatchObject({ cleared: true });
  tick();
  expect(events).toHaveLength(3);
});
it('does not report a cleared mask for a control that never appeared', () => {
  const events: Record<string, unknown>[] = [];
  const callbacks: (() => void)[] = [];
  const window: {
    top?: unknown;
    __reproEmit: (event: Record<string, unknown>) => void;
  } = { __reproEmit: (event) => events.push(event) };
  window.top = window;
  runInNewContext(maskTrackerScript(['.absent']), {
    window,
    performance: { now: () => 1, timeOrigin: 1000 },
    requestAnimationFrame: (callback: () => void) => callbacks.push(callback),
    document: { querySelectorAll: () => [] },
  });
  for (const callback of callbacks.splice(0)) callback();
  expect(events).toHaveLength(0);
});
it('reports unsupported child-frame geometry and invalid selectors instead of inventing a mask', () => {
  for (const h of [harness(true), harness(false, true)]) {
    h.tick();
    h.tick();
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ type: 'redaction.error' });
  }
});
