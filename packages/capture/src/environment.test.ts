import { describe, expect, it } from 'vitest';

import {
  collectEnvironmentManifest,
  prettyBrowser,
  prettyOs,
} from './environment.js';

import type { EnvironmentPage } from './environment.js';

describe('collectEnvironmentManifest', () => {
  it('collects browser, viewport, locale, tool, and runtime metadata', async () => {
    const commands: string[] = [];
    const manifest = await collectEnvironmentManifest({
      arch: 'x64',
      browser: { version: () => '131.0.0' },
      build: 'main @ abcdef1',
      gpuMode: 'cpu',
      nodeVersion: 'v22.0.0',
      page: localePage('en-GB', 'Europe/London'),
      platform: 'linux',
      playwrightVersion: '1.62.0',
      runVersionCommand: (command) => {
        commands.push(command);
        return Promise.resolve(`${command} version 6.1`);
      },
      viewport: {
        deviceScaleFactor: 2,
        height: 768,
        width: 1024,
      },
    });

    expect(manifest).toMatchObject({
      arch: 'x64',
      browserLabel: 'Chromium 131.0.0',
      browserVersion: '131.0.0',
      build: 'main @ abcdef1',
      ffmpegVersion: 'ffmpeg version 6.1',
      ffprobeVersion: 'ffprobe version 6.1',
      gpuMode: 'cpu',
      locale: 'en-GB',
      nodeVersion: 'v22.0.0',
      osLabel: 'Linux',
      platform: 'linux',
      playwrightVersion: '1.62.0',
      schemaVersion: 1,
      timezone: 'Europe/London',
      viewport: {
        deviceScaleFactor: 2,
        height: 768,
        width: 1024,
      },
    });
    expect(commands.sort()).toEqual(['ffmpeg', 'ffprobe']);
    expect(manifest.fontManifest.length).toBeGreaterThan(0);
    expect(manifest.fontManifest[0]?.family).not.toBe('unknown');
  });

  it('formats browser and OS labels', () => {
    expect(prettyBrowser('131.0.0')).toBe('Chromium 131.0.0');
    expect(prettyOs('linux')).toBe('Linux');
  });
});

function localePage(locale: string, timezone: string): EnvironmentPage {
  return {
    evaluate: <T>() => Promise.resolve({ locale, timezone } as T),
  };
}
