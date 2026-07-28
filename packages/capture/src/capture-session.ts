import { mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getProbeInitScript } from '@repro/probe';
import {
  REPRO_CORE_VERSION,
  MonotonicClockBridge,
  ReproStore,
  cacheKey,
  writeStageAtomic,
} from '@repro/core';
import { createPresidioLikeRedactor } from '@repro/render';
import { chromium } from 'playwright';

import { captureAnchor } from './anchors.js';
import { startCdpTelemetry } from './cdp-telemetry.js';
import { collectEnvironmentManifest } from './environment.js';
import { StoreEventSink } from './events.js';
import { sanitizeHarFile } from './har.js';
import {
  applyProfileToContext,
  applyProfileToPage,
  contextOptionsForProfile,
} from './profiles.js';
import { MultiPageTracker } from './multipage.js';
import { startPageScreencast } from './screencast.js';

import type { AnchorBoundary, AnchorRecord } from './anchors.js';
import type { CdpTelemetry } from './cdp-telemetry.js';
import type { EnvironmentManifest } from './environment.js';
import type { PageRegistration } from './multipage.js';
import type { PageScreencast } from './screencast.js';
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from 'playwright';
import type {
  CaptureProfile,
  HashInput,
  JsonValue,
  ReproConfig,
  StageManifest,
  Viewport,
} from '@repro/core';
import type { StreamRedactor } from '@repro/render';
import type { CaptureProfileOptions } from './profiles.js';

export interface CaptureSessionOptions {
  readonly blockServiceWorkers?: boolean;
  readonly browser?: Browser;
  readonly config?: ReproConfig;
  readonly context?: BrowserContext;
  readonly enableTrace?: boolean;
  readonly freezeTimeEpoch?: number;
  readonly harPath?: string;
  readonly harStubPath?: string;
  readonly outputDir?: string;
  readonly page?: Page;
  readonly profile?: CaptureProfile;
  readonly queueSize?: number;
  readonly redactor?: StreamRedactor | null;
  readonly run?: (session: CaptureSession) => Promise<void> | void;
  readonly runId?: string;
  readonly seed?: number;
  readonly storePath?: string;
  readonly stageRootDir?: string;
  readonly tracePath?: string;
  readonly url?: string;
  readonly viewport?: Viewport;
}

export interface CaptureRunResult {
  readonly environmentPath: string;
  readonly outputDir: string;
  readonly runId: string;
  readonly stagePath?: string;
  readonly storePath: string | undefined;
}

interface CaptureResources {
  readonly browser: Browser | undefined;
  readonly context: BrowserContext;
  readonly ownedBrowser: boolean;
  readonly ownedContext: boolean;
  readonly ownedPage: boolean;
  readonly page: Page;
}

interface CaptureStageWrite {
  readonly cacheKey: string;
  readonly manifestPath: string;
  readonly stagePath: string;
}

interface ExperimentalActionScreencast {
  readonly showActions?: (options: {
    readonly cursor: 'pointer';
  }) => Promise<void> | void;
  readonly showChapter?: (title: string) => Promise<void> | void;
}

const REPRO_CAPTURE_STAGE_VERSION = '0.0.0';

export class CaptureSession {
  readonly #clock: MonotonicClockBridge;
  readonly #config: ReproConfig;
  readonly #harPath: string;
  readonly #harRawPath: string;
  readonly #options: CaptureSessionOptions;
  readonly #outputDir: string;
  readonly #runId: string;
  readonly #sink: StoreEventSink;
  readonly #store: ReproStore;
  readonly #storePath: string | undefined;
  readonly #tracePath: string | undefined;
  #completed = false;
  #harFinalized = false;
  #harRecording = false;
  #resources: CaptureResources | undefined;
  #screencasts: PageScreencast[] = [];
  #stageWrite: CaptureStageWrite | undefined;
  #telemetry: CdpTelemetry[] = [];
  #traceStarted = false;
  #traceStopped = false;
  #tracker: MultiPageTracker | undefined;

  constructor(options: CaptureSessionOptions) {
    this.#options = options;
    this.#clock = new MonotonicClockBridge();
    this.#config = configFromOptions(options);
    this.#outputDir = options.outputDir ?? join(process.cwd(), '.repro');
    this.#harPath = options.harPath ?? join(this.#outputDir, 'network.har');
    this.#harRawPath = join(this.#outputDir, 'network.raw.har');
    this.#tracePath =
      options.enableTrace === false
        ? undefined
        : (options.tracePath ?? join(this.#outputDir, 'trace.zip'));
    this.#storePath = options.storePath ?? join(this.#outputDir, 'capture.db');
    mkdirSync(dirname(this.#storePath), { recursive: true });
    this.#store = new ReproStore({ path: this.#storePath });
    this.#runId = this.#store.createRun({
      config: this.#config,
      ...(options.runId === undefined ? {} : { id: options.runId }),
    });
    this.#sink = new StoreEventSink(
      this.#store,
      this.#runId,
      this.#clock,
      redactorFromOptions(options),
    );
  }

  get clock(): MonotonicClockBridge {
    return this.#clock;
  }

  get config(): ReproConfig {
    return this.#config;
  }

  get context(): BrowserContext {
    return this.#requiredResources().context;
  }

  get outputDir(): string {
    return this.#outputDir;
  }

  get page(): Page {
    return this.#requiredResources().page;
  }

  get runId(): string {
    return this.#runId;
  }

  get store(): ReproStore {
    return this.#store;
  }

  get storePath(): string | undefined {
    return this.#storePath;
  }

  async start(): Promise<void> {
    await this.#prepareArtifactDirectories();
    this.#store.markStage({
      name: 'capture',
      runId: this.#runId,
      status: 'running',
    });

    this.#resources = await this.#createResources();
    await this.#installContextHooks();
    await this.#installHarStub();
    await this.#startTracing();
    this.#startTracker();

    if (this.#options.url !== undefined) {
      await this.page.goto(this.#options.url);
    }

    await this.#calibrateClock(this.page);
    await this.#writeEnvironmentManifest('start');
  }

  async complete(): Promise<CaptureRunResult> {
    if (this.#completed) {
      return this.#result();
    }

    await this.#stopCaptureResources();
    await this.#writeEnvironmentManifest('complete');
    await this.#closeResources();
    await this.#finalizeHar();
    this.#stageWrite = await this.#writeCaptureStage();
    this.#store.markStage({
      cacheKey: this.#stageWrite.cacheKey,
      completedAtEpoch: Date.now(),
      manifestPath: this.#stageWrite.manifestPath,
      name: 'capture',
      runId: this.#runId,
      status: 'complete',
    });
    this.#store.close();
    this.#completed = true;
    return this.#result();
  }

  async fail(error: unknown): Promise<void> {
    if (this.#completed) {
      return;
    }

    this.#sink.emitEvent({
      kind: 'capture.error',
      pageId: this.#primaryPageId(),
      payload: { message: errorMessage(error) },
    });
    this.#store.markStage({
      completedAtEpoch: Date.now(),
      name: 'capture',
      runId: this.#runId,
      status: 'failed',
    });
    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.#completed) {
      return;
    }

    await this.#stopCaptureResources();
    await this.#closeResources();
    await this.#finalizeHar();
    this.#store.close();
    this.#completed = true;
  }

  markActionOwningPage(page: Page): void {
    this.#tracker?.markActionOwningPage(page);
  }

  markFocusedPage(page: Page): void {
    this.#tracker?.markFocusedPage(page);
  }

  emitEditorialCut(reason: string): void {
    this.#tracker?.emitEditorialCut(reason);
  }

  async showChapter(title: string): Promise<void> {
    if (this.#config.features.steps !== true) {
      return;
    }

    this.#sink.emitEvent({
      kind: 'step.chapter',
      pageId: this.#primaryPageId(),
      payload: { title },
    });

    try {
      await showScreencastChapter(this.page, title);
    } catch (error) {
      this.#emitArtifactError('show-chapter', error);
    }
  }

  captureAnchor(
    page: Page,
    label: string,
    boundary: AnchorBoundary,
  ): Promise<AnchorRecord> {
    return captureAnchor({
      boundary,
      directory: join(this.#outputDir, 'anchors'),
      label,
      page,
      pageId: this.#pageIdFor(page),
      sink: this.#sink,
    });
  }

  async #createResources(): Promise<CaptureResources> {
    if (this.#options.context !== undefined) {
      return this.#resourcesFromContext(this.#options.context);
    }

    const browser = this.#options.browser ?? (await chromium.launch());
    const context = await browser.newContext(this.#contextOptions());
    this.#harRecording = true;
    const page = this.#options.page ?? (await context.newPage());

    return {
      browser,
      context,
      ownedBrowser: this.#options.browser === undefined,
      ownedContext: true,
      ownedPage: this.#options.page === undefined,
      page,
    };
  }

  #contextOptions(): BrowserContextOptions {
    return {
      ...contextOptionsForProfile(profileOptions(this.#options, this.#config)),
      recordHar: {
        mode: 'minimal',
        path: this.#harRawPath,
      },
    };
  }

  async #resourcesFromContext(
    context: BrowserContext,
  ): Promise<CaptureResources> {
    const page = this.#options.page ?? (await context.newPage());

    return {
      browser: undefined,
      context,
      ownedBrowser: false,
      ownedContext: false,
      ownedPage: this.#options.page === undefined,
      page,
    };
  }

  async #installContextHooks(): Promise<void> {
    const resources = this.#requiredResources();
    await applyProfileToContext(
      resources.context,
      profileOptions(this.#options, this.#config),
    );
    await resources.context.addInitScript(getProbeInitScript());
    await resources.context.exposeBinding('__reproEmit', (...args) => {
      this.#emitProbeEvent(args);
    });
  }

  async #installHarStub(): Promise<void> {
    if (
      this.#options.harStubPath === undefined ||
      this.#config.profile !== 'controlled'
    ) {
      return;
    }

    await this.context.routeFromHAR(this.#options.harStubPath, {
      notFound: 'fallback',
    });
  }

  async #startTracing(): Promise<void> {
    if (this.#tracePath === undefined || this.#traceStarted) {
      return;
    }

    await this.context.tracing.start({
      screenshots: true,
      snapshots: true,
    });
    this.#traceStarted = true;
  }

  #startTracker(): void {
    const resources = this.#requiredResources();
    this.#tracker = new MultiPageTracker({
      context: resources.context,
      onPage: (registration) => this.#startPageCapture(registration),
      primaryPage: resources.page,
      sink: this.#sink,
    });
    this.#tracker.start();
  }

  async #startPageCapture(registration: PageRegistration): Promise<void> {
    await applyProfileToPage(
      registration.page,
      profileOptions(this.#options, this.#config),
    );
    await registration.page
      .setViewportSize({
        height: this.#config.viewport.height,
        width: this.#config.viewport.width,
      })
      .catch(() => undefined);
    this.#telemetry.push(
      await startCdpTelemetry({
        page: registration.page,
        pageId: registration.pageId,
        sink: this.#sink,
      }),
    );
    const screencast = await this.#screencastFor(registration);
    this.#screencasts.push(screencast);
    await this.#showActions(registration.page);
  }

  async #screencastFor(
    registration: PageRegistration,
  ): Promise<PageScreencast> {
    const options = {
      clock: this.#clock,
      directory: join(this.#outputDir, 'frames', registration.pageId),
      page: registration.page,
      pageId: registration.pageId,
      runId: this.#runId,
      store: this.#store,
      viewport: this.#config.viewport,
      ...(this.#options.queueSize === undefined
        ? {}
        : { queueSize: this.#options.queueSize }),
    };

    return startPageScreencast(options);
  }

  async #showActions(page: Page): Promise<void> {
    if (!canShowActions(this.#config)) {
      return;
    }

    try {
      await showScreencastActions(page);
    } catch (error) {
      this.#emitArtifactError('show-actions', error);
    }
  }

  async #calibrateClock(page: Page): Promise<void> {
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    this.#clock.calibrate(timeOrigin);
    this.#sink.emitEvent({
      kind: 'clock.calibrated',
      pageId: this.#pageIdFor(page),
      payload: { timeOrigin },
      tMono: this.#clock.nowMono(),
    });
  }

  async #writeEnvironmentManifest(phase: 'start' | 'complete'): Promise<void> {
    const manifest = await this.#environmentForResources();
    const path = this.#environmentPath();

    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
    this.#sink.emitEvent({
      kind: 'capture.environment',
      pageId: this.#primaryPageId(),
      payload: jsonValueFrom({
        manifest,
        path,
        phase,
      }),
      tMono: this.#clock.nowMono(),
    });
  }

  async #environmentForResources(): Promise<EnvironmentManifest> {
    const resources = this.#requiredResources();
    const browser = resources.browser ?? resources.context.browser();

    return collectEnvironmentManifest({
      ...(browser === null ? {} : { browser }),
      page: resources.page,
      viewport: this.#config.viewport,
    });
  }

  async #stopCaptureResources(): Promise<void> {
    this.#tracker?.stop();

    await Promise.all(this.#screencasts.map((screencast) => screencast.stop()));
    await Promise.all(this.#telemetry.map((telemetry) => telemetry.dispose()));
    await this.#stopTracing();
    this.#screencasts = [];
    this.#telemetry = [];
  }

  async #stopTracing(): Promise<void> {
    if (
      this.#resources === undefined ||
      this.#tracePath === undefined ||
      !this.#traceStarted ||
      this.#traceStopped
    ) {
      return;
    }

    this.#traceStopped = true;

    try {
      await this.#resources.context.tracing.stop({ path: this.#tracePath });
    } catch (error) {
      this.#emitArtifactError('trace', error);
    }
  }

  async #closeResources(): Promise<void> {
    const resources = this.#resources;

    if (resources === undefined) {
      return;
    }

    if (resources.ownedPage && !resources.page.isClosed()) {
      await resources.page.close().catch(() => undefined);
    }

    if (resources.ownedContext) {
      await resources.context.close().catch(() => undefined);
    }

    if (resources.ownedBrowser) {
      await resources.browser?.close().catch(() => undefined);
    }

    this.#resources = undefined;
  }

  async #finalizeHar(): Promise<void> {
    if (!this.#harRecording || this.#harFinalized) {
      return;
    }

    this.#harFinalized = true;

    try {
      await sanitizeHarFile(this.#harRawPath, this.#harPath);
    } catch (error) {
      this.#emitArtifactError('har', error);
    }
  }

  async #writeCaptureStage(): Promise<CaptureStageWrite> {
    const key = captureStageCacheKey({
      config: this.#config,
      ...(this.#options.url === undefined ? {} : { url: this.#options.url }),
    });
    const manifest = captureStageManifest({
      artifacts: this.#stageArtifacts(),
      cacheKey: key,
      config: this.#config,
      ...(this.#options.url === undefined ? {} : { url: this.#options.url }),
    });
    const stagePath = await writeStageAtomic({
      manifest,
      rootDir: this.#stageRootDir(),
    });

    return {
      cacheKey: key,
      manifestPath: join(stagePath, 'manifest.json'),
      stagePath,
    };
  }

  #stageArtifacts(): readonly string[] {
    return [
      this.#environmentPath(),
      this.#harPath,
      ...(this.#storePath === undefined ? [] : [this.#storePath]),
      ...(this.#tracePath === undefined ? [] : [this.#tracePath]),
    ];
  }

  async #prepareArtifactDirectories(): Promise<void> {
    const directories = [
      this.#outputDir,
      dirname(this.#harPath),
      dirname(this.#harRawPath),
      ...(this.#tracePath === undefined ? [] : [dirname(this.#tracePath)]),
    ];

    await Promise.all(
      [...new Set(directories)].map((path) => mkdir(path, { recursive: true })),
    );
  }

  #emitProbeEvent(args: readonly unknown[]): void {
    const source = args[0] as BindingSourceLike | undefined;
    const payload = jsonValueFrom(args[1]);
    const page = source?.page;
    const pageNowMs = pageNowFromPayload(payload);

    this.#sink.emitEvent({
      kind: probeKind(payload),
      pageId:
        page === undefined ? this.#primaryPageId() : this.#pageIdFor(page),
      payload,
      ...(pageNowMs === undefined ? {} : { pageNowMs }),
    });
  }

  #pageIdFor(page: Page): string {
    return this.#tracker?.pageIdFor(page) ?? this.#primaryPageId();
  }

  #primaryPageId(): string {
    return this.#tracker?.pageIdFor(this.page) ?? 'page-1';
  }

  #artifactPageId(): string {
    const page = this.#resources?.page;
    return page === undefined ? 'page-1' : this.#pageIdFor(page);
  }

  #emitArtifactError(artifact: string, error: unknown): void {
    this.#sink.emitEvent({
      kind: `capture.${artifact}.error`,
      pageId: this.#artifactPageId(),
      payload: { message: errorMessage(error) },
    });
  }

  #requiredResources(): CaptureResources {
    if (this.#resources === undefined) {
      throw new Error('Capture session has not started');
    }

    return this.#resources;
  }

  #result(): CaptureRunResult {
    return {
      environmentPath: this.#environmentPath(),
      outputDir: this.#outputDir,
      runId: this.#runId,
      ...(this.#stageWrite === undefined
        ? {}
        : { stagePath: this.#stageWrite.stagePath }),
      storePath: this.#storePath,
    };
  }

  #environmentPath(): string {
    return join(this.#outputDir, 'environment.json');
  }

  #stageRootDir(): string {
    return this.#options.stageRootDir ?? join(this.#outputDir, 'stages');
  }
}

export async function createCaptureSession(
  options: CaptureSessionOptions = {},
): Promise<CaptureSession> {
  const session = new CaptureSession(options);
  await session.start();
  return session;
}

export async function runCapture(
  options: CaptureSessionOptions = {},
): Promise<CaptureRunResult> {
  const session = await createCaptureSession(options);

  try {
    await options.run?.(session);
    return await session.complete();
  } catch (error) {
    await session.fail(error);
    throw error;
  }
}

function configFromOptions(options: CaptureSessionOptions): ReproConfig {
  if (options.config !== undefined) {
    return options.config;
  }

  return {
    features: {},
    metadata: {},
    mode: 'repro',
    profile: options.profile ?? 'controlled',
    surfaceCapture: 'page',
    viewport: options.viewport ?? defaultViewport(),
  };
}

export function captureStageCacheKey(input: {
  readonly config: ReproConfig;
  readonly url?: string;
}): string {
  return cacheKey({
    config: hashInputFromJson(input.config),
    inputs: {
      url: input.url ?? null,
    },
    versions: captureStageVersions(),
  });
}

export function captureStageManifest(input: {
  readonly artifacts: readonly string[];
  readonly cacheKey: string;
  readonly config: ReproConfig;
  readonly url?: string;
}): StageManifest {
  return {
    artifacts: input.artifacts,
    cacheKey: input.cacheKey,
    completedAtEpoch: Date.now(),
    config: hashInputFromJson(input.config),
    inputs: {
      url: input.url ?? null,
    },
    stage: 'capture',
    versions: captureStageVersions(),
  };
}

export function canShowActions(config: ReproConfig): boolean {
  return (
    config.showActions === true &&
    config.timingSensitive !== true &&
    config.compare?.streams.includes('pixel-diff') !== true
  );
}

function profileOptions(
  options: CaptureSessionOptions,
  config: ReproConfig,
): CaptureProfileOptions {
  return {
    profile: config.profile,
    viewport: config.viewport,
    ...(options.blockServiceWorkers === undefined
      ? {}
      : { blockServiceWorkers: options.blockServiceWorkers }),
    ...(options.freezeTimeEpoch === undefined
      ? {}
      : { freezeTimeEpoch: options.freezeTimeEpoch }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  };
}

function redactorFromOptions(
  options: CaptureSessionOptions,
): StreamRedactor | undefined {
  if (options.redactor === null) {
    return undefined;
  }

  return options.redactor ?? createPresidioLikeRedactor();
}

async function showScreencastActions(page: Page): Promise<void> {
  const screencast = actionScreencastFrom(page);

  if (typeof screencast?.showActions !== 'function') {
    return;
  }

  await screencast.showActions({ cursor: 'pointer' });
}

async function showScreencastChapter(page: Page, title: string): Promise<void> {
  const screencast = actionScreencastFrom(page);

  if (typeof screencast?.showChapter !== 'function') {
    return;
  }

  await screencast.showChapter(title);
}

function actionScreencastFrom(
  page: Page,
): ExperimentalActionScreencast | undefined {
  const record = page as unknown as Record<string, unknown>;
  const screencast = record.screencast;

  return screencast !== null && typeof screencast === 'object'
    ? (screencast)
    : undefined;
}

function captureStageVersions(): Record<string, string> {
  return {
    '@repro/capture': REPRO_CAPTURE_STAGE_VERSION,
    '@repro/core': REPRO_CORE_VERSION,
  };
}

function hashInputFromJson(value: unknown): HashInput {
  return JSON.parse(JSON.stringify(value)) as HashInput;
}

function defaultViewport(): Viewport {
  return {
    deviceScaleFactor: 1,
    height: 720,
    width: 1280,
  };
}

function probeKind(payload: JsonValue): string {
  if (!isRecord(payload) || typeof payload.type !== 'string') {
    return 'probe.event';
  }

  return `probe.${payload.type}`;
}

function jsonValueFrom(value: unknown): JsonValue {
  if (value === null || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  return complexJsonValueFrom(value);
}

function complexJsonValueFrom(value: unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map(jsonValueFrom);
  }

  if (!isRecord(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, jsonValueFrom(item)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pageNowFromPayload(payload: JsonValue): number | undefined {
  if (!isRecord(payload) || typeof payload.time !== 'number') {
    return undefined;
  }

  return Number.isFinite(payload.time) ? payload.time : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

interface BindingSourceLike {
  readonly page?: Page;
}
