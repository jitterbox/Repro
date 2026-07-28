import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { compareRuns } from './index.js';

import type { CompareManifest, EnvironmentManifest } from './index.js';

const baseEnvironment: EnvironmentManifest = {
  browserVersion: 'chromium 1.2.3',
  locale: 'en-US',
  playwrightVersion: '1.62.0',
  viewport: {
    deviceScaleFactor: 1,
    height: 720,
    width: 1280,
  },
};

describe('compareRuns', () => {
  it('returns every compare layout from compareRepros', async () => {
    const result = await compareRuns({
      left: manifest(baseEnvironment),
      right: manifest(baseEnvironment),
    });

    expect(Object.keys(result.layouts).sort()).toEqual([
      'blink',
      'difference',
      'edgeOverlay',
      'onion',
      'sideBySide',
      'wipe',
    ]);
  });

  it('rejects material environment drift by default', async () => {
    const result = await compareRuns({
      left: manifest(baseEnvironment),
      right: manifest({
        ...baseEnvironment,
        browserVersion: 'chromium 9.9.9',
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.equal).toBe(false);
    expect(result.envDrift.failed).toBe(true);
    expect(result.envDrift.differences).toContainEqual({
      field: 'browserVersion',
      left: 'chromium 1.2.3',
      material: true,
      right: 'chromium 9.9.9',
    });
  });

  it('allows material environment drift when overridden', async () => {
    const result = await compareRuns({
      left: manifest(baseEnvironment),
      overrideEnvDrift: true,
      right: manifest({
        ...baseEnvironment,
        playwrightVersion: '1.63.0',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.envDrift.failed).toBe(false);
    expect(result.envDrift.overridden).toBe(true);
  });

  it('loads compare manifests from JSON paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repro-compare-'));

    try {
      const left = join(directory, 'left.json');
      const right = join(directory, 'right.json');
      await writeFile(left, JSON.stringify(manifest(baseEnvironment)));
      await writeFile(right, JSON.stringify(manifest(baseEnvironment)));

      const result = await compareRuns({ left, right });

      expect(result.ok).toBe(true);
      expect(result.left).toBe(left);
      expect(result.right).toBe(right);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

function manifest(environment: EnvironmentManifest): CompareManifest {
  return {
    environment,
    geometry: [
      {
        bounds: { h: 20, w: 100, x: 0, y: 0 },
        path: 'main/button',
        testId: 'button',
      },
    ],
    schemaVersion: 1,
    steps: [
      {
        durationMs: 100,
        id: 'click',
        label: 'Click button',
        startMs: 0,
      },
    ],
  };
}
