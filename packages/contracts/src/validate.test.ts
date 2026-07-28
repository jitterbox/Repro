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
  it.each(SCHEMA_NAMES)('validates %s fixture', (schemaName) => {
    const data = loadFixture(schemaName);
    const result = validateAgainst(schemaName, data);
    expect(result.valid, result.errors?.join('\n')).toBe(true);
  });

  it('rejects invalid event payloads', () => {
    const result = validateAgainst('event', {
      schemaVersion: '1.0.0',
      type: 'pointer',
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
});

describe('zod mirrors', () => {
  it('parses capability fixture', () => {
    const data = loadFixture('capability');
    const parsed = parseCapabilityDescriptor(data);
    expect(parsed.id).toBe('capture/playwright');
    expect(parsed.determinism.level).toBe('best-effort');
  });

  it('parses config fixture', () => {
    const data = loadFixture('config');
    const parsed = parseReproConfig(data);
    expect(parsed.mode).toBe('repro');
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
