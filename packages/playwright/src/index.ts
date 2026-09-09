import { test as base, expect } from '@playwright/test';
import type { Locator, Page, TestInfo, Response } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CaptureSession } from '@repro/capture';
import { validateConfig } from '@repro/contracts/config-validator';
import { ReproConfigSchema } from '@repro/contracts/config';
import { cropBounds, validateEvidence } from '@repro/contracts';
import type { EvidenceSpec, Observation, RunManifest } from '@repro/contracts';
import {
  finishEvidence,
  newObservationId,
  scenarioSourceIdentity,
} from '@repro/pipeline';

export { expect };
export class EvidenceRecorder {
  readonly observations: Observation[] = [];
  readonly steps: RunManifest['steps'] = [];
  readonly segments: RunManifest['segments'] = [];
  readonly designatedChecks: boolean[] = [];
  readonly targets = new Map<string, Locator>();
  constructor(
    readonly session: CaptureSession,
    readonly spec: EvidenceSpec,
    readonly directory: string,
  ) {}
  target(id: string, locator: Locator) {
    if (!this.spec.targets.some((t) => t.id === id))
      throw new Error(`Unknown target ${id}`);
    this.targets.set(id, locator);
    return locator;
  }
  async step<T>(id: string, action: () => Promise<T>): Promise<T> {
    const definition = this.spec.steps.find((s) => s.id === id);
    if (!definition) throw new Error(`Unknown step ${id}`);
    await this.session.ready();
    const startMs = this.session.clock.nowMono();
    await this.session.markStep({ id, title: definition.title });
    try {
      return await base.step(definition.title, action);
    } finally {
      this.steps.push({
        id,
        title: definition.title,
        index: this.spec.steps.indexOf(definition) + 1,
        startMs,
        endMs: this.session.clock.nowMono(),
      });
    }
  }
  async checkpoint(id: string, page: Page = this.session.page) {
    const cp = this.spec.checkpoints.find((c) => c.id === id);
    if (!cp) throw new Error(`Unknown checkpoint ${id}`);
    if (cp.frame)
      throw new Error(
        `Checkpoint ${id} selects its committed event-linked frame after capture; do not replace it with a screenshot`,
      );
    const before = new Map<
      string,
      Awaited<ReturnType<Locator['boundingBox']>>
    >();
    const measurementStartedMs = this.session.clock.nowMono();
    for (const target of cp.targets) {
      const locator = this.targets.get(target);
      if (locator && locator.page() !== page)
        throw new Error(
          `Target ${target} belongs to another page; capture a checkpoint on that page`,
        );
      if (locator && (await locator.count()) === 1)
        before.set(target, await locator.boundingBox());
    }
    // Stable means the caller completed its specific assertion; never inject network-idle or animation waits.
    const anchor = await this.session.captureAnchor(page, id, 'after');
    this.observations.push({
      id: newObservationId(),
      checkpoint: id,
      kind: 'screenshot',
      pageId: anchor.pageId,
      timeMs: anchor.tMono,
      endMs: anchor.endMono ?? anchor.tMono,
      status: 'passed',
      artifact: relative(this.directory, anchor.path),
      data: {
        selection: 'checkpoint',
        uncertaintyMs: (anchor.endMono ?? anchor.tMono) - anchor.tMono,
      },
    });
    for (const target of cp.targets) {
      const locator = this.targets.get(target);
      const count = (await locator?.count()) ?? 0;
      if (count !== 1) {
        this.observations.push({
          id: newObservationId(),
          checkpoint: id,
          kind: 'bounds',
          pageId: anchor.pageId,
          target,
          timeMs: this.session.clock.nowMono(),
          status: 'failed',
          bounds: null,
          detail: count === 0 ? 'Target absent' : 'Target ambiguous',
        });
        continue;
      }
      if (requireValue(locator).page() !== page)
        throw new Error(
          `Target ${target} belongs to another page; capture a checkpoint on that page`,
        );
      const measuredAfter = await requireValue(locator).boundingBox();
      const measuredBefore = before.get(target) ?? null;
      const stable = sameBounds(measuredBefore, measuredAfter);
      const bounds = stable ? measuredAfter : null;
      this.observations.push({
        id: newObservationId(),
        checkpoint: id,
        kind: 'bounds',
        pageId: anchor.pageId,
        target,
        timeMs: measurementStartedMs,
        endMs: this.session.clock.nowMono(),
        status: !stable ? 'unsupported' : bounds ? 'passed' : 'failed',
        bounds,
        detail: !stable
          ? 'Target geometry changed during screenshot capture; no aligned crop or outline is available'
          : bounds
            ? 'Viewport CSS bounds agree before and after screenshot capture'
            : 'Target has no rendered bounds',
        data: {
          measuredBefore,
          measuredAfter,
          coordinateSpace: 'viewport-css',
          deviceScaleFactor: this.session.config.viewport.deviceScaleFactor,
        },
      });
      if (bounds) {
        const clip = cropBounds(
          bounds,
          this.session.config.viewport,
          this.spec.presentation.padding,
        );
        // Derive crops later from the same context pixels; do not take a second screenshot of a moving state.
        requireValue(this.observations.at(-1)).data = {
          ...requireValue(this.observations.at(-1)).data,
          crop: clip,
          context: relative(this.directory, anchor.path),
        };
      }
    }
    return anchor;
  }
  /** Mark a proof interval before its trigger; no waits or application changes are injected. */
  async segment<T>(
    id: string,
    action: () => Promise<T>,
    page: Page = this.session.page,
  ): Promise<T> {
    const definition = this.spec.segments.find((segment) => segment.id === id);
    if (!definition) throw new Error(`Unknown capture segment ${id}`);
    if (this.segments.some((segment) => segment.id === id))
      throw new Error(`Duplicate capture segment ${id}`);
    const pageId = await this.session.ready(page);
    const record: RunManifest['segments'][number] = {
      ...definition,
      pageId,
      startMs: this.session.clock.nowMono(),
      endMs: 0,
      status: 'failed',
    };
    this.segments.push(record);
    try {
      const result = await action();
      record.status = 'passed';
      return result;
    } finally {
      record.endMs = this.session.clock.nowMono();
    }
  }
  /** Record an ordinary prerequisite/state assertion; a mismatch always fails. */
  async check(
    checkpoint: string,
    title: string,
    assertion: () => Promise<unknown>,
    page: Page = this.session.page,
  ): Promise<void> {
    if (!this.spec.checkpoints.some((c) => c.id === checkpoint))
      throw new Error(`Unknown checkpoint ${checkpoint}`);
    if (!title.trim())
      throw new Error('A checkpoint check needs a descriptive title');
    const pageId = await this.session.ready(page);
    let passed = false;
    let detail = title;
    try {
      await assertion();
      passed = true;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.observations.push({
        id: newObservationId(),
        checkpoint,
        kind: 'assertion',
        pageId,
        timeMs: this.session.clock.nowMono(),
        status: passed ? 'passed' : 'failed',
        detail: detail || title,
        data: { assertionPassed: passed, designated: false, expected: title },
      });
    }
  }
  async outcome(
    checkpoint: string,
    assertion: () => Promise<unknown>,
    page: Page = this.session.page,
  ) {
    if (!this.spec.checkpoints.some((c) => c.id === checkpoint))
      throw new Error(`Unknown checkpoint ${checkpoint}`);
    const pageId = await this.session.ready(page);
    let passed = true;
    let detail = this.spec.expected;
    try {
      await assertion();
    } catch (error) {
      // Only an assertion mismatch is a designated reproduction. Setup, locator,
      // browser and user-code errors must remain failed attempts.
      if (!isAssertionMismatch(error)) throw error;
      passed = false;
      detail = error.message;
    }
    this.designatedChecks.push(passed);
    this.observations.push({
      id: newObservationId(),
      checkpoint,
      kind: 'assertion',
      pageId,
      timeMs: this.session.clock.nowMono(),
      status: 'passed',
      detail,
      data: {
        assertionPassed: passed,
        designated: true,
        expected: this.spec.expected,
      },
    });
    return passed;
  }
  async ready(page: Page = this.session.page) {
    return this.session.ready(page);
  }
  async hitTest(
    checkpoint: string,
    target: string,
    point?: { x: number; y: number },
  ) {
    if (!this.spec.checkpoints.some((c) => c.id === checkpoint))
      throw new Error(`Unknown checkpoint ${checkpoint}`);
    const locator = this.targets.get(target);
    if (!locator) throw new Error(`Unbound target ${target}`);
    if ((await locator.count()) !== 1)
      throw new Error(`Target ${target} is absent or ambiguous`);
    const pageId = await this.session.ready(locator.page());
    const bounds = await locator.boundingBox();
    if (!bounds) throw new Error(`Target ${target} has no measured bounds`);
    const attempted = point ?? {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
    const measured = await locator.evaluate(
      (element, point) => {
        const identify = (node: Element) => ({
          tag: node.tagName,
          id: node.id,
          role: node.getAttribute('role'),
          pointerEvents: getComputedStyle(node).pointerEvents,
          opacity: getComputedStyle(node).opacity,
          zIndex: getComputedStyle(node).zIndex,
          bounds: node.getBoundingClientRect().toJSON() as {
            x: number;
            y: number;
            width: number;
            height: number;
          },
        });
        // boundingBox() is in top-page CSS space, while DOM hit tests use the
        // element's own document. Translate via its measured local rectangle.
        const local = element.getBoundingClientRect();
        const stack = element.ownerDocument.elementsFromPoint(
          local.x + point.x,
          local.y + point.y,
        );
        return {
          stack: stack.map(identify),
          localOrigin: { x: local.x, y: local.y },
          topDocument: element.ownerDocument.defaultView === window.top,
          documentId:
            (window as unknown as { __REPRO_DOCUMENT_ID__?: string })
              .__REPRO_DOCUMENT_ID__ ?? null,
          intendedReceives:
            stack[0] === element || (!!stack[0] && element.contains(stack[0])),
        };
      },
      { x: attempted.x - bounds.x, y: attempted.y - bounds.y },
    );
    for (const item of measured.stack) {
      item.bounds.x += bounds.x - measured.localOrigin.x;
      item.bounds.y += bounds.y - measured.localOrigin.y;
    }
    const observationId = newObservationId();
    const sampledAt = this.session.clock.nowMono();
    const context = measured.topDocument
      ? await this.session.captureAnchor(
          locator.page(),
          `${checkpoint}-hit-${observationId}`,
          'before',
        )
      : undefined;
    const afterStack = measured.topDocument
      ? await locator.page().evaluate(
          ({ x, y }) =>
            document.elementsFromPoint(x, y).map((node) => ({
              tag: node.tagName,
              id: node.id,
              role: node.getAttribute('role'),
              pointerEvents: getComputedStyle(node).pointerEvents,
              opacity: getComputedStyle(node).opacity,
              zIndex: getComputedStyle(node).zIndex,
              bounds: node.getBoundingClientRect().toJSON() as {
                x: number;
                y: number;
                width: number;
                height: number;
              },
            })),
          attempted,
        )
      : undefined;
    const frameAligned =
      measured.topDocument &&
      JSON.stringify(measured.stack) === JSON.stringify(afterStack) &&
      sameBounds(bounds, await locator.boundingBox());
    this.observations.push({
      id: observationId,
      checkpoint,
      kind: 'hit-test',
      target,
      pageId,
      timeMs: sampledAt,
      ...(context ? { artifact: relative(this.directory, context.path) } : {}),
      status: measured.topDocument ? 'passed' : 'unsupported',
      detail: measured.topDocument
        ? 'Measured document hit-test'
        : 'Local frame sample only; ancestor-frame interception is not verified',
      bounds,
      data: {
        diagnosticFrame: context
          ? {
              timeMs: context.tMono,
              endMs: context.endMono ?? context.tMono,
              aligned: frameAligned,
              uncertaintyMs: (context.endMono ?? context.tMono) - context.tMono,
            }
          : null,
        attempted,
        stack: measured.stack,
        intendedReceives: measured.intendedReceives,
        evidenceKind: 'sampled-hit-region',
        documentId: measured.documentId,
        note: 'Point sample and measured element bounds; not a complete hitbox boundary.',
      },
    });
    return measured;
  }
  /** Snapshot presence without waiting, clicking, or inventing absent geometry. */
  async visibility(checkpoint: string, target: string) {
    const cp = this.spec.checkpoints.find((c) => c.id === checkpoint);
    if (!cp?.targets.includes(target))
      throw new Error(`Checkpoint ${checkpoint} must declare target ${target}`);
    const locator = this.targets.get(target);
    if (!locator) throw new Error(`Target ${target} has no locator binding`);
    const pageId = await this.session.ready(locator.page());
    const timeMs = this.session.clock.nowMono();
    const count = await locator.count();
    const visible = count === 1 ? await locator.isVisible() : false;
    const countAfter = await locator.count();
    const measured = count === countAfter && count <= 1;
    const previous = [...this.observations]
      .reverse()
      .find(
        (o) =>
          o.kind === 'visibility' &&
          o.target === target &&
          o.pageId === pageId &&
          o.status === 'passed',
      );
    const transition =
      !measured || !previous
        ? 'unknown'
        : previous.data?.visible === visible
          ? 'unchanged'
          : visible
            ? 'appeared'
            : 'disappeared';
    const observation: Observation = {
      id: newObservationId(),
      checkpoint,
      target,
      pageId,
      kind: 'visibility',
      timeMs,
      endMs: this.session.clock.nowMono(),
      status: measured ? 'passed' : 'unsupported',
      detail: !measured
        ? 'Target ambiguous or changed while sampling'
        : count === 0
          ? 'Target absent'
          : visible
            ? 'Target visible'
            : 'Target attached but hidden',
      data: {
        count,
        countAfter,
        attached: count > 0,
        visible: measured ? visible : null,
        transition,
        previousObservationId: previous?.id ?? null,
        semantics:
          'Playwright visibility; opacity and occlusion are not perceptibility checks',
      },
    };
    this.observations.push(observation);
    return observation;
  }
  /** Record an actual response. Register the Playwright response wait before the trigger. */
  async network(checkpoint: string, response: Response) {
    if (!this.spec.checkpoints.some((cp) => cp.id === checkpoint))
      throw new Error(`Unknown checkpoint ${checkpoint}`);
    const request = response.request();
    const page = response.frame().page();
    const pageId = await this.session.ready(page);
    const url = new URL(response.url());
    const observation: Observation = {
      id: newObservationId(),
      checkpoint,
      pageId,
      kind: 'network',
      timeMs: this.session.clock.nowMono(),
      status: 'passed',
      detail: `Observed HTTP ${response.status()}`,
      data: {
        url: `${url.protocol}//${url.host}${url.pathname}`,
        method: request.method(),
        status: response.status(),
        fromServiceWorker: response.fromServiceWorker(),
        timing: 'host-observation',
        responseTimeMs: null,
        semantics:
          'Observed response, not a success assertion or causal association',
      },
    };
    this.observations.push(observation);
    return observation;
  }
  async accessibility(checkpoint: string, page: Page = this.session.page) {
    if (!this.spec.checkpoints.some((cp) => cp.id === checkpoint))
      throw new Error(`Unknown checkpoint ${checkpoint}`);
    const pageId = await this.session.ready(page);
    const results = await new AxeBuilder({ page }).analyze();
    this.observations.push({
      id: newObservationId(),
      checkpoint,
      kind: 'accessibility',
      pageId,
      timeMs: this.session.clock.nowMono(),
      status: 'passed',
      data: {
        violations: results.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? null,
          help: v.help,
          count: v.nodes.length,
        })),
        passes: results.passes.length,
      },
    });
  }
}

export const test = base.extend<{ repro: EvidenceRecorder }>({
  repro: [
    async ({ page, context }, use, testInfo) => {
      const evidencePath = process.env.REPRO_EVIDENCE;
      if (!evidencePath)
        throw new Error(
          'Run via repro run --evidence, or set REPRO_EVIDENCE to a committed specification',
        );
      const spec = validateEvidence(
        JSON.parse(await readFile(evidencePath, 'utf8')),
      );
      const config = ReproConfigSchema.parse(
        process.env.REPRO_CONFIG
          ? JSON.parse(await readFile(process.env.REPRO_CONFIG, 'utf8'))
          : {
              mode: 'repro',
              surfaceCapture: 'page',
              profile: 'controlled',
              features: { steps: true },
              viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
            },
      );
      config.features.redaction =
        spec.privacy.strict ||
        spec.privacy.selectors.length > 0 ||
        config.features.redaction;
      config.redaction = {
        strict: spec.privacy.strict,
        masks: [
          ...new Set([
            ...(config.redaction?.masks ?? []),
            ...spec.privacy.selectors,
          ]),
        ],
      };
      const validation = validateConfig(config);
      if (!validation.ok)
        throw new Error(validation.errors.map((e) => e.message).join('; '));
      const directory = join(
        process.env.REPRO_OUT ?? testInfo.outputDir,
        `${spec.id}-${randomUUID()}`,
      );
      await mkdir(directory, { recursive: true });
      const executableIdentity =
        process.env.REPRO_SCENARIO_SOURCE_IDENTITY ??
        (await scenarioSourceIdentity([
          testInfo.file,
          ...(testInfo.config.configFile ? [testInfo.config.configFile] : []),
        ]));
      const startedAt = new Date().toISOString();
      const session = new CaptureSession({
        page,
        context,
        config,
        outputDir: directory,
        enableTrace: config.capture?.trace ?? false,
      });
      await session.start();
      const recorder = new EvidenceRecorder(session, spec, directory);
      let fixtureError: unknown;
      try {
        await use(recorder);
      } catch (error) {
        fixtureError = error;
      }
      {
        const scenarioCompletedAt = performance.now();
        const durationMs = session.clock.nowMono();
        let capture;
        try {
          capture = await session.complete();
        } catch (error) {
          try {
            await session.fail(error);
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              'Evidence capture failed during cleanup',
            );
          }
          throw error;
        }
        const run = await finishEvidence({
          directory,
          capture,
          spec,
          startedAt,
          durationMs,
          scenarioCompletedAt,
          observations: recorder.observations,
          steps: recorder.steps,
          executableIdentity,
          testCase: testInfo.titlePath.join(' > '),
          segments: recorder.segments,
          errors: testInfo.errors.map((e) => e.message ?? 'Test failed'),
          config,
          designatedChecks: recorder.designatedChecks,
          testFailed: failed(testInfo),
          ...(process.env.REPRO_BUILD_ID
            ? { buildId: process.env.REPRO_BUILD_ID }
            : {}),
          ...(process.env.REPRO_URL ? { url: process.env.REPRO_URL } : {}),
        });
        await testInfo.attach('repro-run', {
          path: join(directory, 'run.json'),
          contentType: 'application/json',
        });
        if (fixtureError)
          throw fixtureError instanceof Error
            ? fixtureError
            : new Error('Fixture failed', { cause: fixtureError });
        if (run.pipelineOutcome !== 'passed')
          throw new Error(`Evidence incomplete: ${directory}/run.json`);
      }
    },
    { auto: true },
  ],
});
function failed(info: TestInfo) {
  return info.status !== 'passed' && info.status !== undefined;
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}

/** Playwright's matcherResult is produced by an executed expect assertion. */
export function isAssertionMismatch(error: unknown): error is Error {
  if (
    !(error instanceof Error) ||
    !('matcherResult' in error) ||
    !error.matcherResult ||
    typeof error.matcherResult !== 'object'
  )
    return false;
  return !/strict mode violation|(?:page|context|browser).*closed|crashed|execution context was destroyed|invalid selector/i.test(
    error.message,
  );
}

/** Bracket screenshot capture without waiting for or altering the subject's timing. */
function sameBounds(
  a: Awaited<ReturnType<Locator['boundingBox']>>,
  b: Awaited<ReturnType<Locator['boundingBox']>>,
): boolean {
  if (!a || !b) return a === b;
  return (['x', 'y', 'width', 'height'] as const).every(
    (key) => Math.abs(a[key] - b[key]) < 0.01,
  );
}
