import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SCHEMA_NAMES,
  capabilityDescriptorSchema,
  parseCapabilityDescriptor,
  parseReproConfig,
  reproConfigSchema,
  validateAgainst,
} from './index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures');

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(fixturesDir, `${name}.valid.json`), 'utf8');
  return JSON.parse(raw) as unknown;
}

describe('validateAgainst', () => {
  it('accepts fractional milliseconds for frame-aligned transitions', () => {
    const fixture = loadFixture('timeline') as Record<string, unknown>;
    const transition = (ms: number) => ({
      ...fixture,
      beats: [
        {
          id: 'hold',
          kind: 'hold',
          source: 'capture',
          captureAtMs: 0,
          rate: 1,
          outStartMs: 0,
          outDurationMs: 1000,
          transitionOut: { kind: 'dissolve', ms },
        },
      ],
    });
    expect(validateAgainst('timeline', transition(1000 / 3)).valid).toBe(true);
    expect(validateAgainst('timeline', transition(-1)).valid).toBe(false);
  });
  it.each(SCHEMA_NAMES)('validates %s fixture', (schemaName) => {
    const data = loadFixture(schemaName);
    const result = validateAgainst(schemaName, data);
    expect(result.valid, result.errors?.join('\n')).toBe(true);
  });

  it('rejects invalid event payloads', () => {
    const result = validateAgainst('event', {
      schemaVersion: 1,
      kind: 'pointer',
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('rejects invalid capability id format', () => {
    const fixture = loadFixture('capability') as Record<string, unknown>;
    const result = validateAgainst('capability', {
      ...fixture,
      id: 'Invalid_ID',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects step-badge without step payload', () => {
    const result = validateAgainst('visual-cue', {
      schemaVersion: '1.0.0',
      id: 'bad-step',
      component: 'step-badge',
      severity: 'info',
      outTimeRange: { start: 0, end: 1000 },
      renderer: 'ass',
      layer: 8,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects outcome-pair without outcome payload', () => {
    const result = validateAgainst('visual-cue', {
      schemaVersion: '1.0.0',
      id: 'bad-outcome',
      component: 'outcome-pair',
      severity: 'info',
      outTimeRange: { start: 0, end: 1000 },
      renderer: 'compositor',
      layer: 9,
    });
    expect(result.valid).toBe(false);
  });
});

describe('zod mirrors', () => {
  it('parses capability fixture', () => {
    const data = loadFixture('capability');
    const parsed = parseCapabilityDescriptor(data);
    expect(parsed.id).toBe('capture/playwright');
    expect(parsed.determinism.level).toBe('best-effort');
  });

  it('parses config fixture via @repro/core', () => {
    const data = loadFixture('config');
    const parsed = parseReproConfig(data);
    expect(parsed.mode).toBe('repro');
    expect(parsed.profile).toBe('faithful');
  });

  it('matches ajv for capability fixture', () => {
    const data = loadFixture('capability');
    capabilityDescriptorSchema.parse(data);
    const ajvResult = validateAgainst('capability', data);
    expect(ajvResult.valid).toBe(true);
  });

  it('matches ajv for config fixture', () => {
    const data = loadFixture('config');
    reproConfigSchema.parse(data);
    const ajvResult = validateAgainst('config', data);
    expect(ajvResult.valid).toBe(true);
  });
});

it('keeps generated config defaults and new capture options in structural parity', () => {
  const base = loadFixture('config') as Record<string, unknown>;
  const candidates = [
    base,
    { ...base, capture: { backend: 'cdp', trace: false } },
    { ...base, capture: { backend: 'unknown' } },
    { ...base, viewport: { width: 0, height: 720 } },
    { ...base, unexpected: true },
  ];
  for (const candidate of candidates)
    expect(validateAgainst('config', candidate).valid).toBe(
      reproConfigSchema.safeParse(candidate).success,
    );
});
