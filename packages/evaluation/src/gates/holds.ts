import type { GateResult } from '../types/gate.js';
import type { PlanAnnotation, PlanDocument } from './plan-types.js';

const MIN_HOLD_MS: Readonly<Record<string, number>> = {
  callout: 800,
  chapter: 1200,
  'console-toast': 900,
  outcome: 1400,
  'outcome-pair': 1400,
  plate: 800,
  slate: 1800,
  'step-badge': 600,
};

const DEFAULT_MIN_HOLD_MS = 600;

export interface HoldsGateInput {
  readonly plan?: PlanDocument | undefined;
}

export function checkHolds(input: HoldsGateInput): GateResult {
  const name = 'holds';
  const annotations = input.plan?.annotations ?? [];
  const violations: readonly {
    readonly id: string;
    readonly component: string;
    readonly holdMs: number;
    readonly requiredMs: number;
  }[] = annotations.flatMap((annotation) => {
    const range = annotation.outTimeRange ?? annotation.timeRange;
    if (!range) {
      return [];
    }
    const holdMs = range.end - range.start;
    const requiredMs = minHoldFor(annotation);
    if (holdMs + 1e-6 >= requiredMs) {
      return [];
    }
    return [{ id: annotation.id, component: annotation.component, holdMs, requiredMs }];
  });

  if (violations.length > 0) {
    return {
      name,
      pass: false,
      message: `${violations.length} annotation(s) below minimum hold`,
      details: { violations },
    };
  }

  return {
    name,
    pass: true,
    message: 'All annotations meet minimum hold in output time',
    details: { checked: annotations.length },
  };
}

function minHoldFor(annotation: PlanAnnotation): number {
  return MIN_HOLD_MS[annotation.component] ?? DEFAULT_MIN_HOLD_MS;
}
