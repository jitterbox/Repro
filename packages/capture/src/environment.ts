import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { arch, platform } from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Viewport } from '@jitterbox/repro-core';
import type { Browser } from 'playwright';

const execFileAsync = promisify(execFile);

export interface EnvironmentViewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

export type { FontManifestEntry } from '@jitterbox/repro-core';
import { enumerateFonts, type FontManifestEntry } from '@jitterbox/repro-core';

export interface EnvironmentManifest {
  readonly reproTracing?: {
    readonly started: boolean;
    readonly screenshots: false;
    readonly snapshots: boolean;
  };
  readonly schemaVersion: 1;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
  readonly osLabel: string;
  readonly browserLabel: string;
  readonly playwrightVersion: string;
  readonly browserVersion: string;
  readonly build: string;
  readonly viewport: EnvironmentViewport;
  readonly viewportSource: 'page' | 'requested';
  readonly reducedMotion: boolean | null;
  readonly locale: string;
  readonly timezone: string;
  readonly ffmpegVersion: string | null;
  readonly ffprobeVersion: string | null;
  readonly gpuMode: 'cpu' | 'unknown';
  readonly fontManifest: readonly FontManifestEntry[];
}

export type VersionCommandRunner = (command: string) => Promise<string | null>;

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
  readonly build?: string;
}

interface PageLocaleInfo {
  readonly viewport?: EnvironmentViewport;
  readonly reducedMotion?: boolean;
  readonly locale: string;
  readonly timezone: string;
}

const require = createRequire(import.meta.url);

export async function collectEnvironmentManifest(
  options: CollectEnvironmentOptions,
): Promise<EnvironmentManifest> {
  const runVersionCommand = options.runVersionCommand ?? runVersionCommandFrom;
  const browserVersion = options.browser?.version() ?? 'unknown';
  const osPlatform = options.platform ?? platform;
  const [pageInfo, ffmpegVersion, ffprobeVersion, fonts, build] =
    await Promise.all([
      pageLocaleInfo(options.page),
      runVersionCommand('ffmpeg'),
      runVersionCommand('ffprobe'),
      enumerateFonts(),
      options.build === undefined
        ? resolveBuildLabel()
        : Promise.resolve(options.build),
    ]);

  return {
    arch: options.arch ?? arch,
    browserLabel: prettyBrowser(browserVersion),
    browserVersion,
    build,
    ffmpegVersion,
    ffprobeVersion,
    fontManifest: fonts,
    gpuMode: options.gpuMode ?? 'unknown',
    locale: pageInfo.locale,
    nodeVersion: options.nodeVersion ?? process.version,
    osLabel: prettyOs(osPlatform),
    platform: osPlatform,
    playwrightVersion: options.playwrightVersion ?? playwrightVersion(),
    schemaVersion: 1,
    timezone: pageInfo.timezone,
    viewportSource: pageInfo.viewport ? 'page' : 'requested',
    reducedMotion: pageInfo.reducedMotion ?? null,
    viewport: pageInfo.viewport ?? {
      deviceScaleFactor: options.viewport.deviceScaleFactor,
      height: options.viewport.height,
      width: options.viewport.width,
    },
  };
}

export function prettyBrowser(version: string): string {
  if (version === 'unknown' || version.length === 0) {
    return 'Chromium unknown';
  }
  if (version.toLowerCase().includes('chrom')) {
    return version;
  }
  return `Chromium ${version}`;
}

export function prettyOs(value: string): string {
  switch (value) {
    case 'linux':
      return 'Linux';
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    default:
      return value;
  }
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

async function resolveBuildLabel(): Promise<string> {
  try {
    const { stdout: branchOut } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { timeout: 2_000 },
    );
    const { stdout: shaOut } = await execFileAsync(
      'git',
      ['rev-parse', '--short=7', 'HEAD'],
      { timeout: 2_000 },
    );
    const branch = branchOut.trim() || 'unknown';
    const sha = shaOut.trim() || '0000000';
    return `${branch} @ ${sha}`;
  } catch {
    return 'unknown @ 0000000';
  }
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
      viewport: {
        width: innerWidth,
        height: innerHeight,
        deviceScaleFactor: devicePixelRatio,
      },
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
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

function playwrightVersion(): string {
  const manifest = require('playwright/package.json') as {
    readonly version?: unknown;
  };

  return typeof manifest.version === 'string' ? manifest.version : 'unknown';
}
