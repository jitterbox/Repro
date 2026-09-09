import { expect, it } from 'vitest';
import { validateEvidence } from '@repro/contracts';
import type { Observation } from '@repro/contracts';
import { compileEvidencePresentation } from './evidence-presentation.js';
const spec = validateEvidence({
  schemaVersion: '1.0.0',
  id: 'proof',
  title: 'Checkout opens',
  variant: { id: 'after', role: 'after', label: 'After' },
  claim: 'Checkout responds',
  expected: 'Checkout is open',
  steps: [{ id: 'trigger', title: 'Click Checkout', trigger: true }],
  checkpoints: [
    {
      id: 'result',
      title: 'Checkout result',
      step: 'trigger',
      observations: ['screenshot', 'assertion'],
    },
  ],
  outputs: ['png', 'mp4'],
});
it('uses one title, numbered step and outcome definition across capture and rendered timing', () => {
  const observations: Observation[] = [
    {
      id: 'assert',
      checkpoint: 'result',
      kind: 'assertion',
      status: 'passed',
      pageId: 'page',
      timeMs: 800,
      data: { designated: true, assertionPassed: true },
    },
  ];
  const run = {
    steps: [
      {
        id: 'trigger',
        title: 'Stale title',
        index: 1,
        startMs: 100,
        endMs: 900,
      },
    ],
    observations,
    durationMs: 1000,
    scenarioOutcome: 'fix-verified' as const,
  };
  const original = compileEvidencePresentation(
    spec,
    run,
    { width: 1280, height: 720, deviceScaleFactor: 1 },
    0,
    false,
  );
  const presented = compileEvidencePresentation(
    spec,
    run,
    { width: 1280, height: 720, deviceScaleFactor: 1 },
    0,
    true,
  );
  expect(original.outputDuration).toBe(1000);
  expect(presented.outputDuration).toBeGreaterThan(1000);
  for (const result of [original, presented]) {
    expect(result.cues.map((c) => c.accessibilityText)).toEqual(
      result.annotations.map((a) => a.label),
    );
    expect(result.cues.find((c) => c.component === 'step-badge')).toMatchObject(
      { step: { index: 1, total: 1, title: 'Click Checkout' } },
    );
    expect(
      result.annotations.find((a) => a.id === 'outcome')?.timeRange.start,
    ).toBeGreaterThanOrEqual(800);
  }
  expect(
    original.cues.find((c) => c.component === 'slate')?.accessibilityText,
  ).toBe('Checkout opens — After');
});
