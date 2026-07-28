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
    expect(placed?.leaderLine).toBeDefined();
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
      viewport: { ...viewport, height: 40, width: 120 },
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
