import { describe, expect, it } from 'vitest';

import { annotationsToVisualCues } from './visual-cues.js';

import type { AnnotationBox } from './types.js';

describe('annotationsToVisualCues', () => {
  it('requires step index/total for step-badge cues', () => {
    const cues = annotationsToVisualCues([
      box({
        id: 'step-1',
        component: 'step-badge',
        label: 'STEP 2 / 4',
        plate: { label: 'STEP 2 / 4' },
      }),
    ]);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.step).toEqual({
      index: 2,
      total: 4,
      title: 'STEP 2 / 4',
    });
  });

  it('omits invalid step badges without counters', () => {
    const cues = annotationsToVisualCues([
      box({
        id: 'bad-step',
        component: 'step-badge',
        label: 'Inspect Save alignment',
      }),
    ]);
    expect(cues).toHaveLength(0);
  });

  it('requires expected/actual for outcome-pair', () => {
    const cues = annotationsToVisualCues([
      box({
        id: 'outcome',
        component: 'outcome-pair',
        label: 'Misaligned',
        plate: {
          label: 'Misaligned by 12px',
          measurement: 'Buttons share one baseline',
        },
      }),
    ]);
    expect(cues[0]?.outcome).toEqual({
      expected: 'Buttons share one baseline',
      actual: 'Misaligned by 12px',
    });
  });
});

function box(
  partial: Partial<AnnotationBox> &
    Pick<AnnotationBox, 'id' | 'component' | 'label'>,
): AnnotationBox {
  return {
    feature: 'steps',
    severity: 'info',
    kind: 'callout',
    timeRange: { start: 1000, end: 3000 },
    outTimeRange: { start: 1000, end: 3000 },
    bounds: { x: 24, y: 24, width: 120, height: 28 },
    renderer: 'ass',
    ...partial,
  } as AnnotationBox;
}
