import { describe, expect, it } from 'vitest';

import { canShowActions } from './capture-session.js';

import type { ReproConfig } from '@jitterbox/repro-core';

const baseConfig = {
  capturePreviewUi: true,
  features: {},
  metadata: {},
  mode: 'repro',
  profile: 'controlled',
  showActions: true,
  surfaceCapture: 'page',
  viewport: {
    deviceScaleFactor: 1,
    height: 720,
    width: 1280,
  },
} satisfies ReproConfig;

describe('capture showActions eligibility', () => {
  it('allows burned-in actions only with capturePreviewUi and no conflicts', () => {
    expect(canShowActions(baseConfig)).toBe(true);
    expect(canShowActions({ ...baseConfig, capturePreviewUi: false })).toBe(
      false,
    );
    expect(canShowActions({ ...baseConfig, timingSensitive: true })).toBe(
      false,
    );
    expect(canShowActions({ ...baseConfig, showActions: false })).toBe(false);
    expect(
      canShowActions({
        ...baseConfig,
        compare: { streams: ['pixel-diff'] },
      }),
    ).toBe(false);
  });
});
