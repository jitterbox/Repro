import { expect, it } from 'vitest';
import { validateEvidence } from '@repro/contracts';
import { compileScene } from './scene.js';

const spec = validateEvidence({
  schemaVersion: '1.0.0',
  id: 'transient',
  title: 'Transient',
  variant: { id: 'before', role: 'before', label: 'Before' },
  claim: 'Content flashes',
  expected: 'Content stays visible',
  steps: [{ id: 'load', title: 'Load', trigger: true }],
  segments: [{ id: 'load', step: 'load', title: 'Load' }],
  checkpoints: [
    {
      id: 'during',
      step: 'load',
      title: 'During load',
      observations: ['screenshot'],
      timing: 'transient',
      frame: {
        segment: 'load',
        event: { kind: 'pointer', match: {}, occurrence: 0 },
        offsetMs: 100,
        maxOffsetMs: 50,
      },
    },
  ],
  outputs: ['mp4'],
});
const run: Parameters<typeof compileScene>[0]['run'] = {
  steps: [{ id: 'load', title: 'Load', index: 1, startMs: 0, endMs: 300 }],
  segments: [
    {
      id: 'load',
      title: 'Load',
      step: 'load',
      pageId: 'page',
      startMs: 10,
      endMs: 250,
      status: 'passed',
    },
  ],
  durationMs: 300,
  observations: [],
  scenarioOutcome: 'inconclusive',
};
const input = {
  spec,
  run,
  events: [],
  viewport: { width: 1280, height: 720 },
  offset: 0,
  treatments: {
    schemaVersion: '1.0.0',
    treatments: [
      {
        id: 'replay',
        kind: 'slowmo',
        segment: 'load',
        title: 'Replay',
        rationale: 'Inspect a captured flash',
        rate: 0.1,
      },
    ],
  },
};
it('refuses to turn a missed transient into slow-motion proof', () => {
  expect(() => compileScene(input)).toThrow(
    'captured transient checkpoint required',
  );
});
it('replays an observed interval without inventing source time', () => {
  const plan = compileScene({
    ...input,
    run: {
      ...run,
      observations: [
        {
          id: 'shot',
          kind: 'screenshot',
          checkpoint: 'during',
          pageId: 'page',
          timeMs: 100,
          status: 'passed',
          artifact: 'shot.png',
        },
      ],
    },
  });
  expect(plan.segments.find((s) => s.id === 'replay')).toMatchObject({
    kind: 'play',
    sourceStartMs: 10,
    outDurationMs: 2400,
    rate: 0.1,
  });
});
it('fails a required panel with missing observations; optional panels can be omitted', () => {
  const panel = {
    id: 'console',
    kind: 'data-panel',
    eventKind: 'browser.console',
    title: 'Console',
    rationale: 'Explain failure',
  };
  expect(() =>
    compileScene({
      ...input,
      treatments: { schemaVersion: '1.0.0', treatments: [panel] },
    }),
  ).toThrow('no recorded');
  const plan = compileScene({
    ...input,
    treatments: {
      schemaVersion: '1.0.0',
      treatments: [{ ...panel, required: false }],
    },
  });
  expect(plan.cues.some((c) => c.id === 'console')).toBe(false);
});
it('keeps a treated bug readable for five full seconds and unifies numbered step panels', () => {
  const plan = compileScene({
    ...input,
    run: {
      ...run,
      observations: [
        {
          id: 'bounds',
          kind: 'bounds',
          checkpoint: 'during',
          target: 'target',
          pageId: 'page',
          timeMs: 100,
          status: 'passed',
          bounds: { x: 20, y: 20, width: 80, height: 30 },
        },
        {
          id: 'shot',
          kind: 'screenshot',
          checkpoint: 'during',
          pageId: 'page',
          timeMs: 100,
          status: 'passed',
          artifact: 'shot.png',
        },
      ],
    },
    treatments: {
      schemaVersion: '1.0.0',
      steps: [{ step: 'load', text: 'Observe the title.' }],
      treatments: [
        {
          id: 'bug',
          kind: 'callout',
          checkpoint: 'during',
          target: 'target',
          title: 'Wrong title',
          rationale: 'Measured title',
          severity: 'critical',
        },
      ],
    },
    events: [
      {
        id: 'down',
        kind: 'probe.pointer:path',
        pageId: 'page',
        t_mono: 50,
        payload: {
          phase: 'pointerdown',
          coordinateSpace: 'viewport-css',
          x: 10,
          y: 10,
        },
      },
    ],
  });
  const bug = plan.cues.find((c) => c.id === 'bug');
  if (!bug) throw new Error('Missing bug cue');
  expect(bug.endMs - bug.startMs - 350).toBeGreaterThanOrEqual(5000);
  const marker = plan.cues.find((c) => c.id === 'marker-load');
  expect(marker).toMatchObject({
    startMs: 50,
    step: 1,
    detail: 'Observe the title.',
  });
  expect(plan.cues.some((c) => c.id === 'step-load')).toBe(false);
  expect(plan.cursorSamples).toEqual([
    { x: 10, y: 10, timeMs: 50, pageId: 'page', phase: 'pointerdown' },
  ]);
});

it('compiles project preferences into scene dimensions without changing the source viewport', () => {
  const scene = compileScene({
    ...input,
    treatments: {
      schemaVersion: '1.0.0',
      style: { cardWidth: 400, outerInset: 32, gutterGap: 40, sourceTop: 120 },
      encoding: { crf: 22, preset: 'slow' },
      treatments: [],
    },
  });
  expect(scene.output.width).toBe(1280 + 400 + 64 + 40);
  expect(scene.sourceOrigin).toEqual({ x: 32, y: 120 });
  expect(scene.viewport).toEqual({ width: 1280, height: 720 });
  expect(scene.encoding).toEqual({ crf: 22, preset: 'slow' });
});

it('keeps known app version context for every output segment and omits absent metadata', () => {
  const plain = { ...input, treatments: { schemaVersion: '1.0.0' } };
  expect(compileScene(plain).cues.some((c) => c.kind === 'app-version')).toBe(
    false,
  );
  const scene = compileScene({
    ...plain,
    appVersion: 'Version 2.7.1\nBuild qa-42',
  });
  const cue = scene.cues.find((c) => c.kind === 'app-version');
  expect(cue).toMatchObject({
    startMs: 0,
    detail: 'Version 2.7.1\nBuild qa-42',
    layer: 60,
  });
  expect(cue?.endMs).toBe(
    scene.segments.reduce((sum, segment) => sum + segment.outDurationMs, 0),
  );
});
