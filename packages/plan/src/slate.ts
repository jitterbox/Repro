import type { Mode, ReproConfig } from '@repro/core';

export interface SlateEnvironment {
  readonly browserLabel: string;
  readonly osLabel: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor: number;
  };
  readonly locale?: string;
  readonly timezone?: string;
  readonly build?: string;
}

export interface SlateDocument {
  readonly schemaVersion: '1.0.0';
  readonly mode: Mode;
  readonly bugId: string;
  readonly title: string;
  readonly browser: string;
  readonly os: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor: number;
  };
  readonly profile?: 'faithful' | 'controlled';
  readonly profileChip?: string;
  readonly locale?: string;
  readonly timezone?: string;
  readonly build?: string;
  readonly capturedAt?: string;
  readonly appLabel: string;
  readonly stepCount?: number;
  readonly durationMs?: number;
  readonly outcome?: 'expected-pass' | 'expected-fail' | 'unknown';
  readonly holdMs: number;
  readonly dissolveMs: number;
}

export interface BuildSlateInput {
  readonly config: ReproConfig;
  readonly environment: SlateEnvironment;
  readonly bugId?: string;
  readonly title?: string;
  readonly appLabel?: string;
  readonly stepCount?: number;
  readonly durationMs?: number;
  readonly capturedAt?: string;
}

/** Build fails when bugId, browser or viewport are missing. */
export function buildSlate(input: BuildSlateInput): SlateDocument {
  const bugId =
    input.bugId ??
    stringMeta(input.config.metadata, 'bugId') ??
    stringMeta(input.config.metadata, 'issueId');
  const rawTitle =
    input.title ??
    stringMeta(input.config.metadata, 'title') ??
    stringMeta(input.config.metadata, 'System.Title') ??
    stringMeta(input.config.metadata, 'almTitle') ??
    stringMeta(input.config.metadata, 'specTitle') ??
    'Untitled repro';
  const browser = input.environment.browserLabel;
  const viewport = input.environment.viewport;

  if (bugId === undefined || bugId.length === 0) {
    throw new Error('slate requires bugId');
  }
  if (browser.length === 0 || browser === 'Chromium unknown') {
    throw new Error('slate requires browser');
  }
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('slate requires viewport');
  }

  // Prefer a human title; never show the same identity string twice.
  const title =
    normalizeIdentity(rawTitle) === normalizeIdentity(bugId)
      ? 'Untitled repro'
      : rawTitle;

  const profileChip =
    input.config.profile === 'controlled' ? 'Deterministic' : 'Live timing';

  return {
    schemaVersion: '1.0.0',
    mode: input.config.mode,
    bugId,
    title: title.slice(0, 90),
    browser,
    os: input.environment.osLabel,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
    },
    profile: input.config.profile,
    profileChip,
    ...(input.environment.locale === undefined
      ? {}
      : { locale: input.environment.locale }),
    ...(input.environment.timezone === undefined
      ? {}
      : { timezone: input.environment.timezone }),
    ...(input.environment.build === undefined
      ? {}
      : { build: input.environment.build }),
    ...(input.capturedAt === undefined ? {} : { capturedAt: input.capturedAt }),
    appLabel:
      input.appLabel ??
      stringMeta(input.config.metadata, 'appLabel') ??
      'Application under test',
    ...(input.stepCount === undefined ? {} : { stepCount: input.stepCount }),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    ...(input.config.mode === 'demo'
      ? { outcome: 'expected-pass' as const }
      : {}),
    holdMs: 2_200,
    dissolveMs: 320,
  };
}

function stringMeta(
  metadata: ReproConfig['metadata'],
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}
