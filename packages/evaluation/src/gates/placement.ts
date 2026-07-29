import type { GateResult } from '../types/gate.js';
import type { PlanAnnotation, PlanDocument } from './plan-types.js';
import { bboxHeight, bboxWidth } from './plan-io.js';

const CENTRE_BAN_RADIUS_PX = 120;
const CENTER_ALLOWED = new Set([
  'chapter',
  'slate',
  'outcome',
  'outcome-pair',
]);

export interface PlacementGateInput {
  readonly plan?: PlanDocument | undefined;
  readonly frameWidth?: number | undefined;
  readonly frameHeight?: number | undefined;
}

export function checkPlacement(input: PlacementGateInput): GateResult {
  const name = 'placement';
  const width = input.frameWidth ?? 1280;
  const height = input.frameHeight ?? 720;
  const centreX = width / 2;
  const centreY = height / 2;
  const annotations = input.plan?.annotations ?? [];

  const violations = annotations.flatMap((annotation) => {
    if (CENTER_ALLOWED.has(annotation.component)) {
      return [];
    }
    const centre = plateCentre(annotation);
    if (!centre) {
      return [];
    }
    const distance = Math.hypot(centre.x - centreX, centre.y - centreY);
    if (distance > CENTRE_BAN_RADIUS_PX) {
      return [];
    }
    return [
      {
        id: annotation.id,
        component: annotation.component,
        distancePx: Math.round(distance),
      },
    ];
  });

  if (violations.length > 0) {
    return {
      name,
      pass: false,
      message: `${violations.length} plate(s) centred within ${CENTRE_BAN_RADIUS_PX}px`,
      details: { violations, centreBanRadiusPx: CENTRE_BAN_RADIUS_PX },
    };
  }

  return {
    name,
    pass: true,
    message: 'No banned centre placement detected',
    details: { checked: annotations.length },
  };
}

function plateCentre(
  annotation: PlanAnnotation,
): { readonly x: number; readonly y: number } | null {
  if (annotation.bounds) {
    return {
      x: annotation.bounds.x + bboxWidth(annotation.bounds) / 2,
      y: annotation.bounds.y + bboxHeight(annotation.bounds) / 2,
    };
  }

  if (annotation.placement?.x !== undefined && annotation.placement?.y !== undefined) {
    return { x: annotation.placement.x, y: annotation.placement.y };
  }

  const bbox = annotation.anchor?.bbox;
  if (!bbox) {
    return null;
  }

  return {
    x: bbox.x + bboxWidth(bbox) / 2,
    y: bbox.y + bboxHeight(bbox) / 2,
  };
}
