import type { GateResult } from '../types/gate.js';
import type { PlanDocument } from './plan-types.js';

export interface RedactionGateInput {
  readonly plan?: PlanDocument | undefined;
  readonly strictRedaction?: boolean | undefined;
}

export function checkRedaction(input: RedactionGateInput): GateResult {
  const name = 'redaction';
  const strict =
    input.strictRedaction === true ||
    input.plan?.config?.redaction?.strict === true;

  if (!strict) {
    return {
      name,
      pass: true,
      message: 'Strict redaction not enabled; gate skipped',
      details: { skipped: true },
    };
  }

  const rects = input.plan?.redactionRects ?? [];
  if (rects.length === 0) {
    return {
      name,
      pass: false,
      message: 'Strict redaction requires redactionRects in plan',
      details: { rectCount: 0 },
    };
  }

  return {
    name,
    pass: true,
    message: `${rects.length} redaction rect(s) present for strict config`,
    details: { rectCount: rects.length },
  };
}
