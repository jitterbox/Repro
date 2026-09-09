import { validatePresentationEdit, evidenceRequirements } from './evidence.js';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  cropBounds,
  rasterCropBounds,
  evidenceJsonSchema,
  validateEvidence,
} from './evidence.js';
import type { Observation } from './evidence.js';
it('reports integer crop pixels and their exact CSS transform for fractional high-DPI bounds', () => {
  expect(
    rasterCropBounds(
      { x: 10.25, y: 2.75, width: 3.5, height: 4.5 },
      { width: 20, height: 10 },
      2,
    ),
  ).toEqual({
    pixels: { x: 20, y: 5, width: 8, height: 10 },
    css: { x: 10, y: 2.5, width: 4, height: 5 },
    scale: 2,
  });
  expect(
    rasterCropBounds(
      { x: 19.25, y: 8.5, width: 10, height: 10 },
      { width: 20, height: 10 },
      1,
    ).pixels,
  ).toEqual({ x: 19, y: 8, width: 1, height: 2 });
  expect(() =>
    rasterCropBounds(
      { x: 30, y: 0, width: 1, height: 1 },
      { width: 20, height: 10 },
      1,
    ),
  ).toThrow('no visible pixels');
});
const input = {
  schemaVersion: '1.0.0',
  id: 'checkout',
  title: 'Checkout button accepts pointer input',
  claim: 'An invisible overlay intercepts checkout',
  expected: 'Checkout opens',
  variant: { id: 'before', role: 'before', label: 'Before' },
  targets: [{ id: 'checkout', description: 'Checkout button' }],
  steps: [{ id: 'click', title: 'Click checkout', trigger: true }],
  checkpoints: [
    {
      id: 'result',
      step: 'click',
      title: 'Checkout result',
      targets: ['checkout'],
      observations: ['screenshot', 'assertion'],
    },
  ],
  outputs: ['review'],
};
describe('evidence contract', () => {
  it('has equivalent structural JSON validation and runtime parsing', () => {
    const validate = new Ajv({ strict: false }).compile(evidenceJsonSchema);
    expect(validate(input)).toBe(true);
    expect(validateEvidence(input).presentation.padding).toBe(24);
    expect(validate({ ...input, title: '' })).toBe(false);
    expect(() => validateEvidence({ ...input, title: '' })).toThrow();
  });
  it('rejects unresolved references and missing trigger semantics', () => {
    expect(() => validateEvidence({ ...input, targets: [] })).toThrow(
      'Unknown target',
    );
    expect(() =>
      validateEvidence({ ...input, steps: [{ id: 'click', title: 'Click' }] }),
    ).toThrow('trigger');
  });
  it('keeps fractional geometry while clamping a contextual crop', () => {
    expect(
      cropBounds(
        { x: 4.5, y: 100.25, width: 30.5, height: 20 },
        { width: 1280, height: 120 },
      ),
    ).toEqual({ x: 0, y: 76.25, width: 59, height: 43.75 });
  });
});

it('rejects a stable proof screenshot taken before its assertion or on another page', () => {
  const spec = validateEvidence(input);
  const screenshot: Observation = {
    id: 'image',
    checkpoint: 'result',
    kind: 'screenshot',
    pageId: 'page-2',
    timeMs: 20,
    status: 'passed',
  };
  const assertion: Observation = {
    id: 'assert',
    checkpoint: 'result',
    kind: 'assertion',
    pageId: 'page-2',
    timeMs: 10,
    status: 'passed',
  };
  const result = (check: Observation) =>
    evidenceRequirements(spec, [screenshot, check]).find(
      (gate) => gate.kind === 'screenshot',
    )?.status;
  expect(result(assertion)).toBe('passed');
  expect(result({ ...assertion, timeMs: 30 })).toBe('failed');
  expect(result({ ...assertion, pageId: 'page-1' })).toBe('failed');
  const transient = validateEvidence({
    ...input,
    checkpoints: [{ ...input.checkpoints[0], timing: 'transient' }],
  });
  expect(
    evidenceRequirements(transient, [
      screenshot,
      { ...assertion, timeMs: 30 },
    ]).every((gate) => gate.status === 'passed'),
  ).toBe(true);
});

it('allows presentation revisions while preserving committed proof and privacy', () => {
  const spec = validateEvidence(input);
  expect(
    validatePresentationEdit(spec, { ...spec, title: 'Clearer title' }).title,
  ).toBe('Clearer title');
  expect(() =>
    validatePresentationEdit(spec, {
      ...spec,
      privacy: { ...spec.privacy, strict: false },
    }),
  ).toThrow('capture a new run');
  const required = validateEvidence({
    ...input,
    targets: [
      ...input.targets,
      { id: 'related', description: 'Related control' },
    ],
    checkpoints: [
      {
        ...input.checkpoints[0],
        targets: ['checkout', 'related'],
        observations: ['bounds'],
      },
    ],
  });
  expect(
    evidenceRequirements(required, [
      {
        id: 'observation',
        checkpoint: 'result',
        kind: 'bounds',
        pageId: 'page-1',
        timeMs: 0,
        status: 'passed',
        target: 'checkout',
      },
    ]).map((result) => result.status),
  ).toEqual(['passed', 'failed']);
});

it('validates focused highlights and permits presentation edits without changing capture requirements', () => {
  const captured = validateEvidence({
    ...input,
    checkpoints: [
      {
        ...input.checkpoints[0],
        observations: ['screenshot', 'bounds', 'assertion'],
      },
    ],
  });
  const edited = {
    ...captured,
    checkpoints: captured.checkpoints.map((cp) => ({
      ...cp,
      highlights: [{ target: 'checkout', label: 'Intended Checkout control' }],
    })),
  };
  expect(validatePresentationEdit(captured, validateEvidence(edited))).toEqual(
    edited,
  );
  const validate = new Ajv({ strict: false }).compile(evidenceJsonSchema);
  expect(validate(edited)).toBe(true);
  const long = {
    ...edited,
    checkpoints: [
      {
        ...edited.checkpoints[0],
        highlights: [{ target: 'checkout', label: 'x'.repeat(65) }],
      },
    ],
  };
  expect(validate(long)).toBe(false);
  expect(() => validateEvidence(long)).toThrow();
  expect(() =>
    validateEvidence({
      ...edited,
      checkpoints: [
        {
          ...edited.checkpoints[0],
          highlights: [{ target: 'invented', label: 'Missing target' }],
        },
      ],
    }),
  ).toThrow('not a measured target');
  expect(() =>
    validateEvidence({
      ...edited,
      checkpoints: [{ ...edited.checkpoints[0], observations: ['screenshot'] }],
    }),
  ).toThrow('require screenshot and bounds');
});
