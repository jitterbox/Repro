import { describe, expect, it } from 'vitest';

import { intersects, placeAnnotations } from './collision.js';

import type { AnnotationBox, Rect } from './types.js';
import type { Viewport } from '@repro/core';

const viewport = {
  deviceScaleFactor: 1,
  height: 240,
  width: 320,
} satisfies Viewport;

describe('collision placement', () => {
  it('moves annotations away from regions of interest', () => {
    const roi = { height: 80, width: 120, x: 90, y: 70 };
    const [placed] = placeAnnotations({
      annotations: [box('a', roi)],
      regionsOfInterest: [roi],
      viewport,
    });

    expect(placed).toBeDefined();
    expect(intersects(placed?.bounds ?? roi, roi)).toBe(false);
    // Leader only when the plate cannot seat within 24px of the anchor.
    expect(placed?.bounds.y).not.toBe(roi.y);
  });

  it('ignores spatial collisions that do not overlap in time', () => {
    const target = { height: 16, width: 16, x: 40, y: 40 };
    const early = {
      ...box('early', target, 10, 'avoid'),
      timeRange: { end: 500, start: 0 },
    };
    const late = {
      ...box('late', target, 10, 'avoid'),
      timeRange: { end: 2_000, start: 1_000 },
    };

    const placed = placeAnnotations({
      annotations: [early, late],
      padding: 0,
      viewport,
    });

    expect(placed).toHaveLength(2);
    expect(placed[0]?.bounds).toEqual(placed[1]?.bounds);
  });

  it('honors priority before hiding lower-priority collisions', () => {
    const target = { height: 16, width: 16, x: 0, y: 0 };
    const annotations = [
      box('low', target, 1, 'hide'),
      box('high', target, 100, 'avoid'),
    ];

    const placed = placeAnnotations({
      annotations,
      padding: 0,
      viewport: { ...viewport, height: 80, width: 120 },
    });

    expect(placed.map((item) => item.id)).toContain('high');
    expect(placed.map((item) => item.id)).not.toContain('low');
  });
});

function box(
  id: string,
  target: Rect,
  priority = 10,
  collisionPolicy: AnnotationBox['collisionPolicy'] = 'avoid',
): AnnotationBox {
  return {
    bounds: { height: 40, width: 120, x: target.x, y: target.y },
    collisionPolicy,
    confidence: 1,
    feature: 'clickViz',
    id,
    kind: 'info',
    label: id,
    placement: 'auto',
    priority,
    severity: 'info',
    target,
    timeRange: { end: 1_000, start: 0 },
  };
}

it('ends callout leaders outside measured targets instead of crossing their text', () => {
  const target = { x: 80, y: 80, width: 180, height: 60 };
  const [placed] = placeAnnotations({
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    regionsOfInterest: [{ x: 0, y: 0, width: 1280, height: 68 }, target],
    annotations: [
      {
        ...box('callout', target),
        component: 'callout',
        bounds: { x: 0, y: 0, width: 250, height: 42 },
      },
    ],
  });
  if (!placed?.leaderLine) throw new Error('Expected leader');
  expect(placed.bounds.x).toBeGreaterThan(target.x + target.width);
  expect(placed.leaderLine.to.x).toBe(target.x + target.width + 8);
  expect(placed.leaderLine.from.x).toBe(placed.bounds.x);
  // Every point on the leader remains outside the original target.
  for (let t = 0; t <= 1; t += 0.1) {
    const { from, to } = placed.leaderLine;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      width: 1,
      height: 1,
    };
    expect(intersects(point, target)).toBe(false);
  }
});

it('fails explicitly when a required cue cannot fit rather than silently overlapping', () => {
  expect(() =>
    placeAnnotations({
      viewport,
      regionsOfInterest: [{ x: 0, y: 0, width: 320, height: 240 }],
      annotations: [box('required', { x: 100, y: 100, width: 20, height: 20 })],
    }),
  ).toThrow('No collision-free placement');
});
it('places simultaneous diagnostics and steps without overlapping plates', () => {
  const annotations = [
    'step-badge',
    'vitals-hud',
    'callout',
    'hit-target-guide',
    'console-toast',
  ].map(
    (component, index) =>
      ({
        ...box(`mix-${index}`, { x: 500, y: 300, width: 60, height: 40 }),
        component,
        bounds: { x: 0, y: 0, width: 240, height: 44 },
      }) as AnnotationBox,
  );
  const placed = placeAnnotations({
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    annotations,
  });
  expect(placed).toHaveLength(5);
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      expect(
        intersects(requireBox(placed[i]).bounds, requireBox(placed[j]).bounds),
      ).toBe(false);
});

function requireBox(value: AnnotationBox | undefined): AnnotationBox {
  if (!value) throw new Error('Missing annotation');
  return value;
}
