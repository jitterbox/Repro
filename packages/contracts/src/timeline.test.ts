import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  timelineSchema,
  timelineJsonSchema,
  parseTimeline,
} from './timeline.js';

const fixture = () =>
  parseTimeline(
    JSON.parse(
      readFileSync(
        new URL('../fixtures/timeline.valid.json', import.meta.url),
        'utf8',
      ),
    ),
  );
it('publishes timeline structure from Zod with matching fractional and tuple constraints', () => {
  expect(
    JSON.parse(
      readFileSync(
        new URL('../schemas/timeline.schema.json', import.meta.url),
        'utf8',
      ),
    ),
  ).toEqual(timelineJsonSchema);
  const check = new Ajv2020({ strict: true }).compile(timelineJsonSchema);
  const base = fixture();
  const values = [
    base,
    { ...base, targetDurationMs: 12.5 },
    { ...base, fps: 60 },
    { ...base, beats: [] },
    ...[[0], [0, 0, 0], [-1, 0]].map((knot) => ({
      ...base,
      timeMap: { kind: 'piecewise-linear', knots: [knot] },
    })),
  ];
  values.forEach((value, index) => {
    expect(check(value)).toBe(timelineSchema.safeParse(value).success);
    expect(check(value)).toBe(index < 2);
  });
});
it('allows holds at one capture instant but rejects reversed timing centrally', () => {
  const base = fixture();
  expect(() => parseTimeline(base)).not.toThrow();
  expect(() =>
    parseTimeline({
      ...base,
      timeMap: {
        kind: 'piecewise-linear',
        knots: [
          [0, 0],
          [1, 2],
          [0.5, 3],
        ],
      },
    }),
  ).toThrow('monotone');
  expect(() =>
    parseTimeline({
      ...base,
      beats: [{ ...base.beats[1], captureStartMs: 10, captureEndMs: 9 }],
    }),
  ).toThrow('reversed');
});
