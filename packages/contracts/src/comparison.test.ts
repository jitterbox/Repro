import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  compareCompositionSchema,
  compareCompositionJsonSchema,
  parseCompareComposition,
} from './comparison.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/compare-composition.valid.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;

it('publishes the authoritative generated schema at the compatibility path', () => {
  expect(
    JSON.parse(
      readFileSync(
        new URL('../schemas/compare-composition.schema.json', import.meta.url),
        'utf8',
      ),
    ),
  ).toEqual(compareCompositionJsonSchema);
});

it('keeps comparison Zod and generated JSON Schema structural validation in parity', () => {
  const check = new Ajv2020({ strict: true }).compile(
    compareCompositionJsonSchema,
  );
  const base = parseCompareComposition(fixture());
  const examples = [
    base,
    { ...base, layout: 'unknown' },
    { ...base, output: { ...base.output, width: 0 } },
    { ...base, output: { ...base.output, filename: '../overwrite.mp4' } },
    { ...base, output: { ...base.output, filename: 'bad\u0000.mp4' } },
    { ...base, sync: { ...base.sync, knots: [[0, 0, 0, 1.1]] } },
    { ...base, sync: { ...base.sync, knots: [[0, -1, 0, 1]] } },
    { ...base, sync: { ...base.sync, knots: [[0, 0, 0]] } },
    { ...base, sync: { ...base.sync, knots: [[0, 0, 0, 1, 2]] } },
  ];
  expect(check(base)).toBe(true);
  const originalTiming = { ...base, sync: { ...base.sync, knots: [] } };
  expect(check(originalTiming)).toBe(true);
  expect(parseCompareComposition(originalTiming).sync.knots).toEqual([]);
  for (const value of examples)
    expect(check(value)).toBe(
      compareCompositionSchema.safeParse(value).success,
    );
  for (const value of examples.slice(1)) expect(check(value)).toBe(false);
});

it('rejects ambiguous synchronization, swapped roles and invented ROI bounds centrally', () => {
  const base = parseCompareComposition(fixture());
  for (const knots of [
    [
      [0, 0, 0, 1],
      [0, 10, 10, 1],
    ],
    [
      [0, 0, 0, 1],
      [10, 10, 0, 1],
    ],
    [
      [0, 0, 0, 1],
      [10, 10, 20, 1],
      [5, 20, 30, 1],
    ],
  ])
    expect(() =>
      parseCompareComposition({ ...base, sync: { ...base.sync, knots } }),
    ).toThrow('strictly increase');
  expect(() =>
    parseCompareComposition({
      ...base,
      panes: { a: base.panes.b, b: base.panes.a },
    }),
  ).toThrow('before (a)');
  expect(() =>
    parseCompareComposition({ ...base, layout: 'cropped-roi' }),
  ).toThrow('measured shared crop');
  expect(() => parseCompareComposition({ ...base, layout: 'blink' })).toThrow(
    'opt-in',
  );
});
