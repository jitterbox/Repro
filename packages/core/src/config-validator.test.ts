import { describe, expect, it } from 'vitest';

import { validateConfig } from './config-validator.js';

import type { ReproConfig } from './schema.js';

const baseConfig = {
  features: {},
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

describe('validateConfig', () => {
  it('accepts a valid repro config', () => {
    expect(validateConfig(baseConfig)).toMatchObject({
      errors: [],
      ok: true,
    });
  });

  it('rejects compare mode without a controlled profile', () => {
    const result = validateConfig({
      ...baseConfig,
      mode: 'compare',
      profile: 'faithful',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'profile' }),
    );
  });

  it('rejects action overlays for timing-sensitive pixel diffs', () => {
    const result = validateConfig({
      ...baseConfig,
      compare: { streams: ['pixel-diff'] },
      showActions: true,
      timingSensitive: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('rejects onion and difference viewport mismatches', () => {
    const result = validateConfig({
      ...baseConfig,
      compare: {
        strategy: 'onion',
        viewports: [
          baseConfig.viewport,
          { deviceScaleFactor: 2, height: 720, width: 1280 },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'compare.viewports' }),
    );
  });

  it('rejects voiceover with preserveRealTiming', () => {
    const result = validateConfig({
      ...baseConfig,
      features: { voiceover: true },
      preserveRealTiming: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'features.voiceover' }),
    );
  });

  it('treats redaction.strict as a feature gate', () => {
    const result = validateConfig({
      ...baseConfig,
      redaction: { strict: true },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'redaction.strict' }),
    );
  });
});
