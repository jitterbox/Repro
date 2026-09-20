import { measureOverlayTextWidth } from '@repro/plan';
import { overlayTheme } from '@repro/contracts';
import { intersects } from '@repro/plan';
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

it('seats selected callouts outside measured targets and ties every cue to the correct page', () => {
  const focused = validateEvidence({
    ...spec,
    targets: [{ id: 'button', description: 'Intended control' }],
    checkpoints: [
      {
        ...spec.checkpoints[0],
        targets: ['button'],
        observations: ['screenshot', 'bounds'],
        highlights: [{ target: 'button', label: 'Intended Checkout control' }],
      },
    ],
  });
  const image: Observation = {
    id: 'image',
    checkpoint: 'result',
    kind: 'screenshot',
    status: 'passed',
    pageId: 'cart',
    timeMs: 500,
    endMs: 510,
  };
  const bounds: Observation = {
    id: 'bounds',
    checkpoint: 'result',
    kind: 'bounds',
    status: 'passed',
    pageId: 'cart',
    target: 'button',
    timeMs: 490,
    endMs: 520,
    bounds: { x: 520, y: 300, width: 140, height: 40 },
  };
  const run = {
    steps: [
      { id: 'trigger', index: 1, title: 'Click', startMs: 0, endMs: 900 },
    ],
    durationMs: 1000,
    observations: [image, bounds],
    scenarioOutcome: 'inconclusive' as const,
  };
  const compile = (observations = run.observations) =>
    compileEvidencePresentation(
      focused,
      { ...run, observations },
      { width: 1280, height: 720, deviceScaleFactor: 1 },
      0,
    );
  const result = compile();
  const callout = result.annotations.find((a) => a.component === 'callout');
  if (!callout || !bounds.bounds) throw new Error('Missing measured callout');
  expect(callout.label).toBe('Intended Checkout control');
  expect(callout.bounds.width - 24).toBeGreaterThanOrEqual(
    measureOverlayTextWidth(callout.label, overlayTheme.type.calloutLabel.size),
  );
  expect(callout.anchor).toMatchObject({
    evidenceRef: 'bounds',
    pageId: 'cart',
  });
  expect(intersects(callout.bounds, bounds.bounds)).toBe(false);
  expect(
    result.cues.find((c) => c.component === 'callout')?.accessibilityText,
  ).toBe(callout.label);
  expect(() => compile([{ ...image, pageId: 'popup' }, bounds])).toThrow(
    'aligned measured',
  );
  expect(() => compile([image, { ...image, id: 'duplicate' }, bounds])).toThrow(
    'aligned measured',
  );
  expect(() => compile([image, { ...bounds, endMs: 499 }])).toThrow(
    'aligned measured',
  );
  expect(() =>
    compile([image, { ...bounds, status: 'failed', bounds: null }]),
  ).toThrow('aligned measured');
  expect(() =>
    compile([
      image,
      { ...bounds, bounds: { x: 0, y: 0, width: 1280, height: 720 } },
    ]),
  ).toThrow('No unobstructed space');
  const repeated = validateEvidence({
    ...focused,
    checkpoints: [
      focused.checkpoints[0],
      { ...focused.checkpoints[0], id: 'later' },
    ],
  });
  const repeatedResult = compileEvidencePresentation(
    repeated,
    {
      ...run,
      durationMs: 2000,
      observations: [
        ...run.observations,
        {
          ...image,
          id: 'later-image',
          checkpoint: 'later',
          timeMs: 1500,
          endMs: 1510,
        },
        {
          ...bounds,
          id: 'later-bounds',
          checkpoint: 'later',
          timeMs: 1490,
          endMs: 1520,
        },
      ],
    },
    { width: 1280, height: 720, deviceScaleFactor: 1 },
    0,
  );
  expect(
    repeatedResult.annotations.filter((a) => a.component === 'callout'),
  ).toHaveLength(2);
  const unadorned = validateEvidence({
    ...focused,
    checkpoints: [{ ...focused.checkpoints[0], highlights: [] }],
  });
  expect(
    compileEvidencePresentation(
      unadorned,
      run,
      { width: 1280, height: 720, deviceScaleFactor: 1 },
      0,
    ).annotations.some((a) => a.component === 'target-ring'),
  ).toBe(false);
});

it('labels an unmet expectation as expected rather than reporting it as the observed failure', () => {
  const result = compileEvidencePresentation(
    spec,
    {
      steps: [],
      durationMs: 1000,
      observations: [],
      scenarioOutcome: 'bug-reproduced',
    },
    { width: 1280, height: 720, deviceScaleFactor: 1 },
    0,
  );
  expect(result.annotations.find((a) => a.id === 'outcome')?.label).toBe(
    `Bug reproduced: Expected: ${spec.expected}`,
  );
});
