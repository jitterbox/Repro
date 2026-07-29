import type { GateResult } from '../types/gate.js';
import type { PlanDocument } from './plan-types.js';

export interface DesignLanguageGateInput {
  readonly plan?: PlanDocument | undefined;
}

const MAX_LABEL = 42;

/**
 * Assert Overlay Kit content rules on the planned cues (text, step form,
 * freeze vs pause distinction).
 */
export function checkDesignLanguage(
  input: DesignLanguageGateInput,
): GateResult {
  const name = 'design-language';
  const annotations = input.plan?.annotations ?? [];
  const failures: string[] = [];

  for (const annotation of annotations) {
    const label = annotation.plate?.label ?? annotation.label ?? '';
    if (label.length > MAX_LABEL) {
      failures.push(`${annotation.id}: label > ${String(MAX_LABEL)} chars`);
    }
    if (annotation.component === 'step-badge') {
      if (!/^STEP\s+\d+\s*\/\s*\d+/u.test(label)) {
        failures.push(`${annotation.id}: step badge must be STEP N / M`);
      }
    }
    if (annotation.component === 'pause-badge' && /freeze/iu.test(label)) {
      failures.push(`${annotation.id}: pause badge must not say freeze`);
    }
    if (annotation.component === 'freeze-banner' && /paused/iu.test(label)) {
      failures.push(`${annotation.id}: freeze banner must not say PAUSED`);
    }
    if (
      annotation.component === 'speed-chip' &&
      !/[0-9.]+\s*×|[0-9.]+\s*x/iu.test(label)
    ) {
      failures.push(`${annotation.id}: speed chip must show a rate`);
    }
  }

  if (failures.length > 0) {
    return {
      name,
      pass: false,
      message: failures.slice(0, 4).join('; '),
      details: { failures },
    };
  }

  return {
    name,
    pass: true,
    message: 'Design-language text rules satisfied',
    details: { annotationCount: annotations.length },
  };
}
