import { expect, it } from 'vitest';
import { appVersionLabel } from './app-version.js';
import { ReproConfigSchema } from '@repro/core';
import type { RunManifest } from '@repro/contracts';

const config = ReproConfigSchema.parse({
  mode: 'repro',
  profile: 'controlled',
  surfaceCapture: 'page',
  viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const run = {
  build: { id: null, url: null },
  environment: { build: 'evidence-repository-sha', nodeVersion: '22' },
} as unknown as RunManifest;
it('shows only target-app values, defaults on, honors overrides and privacy', () => {
  expect(appVersionLabel(run, config, [])).toBeUndefined();
  const captured = {
    ...run,
    environment: {
      ...run.environment,
      appVersion: {
        version: '2.7.1',
        build: 'qa-42',
        sources: { version: 'runtime', build: 'runtime' },
      },
    },
  };
  expect(appVersionLabel(captured, config, [])).toBe(
    'Version 2.7.1\nBuild qa-42',
  );
  expect(
    appVersionLabel(captured, config, [], {
      appVersion: '3.0.0',
      buildId: 'build-99',
    }),
  ).toBe('Version 3.0.0\nBuild build-99');
  expect(appVersionLabel(captured, config, ['qa-\\d+'])).toBe(
    'Version 2.7.1\nBuild [redacted]',
  );
  expect(
    appVersionLabel(captured, config, [], { versionOverlay: false }),
  ).toBeUndefined();
  const disabled = {
    ...config,
    versionOverlay: { enabled: false, discover: true },
  };
  expect(appVersionLabel(captured, disabled, [])).toBeUndefined();
  expect(
    appVersionLabel(captured, disabled, [], { versionOverlay: true }),
  ).toContain('2.7.1');
});
