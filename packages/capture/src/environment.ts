import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { arch, platform } from 'node:process';

import type { Viewport } from '@repro/core';
import type { Browser } from 'playwright';

export interface EnvironmentViewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

export interface FontManifestEntry {
  readonly family: string;
  readonly source: string;
  readonly sha256: string | null;
}

export interface EnvironmentManifest {
  readonly schemaVersion: 1;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
  readonly playwrightVersion: string;
  readonly browserVersion: string;
  readonly viewport: EnvironmentViewport;
  readonly locale: string;
  readonly timezone: string;
  readonly ffmpegVersion: string | null;
  readonly ffprobeVersion: string | null;
  readonly gpuMode: 'cpu' | 'unknown';
  readonly fontManifest: readonly FontManifestEntry[];
}

export type VersionCommandRunner = (
  command: string,
) => Promise<string | null>;

export interface EnvironmentPage {
  evaluate<T>(pageFunction: () => T): Promise<T>;
}

export interface CollectEnvironmentOptions {
  readonly browser?: Pick<Browser, 'version'>;
  readonly page?: EnvironmentPage;
  readonly viewport: Viewport;
  readonly runVersionCommand?: VersionCommandRunner;
  readonly nodeVersion?: string;
  readonly platform?: string;
  readonly arch?: string;
  readonly playwrightVersion?: string;
  readonly gpuMode?: 'cpu' | 'unknown';
}

interface PageLocaleInfo {
  readonly locale: string;
  readonly timezone: string;
}

const require = createRequire(import.meta.url);

export async function collectEnvironmentManifest(
  options: CollectEnvironmentOptions,
): Promise<EnvironmentManifest> {
  const runVersionCommand = options.runVersionCommand ?? runVersionCommandFrom;
  const [pageInfo, ffmpegVersion, ffprobeVersion] = await Promise.all([
    pageLocaleInfo(options.page),
    runVersionCommand('ffmpeg'),
    runVersionCommand('ffprobe'),
  ]);

  return {
    arch: options.arch ?? arch,
    browserVersion: options.browser?.version() ?? 'unknown',
    ffmpegVersion,
    ffprobeVersion,
    fontManifest: fontManifestStub(),
    gpuMode: options.gpuMode ?? 'unknown',
    locale: pageInfo.locale,
    nodeVersion: options.nodeVersion ?? process.version,
    platform: options.platform ?? platform,
    playwrightVersion: options.playwrightVersion ?? playwrightVersion(),
    schemaVersion: 1,
    timezone: pageInfo.timezone,
    viewport: {
      deviceScaleFactor: options.viewport.deviceScaleFactor,
      height: options.viewport.height,
      width: options.viewport.width,
    },
  };
}

export function runVersionCommandFrom(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(command, ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 2_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
    });
    child.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timeout);
      resolve(firstVersionLine(output));
    });
  });
}

async function pageLocaleInfo(
  page: EnvironmentPage | undefined,
): Promise<PageLocaleInfo> {
  if (page === undefined) {
    return { locale: 'unknown', timezone: 'unknown' };
  }

  return page.evaluate(() => {
    const options = Intl.DateTimeFormat().resolvedOptions();

    return {
      locale: options.locale,
      timezone: options.timeZone,
    };
  });
}

function firstVersionLine(output: string): string | null {
  const line = output
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .find((item) => item.length > 0);

  return line ?? null;
}

function fontManifestStub(): readonly FontManifestEntry[] {
  return [{ family: 'unknown', sha256: null, source: 'stub' }];
}

function playwrightVersion(): string {
  const manifest = require('playwright/package.json') as {
    readonly version?: unknown;
  };

  return typeof manifest.version === 'string' ? manifest.version : 'unknown';
}
