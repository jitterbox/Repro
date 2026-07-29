import type { GateResult } from '../types/gate.js';
import type { PlanDocument } from './plan-types.js';

export interface DuplicateLabelsGateInput {
  readonly plan?: PlanDocument | undefined;
}

interface TimedLabel {
  readonly id: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Fail when two overlapping cues carry the same normalized text.
 */
export function checkDuplicateLabels(
  input: DuplicateLabelsGateInput,
): GateResult {
  const name = 'duplicate-labels';
  const labels = timedLabels(input.plan);
  const collisions: string[] = [];

  for (let i = 0; i < labels.length; i += 1) {
    const left = labels[i]!;
    for (let j = i + 1; j < labels.length; j += 1) {
      const right = labels[j]!;
      if (left.text !== right.text) {
        continue;
      }
      if (!rangesOverlap(left, right)) {
        continue;
      }
      collisions.push(`${left.id}↔${right.id}:${left.text}`);
    }
  }

  if (collisions.length > 0) {
    return {
      name,
      pass: false,
      message: `Duplicate overlapping labels: ${collisions.slice(0, 3).join(', ')}`,
      details: { collisions },
    };
  }

  return {
    name,
    pass: true,
    message: 'No duplicate overlapping labels',
    details: { labelCount: labels.length },
  };
}

function timedLabels(plan: PlanDocument | undefined): readonly TimedLabel[] {
  return (plan?.annotations ?? []).flatMap((annotation) => {
    const text = normalize(
      annotation.plate?.label ?? annotation.label ?? '',
    );
    if (text.length === 0) {
      return [];
    }
    const range = annotation.outTimeRange ?? annotation.timeRange;
    if (range === undefined) {
      return [];
    }
    return [
      {
        id: annotation.id ?? text,
        text,
        start: range.start,
        end: range.end,
      },
    ];
  });
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function rangesOverlap(
  left: TimedLabel,
  right: TimedLabel,
): boolean {
  return left.start < right.end && right.start < left.end;
}
