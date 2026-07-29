import type { GateResult } from '../types/gate.js';
import type { PlanAnnotation, PlanDocument } from './plan-types.js';
import { bboxHeight, bboxWidth } from './plan-io.js';

const BOTTOM_BAND_PX = 96;

export interface BottomBandGateInput {
  readonly plan?: PlanDocument | undefined;
  readonly frameHeight?: number | undefined;
}

export function checkBottomBand(input: BottomBandGateInput): GateResult {
  const name = 'bottom-band';
  const frameHeight = input.frameHeight ?? 720;
  const bandTop = frameHeight - BOTTOM_BAND_PX;
  const annotations = input.plan?.annotations ?? [];
  const occupants = annotations.filter((annotation) =>
    intersectsBottomBand(annotation, bandTop),
  );

  const overlaps = findOverlapViolations(occupants);
  if (overlaps.length > 0) {
    return {
      name,
      pass: false,
      message: `${overlaps.length} bottom-band overlap(s) detected`,
      details: { overlaps, bandTop, bandHeight: BOTTOM_BAND_PX },
    };
  }

  return {
    name,
    pass: true,
    message: 'At most one bottom-band occupant per overlapping time',
    details: { occupants: occupants.length },
  };
}

function intersectsBottomBand(
  annotation: PlanAnnotation,
  bandTop: number,
): boolean {
  const bbox = annotation.bounds ?? annotation.anchor?.bbox;
  if (!bbox) {
    return annotation.component === 'console-toast';
  }
  const bottom = bbox.y + bboxHeight(bbox);
  return bottom >= bandTop;
}

function findOverlapViolations(
  occupants: readonly PlanAnnotation[],
): readonly { readonly a: string; readonly b: string; readonly start: number; readonly end: number }[] {
  const violations: {
    a: string;
    b: string;
    start: number;
    end: number;
  }[] = [];

  for (let left = 0; left < occupants.length; left += 1) {
    for (let right = left + 1; right < occupants.length; right += 1) {
      const a = occupants[left];
      const b = occupants[right];
      if (!a || !b) {
        continue;
      }
      const overlap = overlapRange(a, b);
      if (overlap) {
        violations.push({ a: a.id, b: b.id, ...overlap });
      }
    }
  }

  return violations;
}

function overlapRange(
  a: PlanAnnotation,
  b: PlanAnnotation,
): { readonly start: number; readonly end: number } | null {
  const rangeA = a.outTimeRange ?? a.timeRange;
  const rangeB = b.outTimeRange ?? b.timeRange;
  if (!rangeA || !rangeB) {
    return null;
  }
  const start = Math.max(rangeA.start, rangeB.start);
  const end = Math.min(rangeA.end, rangeB.end);
  if (end <= start) {
    return null;
  }
  return { start, end };
}
