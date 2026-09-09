import { describe, expect, it } from 'vitest';

import { buildPlan } from './planner.js';

import type { EventRecord, ReproConfig } from '@repro/core';

const config = {
  features: {
    specCard: true,
    steps: true,
  },
  metadata: { bugId: 'BUG-TEST' },
  mode: 'repro',
  profile: 'controlled',
  surfaceCapture: 'page',
  viewport: {
    deviceScaleFactor: 1,
    height: 720,
    width: 1280,
  },
} satisfies ReproConfig;

describe('buildPlan capture clock', () => {
  it('uses relative capture duration from absolute t_mono', () => {
    const origin = 101_606_052;
    const plan = buildPlan({
      config,
      bugId: 'BUG-TEST',
      events: [
        event('open', 'page.open', {}, origin),
        event(
          'click',
          'pointer.click',
          { x: 40, y: 40, width: 80, height: 24 },
          origin + 1_200,
        ),
        event(
          'env',
          'capture.environment',
          {
            manifest: {
              browserLabel: 'Chromium 131.0.0',
              osLabel: 'Linux',
            },
          },
          origin + 4_000,
        ),
      ],
      frames: [],
      viewport: config.viewport,
    });

    expect(plan.metadata.durationMs).toBeLessThan(60_000);
    expect(plan.metadata.durationMs).toBeGreaterThanOrEqual(15_000);

    const body = plan.timeline.beats.find((beat) => beat.kind === 'play');
    expect(body?.captureStartMs).toBe(0);
    expect(body?.captureEndMs).toBeLessThanOrEqual(4_001);
  });

  it('clamps capture duration to mediaDurationMs', () => {
    const origin = 50_000;
    const plan = buildPlan({
      config,
      bugId: 'BUG-TEST',
      mediaDurationMs: 1_500,
      events: [
        event('open', 'page.open', {}, origin),
        event('end', 'capture.environment', {}, origin + 8_000),
      ],
      frames: [],
      viewport: config.viewport,
    });

    const body = plan.timeline.beats.find((beat) => beat.kind === 'play');
    expect(body?.captureEndMs).toBeLessThanOrEqual(1_500);
    expect(plan.metadata.durationMs).toBeGreaterThanOrEqual(15_000);
    expect(plan.metadata.durationMs).toBeLessThanOrEqual(30_000);
  });
});

function event(
  id: string,
  kind: string,
  payload: Record<string, unknown>,
  tMono: number,
): EventRecord {
  return {
    id,
    kind,
    runId: 'test',
    pageId: 'page-1',
    seq: 1,
    schemaVersion: 1,
    hash: 'a'.repeat(64),
    payload,
    t_mono: tMono,
    t_epoch: 0,
  } as EventRecord;
}
