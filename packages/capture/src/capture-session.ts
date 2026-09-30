import { createRequire } from 'node:module';
import { maskTrackerScript } from './mask-tracker.js';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

import { getProbeInitScript, sampleDocumentClock } from '@jitterbox/repro-probe';
import {
  REPRO_CORE_VERSION,
  MonotonicClockBridge,
  ReproStore,
  cacheKey,
  implementationDigest,
  enumerateFonts,
  writeStageAtomic,
} from '@jitterbox/repro-core';
import { createPresidioLikeRedactor } from '@jitterbox/repro-core/redactor';
import { chromium } from 'playwright';

import { captureAnchor } from './anchors.js';
import { startSceneDiagnostics } from './scene-diagnostics.js';
import { startBrowserDiagnostics } from './browser-diagnostics.js';
import { collectEnvironmentManifest } from './environment.js';
import { StoreEventSink } from './events.js';
import { sanitizeHarFile } from './har.js';
import {
  applyProfileToContext,
  applyProfileToPage,
  verifyPageProfile,
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
} from '@jitterbox/repro-core';
import type { StreamRedactor } from '@jitterbox/repro-core/redactor';
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

const REPRO_CAPTURE_STAGE_VERSION = '0.3.1';

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
  #storeClosed = false;
  #harFinalized = false;
  #harRecording = false;
  #resources: CaptureResources | undefined;
  #screencasts: PageScreencast[] = [];
  #stageWrite: CaptureStageWrite | undefined;
  #telemetry: CdpTelemetry[] = [];
  readonly #redactionErrors = new Set<string>();
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
      this.#config.profile === 'controlled',
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

  /** Opt-in startup breadcrumbs contain phase names/timing only, never page data. */
  async #initialize<T>(phase: string, work: () => Promise<T>): Promise<T> {
    const started = performance.now();
    const trace = process.env.REPRO_CAPTURE_DEBUG === '1';
    if (trace) process.stderr.write(`[repro:init] ${phase} start\n`);
    try {
      return await work();
    } finally {
      if (trace)
        process.stderr.write(
          `[repro:init] ${phase} end ${Math.round(performance.now() - started)}ms\n`,
        );
    }
  }

  async start(): Promise<void> {
    try {
      await this.#prepareArtifactDirectories();
      this.#store.markStage({
        name: 'capture',
        runId: this.#runId,
        status: 'running',
      });

      // Inventory the host before recording starts. Otherwise a cold Windows
      // font scan becomes seconds of blank footage and unnecessary OCR frames.
      // The environment manifests still validate cached hashes against file metadata.
      await this.#initialize('font-inventory', enumerateFonts);

      this.#resources = await this.#initialize('browser-resources', () =>
        this.#createResources(),
      );
      await this.#initialize('context-hooks', () =>
        this.#installContextHooks(),
      );
      await this.#initialize('har', () => this.#installHarStub());
      await this.#initialize('trace', () => this.#startTracing());
      this.#startTracker();
      await this.#initialize('page-registration', async () =>
        this.#tracker?.ready(),
      );

      if (this.#options.url !== undefined) {
        await this.page.goto(this.#options.url);
      }

      await this.#initialize('clock', () => this.#calibrateClock(this.page));
      await this.#initialize('environment', () =>
        this.#writeEnvironmentManifest('start'),
      );
    } catch (error) {
      try {
        await this.fail(error);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Capture initialization failed and cleanup reported another error',
        );
      }
      throw error;
    }
  }

  async complete(): Promise<CaptureRunResult> {
    if (this.#completed) {
      return this.#result();
    }

    await this.#tracker?.ready();
    await this.#stopCaptureResources();
    if (this.#redactionErrors.size)
      throw new Error(
        `Redaction capture incomplete: ${[...this.#redactionErrors].join('; ')}`,
      );
    await this.#writeEnvironmentManifest('complete');
    await this.#closeResources();
    await this.#finalizeHar();
    this.#store.markStage({
      cacheKey: captureStageCacheKey({
        config: this.#config,
        ...(this.#options.url ? { url: this.#options.url } : {}),
      }),
      completedAtEpoch: Date.now(),
      name: 'capture',
      runId: this.#runId,
      status: 'complete',
    });
    this.#closeStore();
    this.#stageWrite = await this.#writeCaptureStage();
    this.#completed = true;
    return this.#result();
  }

  async fail(error: unknown): Promise<void> {
    if (this.#completed) {
      return;
    }

    if (!this.#storeClosed) {
      this.#sink.emitEvent({
        kind: 'capture.error',
        pageId: this.#resources ? this.#primaryPageId() : 'page-1',
        payload: { message: errorMessage(error) },
      });
      this.#store.markStage({
        completedAtEpoch: Date.now(),
        name: 'capture',
        runId: this.#runId,
        status: 'failed',
      });
    }
    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.#completed) {
      return;
    }

    try {
      await this.#stopCaptureResources();
    } finally {
      await this.#closeResources();
      if (!this.#storeClosed) await this.#finalizeHar();
      this.#closeStore();
      this.#completed = true;
    }
  }

  markActionOwningPage(page: Page): void {
    this.#tracker?.markActionOwningPage(page);
  }

  markFocusedPage(page: Page): void {
    this.#tracker?.markFocusedPage(page);
  }

  async emitEditorialCut(reason: string): Promise<void> {
    await this.#tracker?.ready();
    this.#tracker?.emitEditorialCut(reason);
  }

  /**
   * Emit a planner-facing semantic event (pause, slowmo, zoom, hit-target…).
   * Used by fixture drivers when the probe does not yet cover a cue type.
   */
  emitSemantic(
    kind: string,
    payload: Readonly<Record<string, unknown>> = {},
  ): void {
    this.#sink.emitEvent({
      kind,
      pageId: this.#primaryPageId(),
      payload: jsonValueFrom(payload),
      tMono: this.#clock.nowMono(),
    });
  }

  async observeValue(
    page: Page,
    name: string,
    value: unknown,
    startMs: number,
    endMs: number,
  ) {
    const pageId = await this.ready(page);
    const snapshot: unknown = JSON.stringify(value);
    if (
      typeof snapshot !== 'string' ||
      Buffer.byteLength(snapshot, 'utf8') > 65536
    ) {
      this.#sink.emitEvent({
        pageId,
        kind: 'diagnostic.coverage',
        payload: {
          collector: `state:${name}`,
          status: 'dropped',
          reason: 'Snapshot exceeds 64 KiB or is not JSON serializable',
        },
        tMono: endMs,
      });
      throw new Error(
        'State observation must be JSON serializable and at most 64 KiB',
      );
    }
    this.#sink.emitEvent({
      pageId,
      kind: 'scenario.state',
      tMono: endMs,
      payload: jsonValueFrom({
        name,
        value: JSON.parse(snapshot) as unknown,
        source: 'scenario-reader',
        timing: 'host-observation-window',
        startMs,
        endMs,
        uncertaintyMs: endMs - startMs,
      }),
    });
  }

  async emitElementCue(
    kind: string,
    selector: string,
    extra: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    const box = await this.page
      .locator(selector)
      .boundingBox()
      .catch(() => null);
    this.emitSemantic(kind, {
      selector,
      ...(box === null
        ? {}
        : {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            bbox: {
              x: box.x,
              y: box.y,
              w: box.width,
              h: box.height,
            },
          }),
      ...extra,
    });
  }

  async markStep(input: {
    readonly id: string;
    readonly title: string;
  }): Promise<void> {
    await this.showChapter(input.title, input.id);
  }

  async showChapter(title: string, stepId?: string): Promise<void> {
    this.#sink.emitEvent({
      kind: 'step.chapter',
      pageId: this.#primaryPageId(),
      payload: {
        title,
        ...(stepId === undefined ? {} : { stepId }),
      },
    });

    // Delivery captures keep frames clean; overlays are burned at annotate.
    if (this.#config.capturePreviewUi !== true) {
      return;
    }

    try {
      await showScreencastChapter(this.page, title);
    } catch (error) {
      this.#emitArtifactError('show-chapter', error);
    }
  }

  /** Call before acting on a newly opened page so capture owns it first. */
  async ready(page: Page = this.page): Promise<string> {
    const pageId = this.#pageIdFor(page);
    await this.#tracker?.ready();
    await this.#calibrateClock(page);
    return pageId;
  }

  async captureAnchor(
    page: Page,
    label: string,
    boundary: AnchorBoundary,
  ): Promise<AnchorRecord> {
    await this.ready(page);
    return captureAnchor({
      boundary,
      now: () => this.#clock.nowMono(),
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
    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext(this.#contextOptions());
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
    } catch (error) {
      await context?.close();
      if (!this.#options.browser) await browser.close();
      throw error;
    }
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
    await resources.context.addInitScript(
      `window.__REPRO_RRWEB__ = ${String(this.#config.capture?.rrweb === true)};`,
    );
    await resources.context.addInitScript(getProbeInitScript());
    await resources.context.addInitScript(
      maskTrackerScript(this.#config.redaction?.masks ?? []),
    );
    await resources.context.exposeBinding('__reproEmit', (...args) => {
      this.#emitProbeEvent(args);
    });
  }

  async #installHarStub(): Promise<void> {
    const harPath = this.#options.harStubPath ?? this.#config.capture?.har;
    if (harPath === undefined || this.#config.profile !== 'controlled') {
      return;
    }

    await this.context.routeFromHAR(harPath, {
      notFound: 'abort',
    });
  }

  async #startTracing(): Promise<void> {
    if (this.#tracePath === undefined || this.#traceStarted) {
      return;
    }

    await this.context.tracing.start({
      // Tracing screenshots share Playwright's screencast and can change its size.
      // Repro owns the pixels; tracing keeps DOM snapshots and action diagnostics.
      screenshots: false,
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
    this.#telemetry.push(
      await this.#initialize('diagnostics', () =>
        startSceneDiagnostics(
          registration.page,
          registration.pageId,
          this.#sink,
        ),
      ),
    );
    this.#telemetry.push(
      startBrowserDiagnostics(
        registration.page,
        registration.pageId,
        this.#sink,
      ),
    );
    await this.#initialize('page-profile', () =>
      applyProfileToPage(
        registration.page,
        profileOptions(this.#options, this.#config),
      ),
    );
    await registration.page.setViewportSize({
      height: this.#config.viewport.height,
      width: this.#config.viewport.width,
    });
    await verifyPageProfile(
      registration.page,
      profileOptions(this.#options, this.#config),
    );
    await this.#calibrateClock(registration.page);
    const screencast = await this.#screencastFor(registration);
    this.#screencasts.push(screencast);
    await this.#initialize('initial-frame', () => screencast.ready());
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
    for (const frame of page.frames()) {
      if (frame.isDetached()) continue;
      const started = this.#clock.nowMono();
      const { timeOrigin, now, documentId } =
        await frame.evaluate(sampleDocumentClock);
      const ended = this.#clock.nowMono();
      const sample = {
        pageNowMs: now,
        runTimeMs: (started + ended) / 2,
        uncertaintyMs: (ended - started) / 2,
      };
      this.#clock.calibrate(timeOrigin, documentId, sample);
      this.#sink.emitEvent({
        kind: 'clock.calibrated',
        pageId: this.#pageIdFor(page),
        payload: { timeOrigin, documentId, ...sample, method: 'page-sampled' },
        tMono: this.#clock.nowMono(),
      });
    }
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

    const environment = await collectEnvironmentManifest({
      ...(browser === null ? {} : { browser }),
      page: resources.page,
      viewport: this.#config.viewport,
    });
    return {
      ...environment,
      reproTracing: {
        started: this.#traceStarted,
        screenshots: false,
        snapshots: this.#traceStarted,
      },
    };
  }

  async #stopCaptureResources(): Promise<void> {
    this.#tracker?.stop();

    // Registration may still be acquiring a screencast when initialization fails.
    const failures: unknown[] = [];
    try {
      await this.#tracker?.ready();
    } catch (error) {
      failures.push(error);
    }
    const captures = await Promise.allSettled(
      this.#screencasts.map((screencast) => screencast.stop()),
    );
    const telemetry = await Promise.allSettled(
      this.#telemetry.map((item) => item.dispose()),
    );
    for (const result of [...captures, ...telemetry])
      if (result.status === 'rejected') failures.push(result.reason);
    await this.#stopTracing();
    this.#screencasts = [];
    this.#telemetry = [];
    if (failures.length)
      throw new AggregateError(
        failures,
        'Capture resources did not complete cleanly',
      );
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
      artifacts: await this.#stageArtifacts(),
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

  async #stageArtifacts(): Promise<readonly string[]> {
    const files: string[] = [];
    for (const folder of ['frames', 'anchors']) {
      const root = join(this.#outputDir, folder);
      for (const name of await readdir(root, { recursive: true }).catch(
        () => [] as string[],
      ))
        if (/\.(jpg|png|json)$/.test(name)) files.push(join(root, name));
    }
    return [
      ...files,
      this.#environmentPath(),
      ...(this.#harRecording ? [this.#harPath] : []),
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
    if (this.#storeClosed || this.#completed) return;
    const source = args[0] as BindingSourceLike | undefined;
    const payload = jsonValueFrom(args[1]);
    if (isRecord(payload) && payload.type === 'redaction.error')
      this.#redactionErrors.add(
        typeof payload.message === 'string'
          ? payload.message
          : 'Unknown redaction measurement failure',
      );
    const page = source?.page;
    const pageNowMs = pageNowFromPayload(payload);

    this.#sink.emitEvent({
      kind: probeKind(payload),
      pageId:
        page === undefined ? this.#primaryPageId() : this.#pageIdFor(page),
      payload,
      ...(pageNowMs === undefined ? {} : { pageNowMs }),
      ...(isRecord(payload) && typeof payload.timeOrigin === 'number'
        ? { pageTimeOriginMs: payload.timeOrigin }
        : {}),
      ...(isRecord(payload) && typeof payload.documentId === 'string'
        ? { documentId: payload.documentId }
        : {}),
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

  #closeStore(): void {
    if (!this.#storeClosed) {
      this.#store.close();
      this.#storeClosed = true;
    }
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
    try {
      await session.fail(error);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Capture failed and cleanup reported another error',
      );
    }
    throw error;
  }
}

function configFromOptions(options: CaptureSessionOptions): ReproConfig {
  if (options.config !== undefined) {
    if (options.config.surfaceCapture === 'os')
      throw new Error('Unsupported capture backend: os');
    if (options.config.capture?.backend === 'native')
      throw new Error(
        'Native capture is experimental and unavailable; select cdp',
      );
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
      harReplayHash: input.config.capture?.har
        ? createHash('sha256')
            .update(readFileSync(input.config.capture.har))
            .digest('hex')
        : null,
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
      harReplayHash: input.config.capture?.har
        ? createHash('sha256')
            .update(readFileSync(input.config.capture.har))
            .digest('hex')
        : null,
    },
    stage: 'capture',
    versions: captureStageVersions(),
  };
}

export function canShowActions(config: ReproConfig): boolean {
  return (
    config.capturePreviewUi === true &&
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
    freezeTimeEpoch: config.capture?.date ?? 1704067200000,
    seed: config.capture?.seed ?? 1,
    locale: config.capture?.locale ?? 'en-US',
    timezone: config.capture?.timezone ?? 'UTC',
    blockServiceWorkers: config.capture?.serviceWorkers !== 'allow',
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
    ? screencast
    : undefined;
}

function captureStageVersions(): Record<string, string> {
  return {
    '@jitterbox/repro-capture': REPRO_CAPTURE_STAGE_VERSION,
    '@jitterbox/repro-core': REPRO_CORE_VERSION,
    captureImplementation: implementationDigest(
      new URL('./index.js', import.meta.url).href,
    ),
    probeImplementation: implementationDigest(
      createRequire(import.meta.url).resolve('@jitterbox/repro-probe'),
    ),
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
