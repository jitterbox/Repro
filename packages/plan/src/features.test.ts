import { describe, expect, it } from 'vitest';

import { emitFeatureAnnotations } from './features.js';

import type { EventRecord, ReproConfig } from '@repro/core';

const config = {
  features: {
    a11yOverlay: true,
    hiddenElements: true,
    hitTargets: true,
    layoutShiftViz: true,
    voiceover: true,
  },
  metadata: {},
  mode: 'repro',
  profile: 'controlled',
  surfaceCapture: 'page',
  viewport: {
    deviceScaleFactor: 1,
    height: 720,
    width: 1280,
  },
} satisfies ReproConfig;

describe('feature annotation emitters', () => {
  it('emits annotations and narration stubs for feature events', () => {
    const result = emitFeatureAnnotations({
      config,
      events: [
        event('a11y-1', 'probe.axe.violation', {
          height: 30,
          impact: 'critical',
          rule: 'button-name',
          width: 80,
          x: 10,
          y: 20,
        }),
        event('hidden-1', 'probe.aria-hidden', {
          height: 20,
          label: 'Hidden submit button',
          width: 90,
          x: 30,
          y: 40,
        }),
        event('hit-1', 'probe.elementsFromPoint', {
          height: 8,
          label: 'Small target',
          width: 8,
          x: 50,
          y: 60,
        }),
        event('cls-1', 'web-vitals.layout-shift', {
          score: 0.12,
          sources: [{ height: 6, width: 6, x: 70, y: 80 }],
        }),
        event('vo-1', 'narration.voiceover', {
          durationMs: 2000,
          text: 'Explain the save failure',
        }),
      ],
      frames: [],
      viewport: config.viewport,
    });

    expect(result.annotations.map((item) => item.feature)).toEqual(
      expect.arrayContaining([
        'a11yOverlay',
        'hiddenElements',
        'hitTargets',
        'layoutShiftViz',
      ]),
    );
    expect(result.annotations).toContainEqual(
      expect.objectContaining({
        feature: 'a11yOverlay',
        severity: 'critical',
      }),
    );
    const layoutShift = result.annotations.find((item) => {
      return item.feature === 'layoutShiftViz';
    });
    expect(layoutShift?.target).toMatchObject({ height: 24, width: 24 });
    expect(result.chapters).toContainEqual(
      expect.objectContaining({ title: 'Explain the save failure' }),
    );
    expect(result.narrationSegments).toEqual([
      expect.objectContaining({ text: 'Explain the save failure' }),
    ]);
  });
});

function event(
  id: string,
  kind: string,
  payload: EventRecord['payload'],
): EventRecord {
  return {
    hash: 'a'.repeat(64),
    id,
    kind,
    pageId: 'page-1',
    payload,
    runId: 'run-1',
    schemaVersion: 1,
    seq: 1,
    t_mono: 100,
  };
}
