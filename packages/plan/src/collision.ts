import type { AnnotationBox, Point, Rect } from './types.js';
import type { Viewport } from '@repro/core';

export interface PlaceAnnotationsInput {
  readonly annotations: readonly AnnotationBox[];
  readonly viewport: Viewport;
  readonly regionsOfInterest?: readonly Rect[];
  readonly padding?: number;
}

const defaultPadding = 12;

export function placeAnnotations(
  input: PlaceAnnotationsInput,
): readonly AnnotationBox[] {
  const padding = input.padding ?? defaultPadding;
  const sorted = [...input.annotations].sort(comparePriority);
  const placed: AnnotationBox[] = [];
  const occupied = [...(input.regionsOfInterest ?? [])];

  for (const annotation of sorted) {
    const result = placeOne(annotation, occupied, input.viewport, padding);

    if (result === null) {
      continue;
    }

    placed.push(result);
    occupied.push(result.bounds);
  }

  return placed.sort((left, right) => left.timeRange.start - right.timeRange.start);
}

export function intersects(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function expandRect(rect: Rect, amount: number): Rect {
  return {
    height: rect.height + amount * 2,
    width: rect.width + amount * 2,
    x: rect.x - amount,
    y: rect.y - amount,
  };
}

function placeOne(
  annotation: AnnotationBox,
  occupied: readonly Rect[],
  viewport: Viewport,
  padding: number,
): AnnotationBox | null {
  if (annotation.collisionPolicy === 'overlay') {
    return withPlacement(annotation, annotation.bounds, undefined);
  }

  const candidates = placementCandidates(annotation, viewport, padding);
  const open = candidates.find((rect) => !hasCollision(rect, occupied, padding));

  if (open !== undefined) {
    return withPlacement(annotation, open, targetCenter(annotation));
  }

  if (annotation.collisionPolicy === 'hide') {
    return null;
  }

  return withPlacement(annotation, clampRect(annotation.bounds, viewport), undefined);
}

function comparePriority(left: AnnotationBox, right: AnnotationBox): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return left.timeRange.start - right.timeRange.start;
}

function placementCandidates(
  annotation: AnnotationBox,
  viewport: Viewport,
  padding: number,
): readonly Rect[] {
  const target = targetRect(annotation);

  if (target === null) {
    return scanCandidates(annotation.bounds, viewport, padding);
  }

  const width = annotation.bounds.width;
  const height = annotation.bounds.height;

  return [
    above(target, width, height, padding),
    rightOf(target, width, height, padding),
    below(target, width, height, padding),
    leftOf(target, width, height, padding),
    annotation.bounds,
  ].map((rect) => clampRect(rect, viewport));
}

function scanCandidates(
  bounds: Rect,
  viewport: Viewport,
  padding: number,
): readonly Rect[] {
  const candidates: Rect[] = [clampRect(bounds, viewport)];
  const step = Math.max(24, bounds.height + padding);

  for (let y = padding; y <= viewport.height - bounds.height; y += step) {
    candidates.push(clampRect({ ...bounds, y }, viewport));
  }

  return candidates;
}

function hasCollision(
  rect: Rect,
  occupied: readonly Rect[],
  padding: number,
): boolean {
  const padded = expandRect(rect, padding);
  return occupied.some((other) => intersects(padded, other));
}

function withPlacement(
  annotation: AnnotationBox,
  bounds: Rect,
  target: Point | undefined,
): AnnotationBox {
  if (target === undefined) {
    return { ...annotation, bounds };
  }

  return {
    ...annotation,
    bounds,
    leaderLine: {
      from: rectCenter(bounds),
      to: target,
    },
  };
}

function targetCenter(annotation: AnnotationBox): Point | undefined {
  const target = targetRect(annotation);
  return target === null ? undefined : rectCenter(target);
}

function targetRect(annotation: AnnotationBox): Rect | null {
  const target = annotation.target;

  if (target === undefined || typeof target === 'string') {
    return null;
  }

  if (
    target.x === undefined ||
    target.y === undefined ||
    target.width === undefined ||
    target.height === undefined
  ) {
    return null;
  }

  return {
    height: target.height,
    width: target.width,
    x: target.x,
    y: target.y,
  };
}

function above(target: Rect, width: number, height: number, gap: number): Rect {
  return {
    height,
    width,
    x: target.x + target.width / 2 - width / 2,
    y: target.y - height - gap,
  };
}

function below(target: Rect, width: number, height: number, gap: number): Rect {
  return {
    height,
    width,
    x: target.x + target.width / 2 - width / 2,
    y: target.y + target.height + gap,
  };
}

function leftOf(target: Rect, width: number, height: number, gap: number): Rect {
  return {
    height,
    width,
    x: target.x - width - gap,
    y: target.y + target.height / 2 - height / 2,
  };
}

function rightOf(target: Rect, width: number, height: number, gap: number): Rect {
  return {
    height,
    width,
    x: target.x + target.width + gap,
    y: target.y + target.height / 2 - height / 2,
  };
}

function rectCenter(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function clampRect(rect: Rect, viewport: Viewport): Rect {
  return {
    height: Math.min(rect.height, viewport.height),
    width: Math.min(rect.width, viewport.width),
    x: clamp(rect.x, 0, Math.max(0, viewport.width - rect.width)),
    y: clamp(rect.y, 0, Math.max(0, viewport.height - rect.height)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
