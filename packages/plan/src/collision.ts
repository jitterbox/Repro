import { overlayTheme } from '@jitterbox/repro-contracts';

import type { AnnotationBox, Point, Rect } from './types.js';
import type { Viewport } from '@jitterbox/repro-core';

export interface PlaceAnnotationsInput {
  readonly annotations: readonly AnnotationBox[];
  readonly viewport: Viewport;
  readonly regionsOfInterest?: readonly Rect[];
  readonly padding?: number;
}

const defaultPadding = 12;
const seatDistancePx = 24;
const centreBanRadiusPx = 120;

const CENTER_ALLOWED = new Set(['chapter', 'slate', 'outcome-pair', 'outcome']);

interface OccupiedRegion {
  readonly bounds: Rect;
  readonly start: number;
  readonly end: number;
}

export function placeAnnotations(
  input: PlaceAnnotationsInput,
): readonly AnnotationBox[] {
  const padding = input.padding ?? defaultPadding;
  const sorted = [...input.annotations].sort(comparePriority);
  const placed: AnnotationBox[] = [];
  const occupied: OccupiedRegion[] = (input.regionsOfInterest ?? []).map(
    (bounds) => ({ bounds, end: Number.POSITIVE_INFINITY, start: 0 }),
  );
  const bottomBandOccupants = new Map<string, string>();

  for (const annotation of sorted) {
    if (isBottomBand(annotation)) {
      const key = beatKey(annotation);
      const existing = bottomBandOccupants.get(key);
      if (existing !== undefined && existing !== annotation.id) {
        // Toast wins; defer chapters/voiceover by skipping this occupant.
        if (annotation.component === 'chapter') {
          continue;
        }
      }
      bottomBandOccupants.set(key, annotation.id);
    }

    const result = placeOne(annotation, occupied, input.viewport, padding);
    if (result === null) {
      continue;
    }

    placed.push(result);
    const range = result.outTimeRange ?? result.timeRange;
    occupied.push({
      bounds: result.bounds,
      end: range.end,
      start: range.start,
    });
  }

  return placed.sort(
    (left, right) => left.timeRange.start - right.timeRange.start,
  );
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
  occupied: readonly OccupiedRegion[],
  viewport: Viewport,
  padding: number,
): AnnotationBox | null {
  if (
    annotation.component === 'slate' ||
    annotation.component === 'progress-rail' ||
    annotation.collisionPolicy === 'overlay'
  ) {
    return withPlacement(annotation, annotation.bounds, undefined, false);
  }

  const candidates = [
    ...placementCandidates(annotation, viewport, padding),
    ...gridCandidates(annotation, viewport, padding),
  ];
  const open = candidates.find((rect) =>
    isAcceptable(rect, annotation, occupied, padding, viewport, true),
  );

  if (open !== undefined) {
    const target = targetCenter(annotation);
    const leader = needsLeader(open, annotation);
    return withPlacement(annotation, open, target, leader);
  }

  // Relax centre ban before giving up — never cover the anchor.
  const relaxed = candidates.find((rect) =>
    isAcceptable(rect, annotation, occupied, padding, viewport, false),
  );
  if (relaxed !== undefined) {
    const target = targetCenter(annotation);
    return withPlacement(
      annotation,
      relaxed,
      target,
      needsLeader(relaxed, annotation),
    );
  }

  if (annotation.collisionPolicy === 'hide') {
    return null;
  }

  throw new Error(
    `No collision-free placement for ${annotation.id}; reduce simultaneous callouts or use a separate diagnostic beat`,
  );
}

function isAcceptable(
  rect: Rect,
  annotation: AnnotationBox,
  occupied: readonly OccupiedRegion[],
  padding: number,
  viewport: Viewport,
  banCentre: boolean,
): boolean {
  if (hasCollision(rect, annotation, occupied, padding)) {
    return false;
  }
  if (coversAnchor(rect, annotation)) {
    return false;
  }
  if (
    banCentre &&
    !CENTER_ALLOWED.has(annotation.component ?? '') &&
    isNearCentre(rect, viewport)
  ) {
    return false;
  }
  return true;
}

function needsLeader(bounds: Rect, annotation: AnnotationBox): boolean {
  const target = targetRect(annotation);
  if (target === null) {
    return false;
  }
  const plateCenter = rectCenter(bounds);
  const anchorCenter = rectCenter(target);
  const distance = Math.hypot(
    plateCenter.x - anchorCenter.x,
    plateCenter.y - anchorCenter.y,
  );
  return distance > seatDistancePx + Math.max(target.width, target.height) / 2;
}

function coversAnchor(bounds: Rect, annotation: AnnotationBox): boolean {
  const target = targetRect(annotation);
  if (target === null) {
    return false;
  }
  const overlap = intersectionArea(bounds, target);
  const anchorArea = Math.max(1, target.width * target.height);
  return overlap / anchorArea > 0.1;
}

function intersectionArea(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) {
    return 0;
  }
  return (x1 - x0) * (y1 - y0);
}

function isNearCentre(bounds: Rect, viewport: Viewport): boolean {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const center = rectCenter(bounds);
  return Math.hypot(center.x - cx, center.y - cy) < centreBanRadiusPx;
}

function isBottomBand(annotation: AnnotationBox): boolean {
  const component = annotation.component;
  return (
    component === 'console-toast' ||
    component === 'chapter' ||
    annotation.feature === 'voiceover'
  );
}

function beatKey(annotation: AnnotationBox): string {
  return (
    annotation.beatId ?? String(Math.floor(annotation.timeRange.start / 100))
  );
}

function comparePriority(left: AnnotationBox, right: AnnotationBox): number {
  // Console toast wins bottom-band conflicts
  if (
    left.component === 'console-toast' &&
    right.component !== 'console-toast'
  ) {
    return -1;
  }
  if (
    right.component === 'console-toast' &&
    left.component !== 'console-toast'
  ) {
    return 1;
  }
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
  const inset = overlayTheme.safeZones.inset;
  const bottom = Math.min(
    overlayTheme.safeZones.bottomBand,
    viewport.height * 0.15,
  );

  if (isBottomBand(annotation)) {
    return [
      clampRect(
        {
          height: annotation.bounds.height,
          width: annotation.bounds.width,
          x: inset,
          y: viewport.height - bottom + 8,
        },
        viewport,
      ),
    ];
  }

  if (target === null) {
    // Unanchored HUD chips — park in corners, never centre
    return [
      clampRect({ ...annotation.bounds, x: inset, y: inset }, viewport),
      clampRect(
        {
          ...annotation.bounds,
          x: viewport.width - annotation.bounds.width - inset,
          y: inset,
        },
        viewport,
      ),
    ];
  }

  const width = annotation.bounds.width;
  const height = annotation.bounds.height;

  return [
    above(target, width, height, padding),
    rightOf(target, width, height, padding),
    below(target, width, height, padding),
    leftOf(target, width, height, padding),
  ]
    .map((rect) => clampRect(rect, viewport))
    .filter((rect) => rect.y + rect.height <= viewport.height - bottom);
}

function gridCandidates(
  annotation: AnnotationBox,
  viewport: Viewport,
  padding: number,
): Rect[] {
  const inset = overlayTheme.safeZones.inset;
  const { width, height } = annotation.bounds;
  const candidates: Rect[] = [];
  for (
    let y = inset;
    y + height <= viewport.height - inset;
    y += height + padding * 2
  ) {
    for (const x of [inset, viewport.width - width - inset]) {
      if (x >= inset) candidates.push({ x, y, width, height });
    }
  }
  return candidates;
}

function hasCollision(
  rect: Rect,
  annotation: AnnotationBox,
  occupied: readonly OccupiedRegion[],
  padding: number,
): boolean {
  const padded = expandRect(rect, padding);
  const range = annotation.outTimeRange ?? annotation.timeRange;
  return occupied.some((other) => {
    if (!timeRangesOverlap(range, other)) {
      return false;
    }
    return intersects(padded, other.bounds);
  });
}

function timeRangesOverlap(
  left: { readonly start: number; readonly end: number },
  right: { readonly start: number; readonly end: number },
): boolean {
  return left.start < right.end && right.start < left.end;
}

function withPlacement(
  annotation: AnnotationBox,
  bounds: Rect,
  target: Point | undefined,
  withLeader: boolean,
): AnnotationBox {
  if (!withLeader || target === undefined) {
    return { ...annotation, bounds };
  }

  const measured = targetRect(annotation);
  if (measured === null) return { ...annotation, bounds };
  return {
    ...annotation,
    bounds,
    leaderLine: {
      from: boundaryToward(bounds, target),
      // Keep the arrow tip outside the six-pixel target ring and its stroke.
      to: boundaryToward(
        expandRect(measured, (annotation.anchor?.pad ?? 6) + 2),
        rectCenter(bounds),
      ),
    },
  };
}

/** Intersect a center-to-point ray with the rectangle edge. */
function boundaryToward(rect: Rect, point: Point): Point {
  const center = rectCenter(rect);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const scale = Math.min(
    dx === 0 ? Infinity : rect.width / (2 * Math.abs(dx)),
    dy === 0 ? Infinity : rect.height / (2 * Math.abs(dy)),
  );
  return Number.isFinite(scale)
    ? { x: center.x + dx * scale, y: center.y + dy * scale }
    : center;
}

function targetCenter(annotation: AnnotationBox): Point | undefined {
  const target = targetRect(annotation);
  return target === null ? undefined : rectCenter(target);
}

function targetRect(annotation: AnnotationBox): Rect | null {
  if (annotation.anchor?.bbox !== undefined) {
    const box = annotation.anchor.bbox;
    return { height: box.h, width: box.w, x: box.x, y: box.y };
  }

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

function leftOf(
  target: Rect,
  width: number,
  height: number,
  gap: number,
): Rect {
  return {
    height,
    width,
    x: target.x - width - gap,
    y: target.y + target.height / 2 - height / 2,
  };
}

function rightOf(
  target: Rect,
  width: number,
  height: number,
  gap: number,
): Rect {
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
