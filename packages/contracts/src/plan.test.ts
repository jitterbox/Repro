import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { expect, it } from 'vitest';
import { parsePlan, planSchema, planJsonSchema } from './plan.js';
import { normalizeQualityResult } from './quality.js';
const plan = {
  schemaVersion: 1,
  viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  annotations: [],
  chapters: [],
  redactionRects: [],
  segments: [],
  timeline: {
    schemaVersion: '1.0.0',
    fps: 30,
    beats: [
      { id: 'play', kind: 'play', captureStartMs: 0, captureEndMs: 1000 },
    ],
    timeMap: {
      kind: 'piecewise-linear',
      knots: [
        [0, 0],
        [1000, 1000],
      ],
    },
    warnings: [],
  },
  metadata: { durationMs: 1000, generatedAtEpoch: 0 },
};
it('publishes plan geometry and timeline constraints from their shared Zod source', () => {
  expect(
    JSON.parse(
      readFileSync(
        new URL('../schemas/executable-plan.schema.json', import.meta.url),
        'utf8',
      ),
    ),
  ).toEqual(planJsonSchema);
  const validate = new Ajv2020({ strict: true }).compile(planJsonSchema);
  for (const [index, value] of [
    plan,
    { ...plan, redactionRects: [{ x: 0.5, y: 1.5, width: 8.2, height: 3.7 }] },
    { ...plan, redactionRects: [{ x: 0, y: 0, width: -1, height: 2 }] },
    {
      ...plan,
      timeline: {
        ...plan.timeline,
        timeMap: { kind: 'piecewise-linear', knots: [[0, 0, 0]] },
      },
    },
  ].entries()) {
    expect(validate(value)).toBe(planSchema.safeParse(value).success);
    expect(validate(value)).toBe(index < 2);
  }
  expect(() =>
    parsePlan({
      ...plan,
      timeline: {
        ...plan.timeline,
        timeMap: {
          kind: 'piecewise-linear',
          knots: [
            [5, 0],
            [0, 10],
          ],
        },
      },
    }),
  ).toThrow('monotone');
});
it('normalizes compatibility gates and rejects contradictory public quality results', () => {
  expect(
    normalizeQualityResult({
      name: 'ocr',
      pass: false,
      message: 'missing',
      status: 'unsupported',
    }).status,
  ).toBe('unsupported');
  expect(
    normalizeQualityResult({ name: 'pixels', pass: true, message: 'measured' })
      .status,
  ).toBe('passed');
  expect(() =>
    normalizeQualityResult({
      name: 'ocr',
      pass: true,
      message: 'missing',
      status: 'unsupported',
    }),
  ).toThrow('contradicts');
  expect(() =>
    normalizeQualityResult({
      name: 'pixels',
      pass: false,
      message: 'bad',
      status: 'passed',
    }),
  ).toThrow('contradicts');
});
