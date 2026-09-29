import { describe, expect, it } from 'vitest';
import { parseScenePlan, parseTreatmentPlan, sceneSourceAt } from './scene.js';
const scene = () =>
  parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: 1280, height: 720 },
    output: { width: 1688, height: 864, fps: 30 },
    sourceOrigin: { x: 24, y: 96 },
    cues: [],
    segments: [
      {
        id: 'original',
        kind: 'play',
        outStartMs: 0,
        outDurationMs: 1000,
        sourceStartMs: 500,
        rate: 1,
      },
      {
        id: 'hold',
        kind: 'hold',
        outStartMs: 1000,
        outDurationMs: 500,
        sourceStartMs: 1490,
        rate: 0,
      },
      {
        id: 'replay',
        kind: 'play',
        outStartMs: 1500,
        outDurationMs: 2000,
        sourceStartMs: 700,
        rate: 0.1,
      },
    ],
  });
describe('scene source occurrences', () => {
  it('maps holds and replay without requiring monotone source time', () => {
    const plan = scene();
    expect(sceneSourceAt(plan, 100)?.sourceMs).toBe(600);
    expect(sceneSourceAt(plan, 1100)?.sourceMs).toBe(1490);
    expect(sceneSourceAt(plan, 1499)?.sourceMs).toBe(1490);
    expect(sceneSourceAt(plan, 1600)?.sourceMs).toBe(710);
    expect(sceneSourceAt(plan, 3500)).toBeNull();
  });
  it('has no source time for a title insertion', () => {
    const plan = scene();
    plan.segments = [
      {
        id: 'intro',
        kind: 'insert',
        outStartMs: 0,
        outDurationMs: 500,
        rate: 0,
      },
    ];
    expect(sceneSourceAt(parseScenePlan(plan), 100)).toBeNull();
  });
  it('rejects gaps, invalid rates and missing source times', () => {
    const plan = scene();
    const hold = plan.segments[1],
      first = plan.segments[0];
    if (!hold || !first) throw new Error('Missing fixture');
    hold.outStartMs = 1001;
    expect(() => parseScenePlan(plan)).toThrow('contiguous');
    hold.outStartMs = 1000;
    hold.rate = 1;
    expect(() => parseScenePlan(plan)).toThrow('rate');
    delete first.sourceStartMs;
    expect(() => parseScenePlan(plan)).toThrow('source time');
  });
});
describe('treatment intent', () => {
  it('requires measured evidence references and a rationale', () => {
    expect(() =>
      parseTreatmentPlan({
        schemaVersion: '1.0.0',
        treatments: [
          {
            id: 'zoom',
            kind: 'magnifier',
            title: 'Detail',
            rationale: 'Small defect',
          },
        ],
      }),
    ).toThrow('checkpoint');
    expect(() =>
      parseTreatmentPlan({
        schemaVersion: '1.0.0',
        treatments: [
          {
            id: 'gap',
            kind: 'alignment',
            title: 'Gap',
            rationale: 'Alignment',
            checkpoint: 'result',
            target: 'box',
          },
        ],
      }),
    ).toThrow('reference');
  });
  it('rejects duplicate IDs and undeclared executable content', () => {
    const t = {
      id: 'slow',
      kind: 'slowmo',
      segment: 'load',
      title: 'Replay',
      rationale: 'Fast transient',
    };
    expect(() =>
      parseTreatmentPlan({ schemaVersion: '1.0.0', treatments: [t, t] }),
    ).toThrow('Duplicate');
    expect(() =>
      parseTreatmentPlan({
        schemaVersion: '1.0.0',
        treatments: [{ ...t, script: 'alert(1)' }],
      }),
    ).toThrow();
  });
});

it('defaults nested preferences and rejects unsafe CSS and unreadable settings', async () => {
  const { parseTreatmentPlan } = await import('./scene.js');
  const plan = parseTreatmentPlan({
    schemaVersion: '1.0.0',
    style: { bodyFontSize: 22 },
    encoding: { crf: 24 },
  });
  expect(plan.style.bodyFontSize).toBe(22);
  expect(plan.style.cardWidth).toBe(336);
  expect(plan.timing.readingHoldMs).toBe(5400);
  expect(plan.encoding).toEqual({ crf: 24, preset: 'veryfast' });
  for (const override of [
    { style: { background: 'red; background:url(https://example.com)' } },
    { timing: { readingHoldMs: 500 } },
    { encoding: { preset: 'shell-command' } },
    { style: { arbitraryCss: 'x' } },
  ])
    expect(() =>
      parseTreatmentPlan({ schemaVersion: '1.0.0', ...override }),
    ).toThrow();
});
