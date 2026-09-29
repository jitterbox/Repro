import { readFile } from 'node:fs/promises';
import {
  devToolsReportSchema,
  parseScenePlan,
  type DevToolsReport,
  type RunManifest,
} from '@jitterbox/repro-contracts';
import { createPresidioLikeRedactor } from '@jitterbox/repro-core/redactor';
import type { ReproPlan } from '@jitterbox/repro-plan';
import { containedArtifact } from './evidence-run.js';

const privateKey =
  /^(?:authorization|proxyAuthorization|cookie|cookies|setCookie|password|passwd|secret|token|accessToken|refreshToken|apiKey|headers|requestHeaders|responseHeaders|body|requestBody|responseBody|postData|storage|localStorage|sessionStorage|html|outerHTML|innerHTML)$/i;
const normalizeKey = (key: string) => key.replace(/[-_\s]/g, '');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Scrub values and keys; raw headers, bodies, storage and HTML never enter this contract. */
export function sanitizeDiagnostic(
  value: unknown,
  patterns: readonly string[],
): unknown {
  const redactor = createPresidioLikeRedactor();
  const expressions = patterns.map((pattern) => new RegExp(pattern, 'giu'));
  const text = (input: string) => {
    let result = input
      .replace(/https?:\/\/[^\s<>"']+/giu, (url) => {
        try {
          const parsed = new URL(url);
          return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        } catch {
          return '[unavailable URL]';
        }
      })
      .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/giu, '[redacted]')
      .replace(/repro-canary-secret-[\w-]*/giu, '[redacted]');
    result = redactor.redactText(result).redacted;
    for (const expression of expressions)
      result = result.replaceAll(expression, '[redacted]');
    return result;
  };
  const visit = (item: unknown): unknown => {
    if (typeof item === 'string') return text(item);
    if (typeof item === 'number') return Number.isFinite(item) ? item : null;
    if (item === null || typeof item === 'boolean') return item;
    if (Array.isArray(item)) return item.map(visit);
    if (isRecord(item))
      return Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          text(key),
          privateKey.test(normalizeKey(key)) ||
          (key === 'key' && typeof value === 'string' && value.length === 1)
            ? '[redacted]'
            : visit(value),
        ]),
      );
    return null;
  };
  return visit(value);
}

/** Packaging checks this again against the exact bytes it will publish. */
export function assertDiagnosticPolicy(value: unknown): void {
  if (typeof value === 'string' && sanitizeDiagnostic(value, []) !== value)
    throw new Error('Unsanitized text in DevTools export');
  if (Array.isArray(value)) {
    for (const item of value) assertDiagnosticPolicy(item);
  } else if (isRecord(value))
    for (const [key, item] of Object.entries(value)) {
      if (
        (privateKey.test(normalizeKey(key)) ||
          (key === 'key' && typeof item === 'string' && item.length === 1)) &&
        item !== '[redacted]'
      )
        throw new Error('Restricted field in DevTools export');
      assertDiagnosticPolicy(key);
      assertDiagnosticPolicy(item);
    }
}

// Explicitly leave rrweb/DOM serialization and opaque application artifacts local.
const exportedKind =
  /^(?:browser\.|webmcp\.|diagnostic\.|clock\.|capture\.(?:gap|dropped|error)|screencast\.|page\.|editorial\.cut|state\.|scenario\.state|app\.|probe\.(?:browser-state|pointer:|input:key|vital:|perf:|geometry:))/;

export async function buildDevToolsReport(input: {
  directory: string;
  run: RunManifest;
  plan: ReproPlan;
  workItem: string;
  video: string;
  durationMs: number;
  patterns: readonly string[];
}): Promise<DevToolsReport> {
  const { run, directory } = input;
  const readArtifact = async (kind: string) => {
    const ref = run.artifacts.find((a) => a.kind === kind);
    return ref
      ? readFile(await containedArtifact(directory, ref.path), 'utf8')
      : undefined;
  };
  const source = await readArtifact('events');
  const raw = (source ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const selected = raw.filter(
    (event) => typeof event.kind === 'string' && exportedKind.test(event.kind),
  );
  const offset = Number(run.environment.recordingStartMs ?? 0);
  const sceneText = await readArtifact('presentation-scene');
  const scene = sceneText ? parseScenePlan(JSON.parse(sceneText)) : undefined;
  const frames = await readArtifact('presentation-frame-map');
  const segments = scene
    ? scene.segments.map((s) => ({
        id: s.id,
        kind: s.kind,
        outputStartMs: s.outStartMs,
        outputDurationMs: s.outDurationMs,
        sourceStartMs: s.sourceStartMs ?? null,
        rate: s.rate,
        pageId: s.pageId ?? null,
      }))
    : input.plan.timeline.beats
        .filter((beat) => beat.kind !== 'trim')
        .map((beat) => ({
          id: beat.id,
          kind: beat.kind,
          outputStartMs: beat.outStartMs,
          outputDurationMs: beat.outDurationMs,
          sourceStartMs:
            beat.source === 'capture'
              ? (beat.captureAtMs ?? beat.captureStartMs ?? 0) + offset
              : null,
          rate: beat.kind === 'hold' ? 0 : beat.rate,
          pageId: null,
        }));
  const report = {
    schemaVersion: '1.0.0',
    kind: 'repro-devtools',
    workItem: input.workItem,
    variant: run.variant,
    runId: run.id,
    video: input.video,
    clock: {
      source: 'run-monotonic-ms',
      recordingStartMs: offset,
      captureDurationMs: run.durationMs,
      outputDurationMs: input.durationMs,
    },
    segments,
    frames: frames
      ? (JSON.parse(frames) as Record<string, unknown>[]).map((f) => ({
          frame: f.frame,
          outputMs: f.outputMs,
          sourceMs: f.sourceMs,
          capturedSourceMs: f.capturedSourceMs,
          sourceFrameId: f.sourceFrameId,
          pageId: f.pageId,
          segmentId: f.segmentId,
        }))
      : [],
    events: selected.map((event) => {
      const data = isRecord(event.payload) ? event.payload : {};
      const clock = isRecord(data.captureClock) ? data.captureClock : {};
      return {
        id: event.id,
        kind: event.kind,
        pageId: event.pageId,
        timeMs: event.t_mono,
        uncertaintyMs: data.uncertaintyMs ?? clock.uncertaintyMs ?? null,
        timing: data.timing ?? clock.method ?? 'host-receipt',
        data,
      };
    }),
    checkpoints: run.observations.map((o) => ({
      id: o.id,
      checkpoint: o.checkpoint,
      kind: o.kind,
      pageId: o.pageId,
      timeMs: o.timeMs,
      ...(o.endMs === undefined ? {} : { endMs: o.endMs }),
      status: o.status,
      ...(o.target ? { target: o.target } : {}),
      ...(o.bounds === undefined ? {} : { bounds: o.bounds }),
      // Text content/accessibility labels may belong to a selector protected in pixels.
      // Publish measured geometry/styles, never a second unmasked DOM text snapshot.
      data:
        o.kind === 'bounds' && isRecord(o.data?.computed)
          ? {
              computed: Object.fromEntries(
                Object.entries(o.data.computed).filter(
                  ([key]) => !['text', 'ariaLabel'].includes(key),
                ),
              ),
            }
          : {},
    })),
    coverage: selected
      .filter((e) => e.kind === 'diagnostic.coverage')
      .map((e) => e.payload),
    omittedEventCount: raw.length - selected.length,
    limitations: [
      'Captured observations only; this is not a complete browser memory dump or a Chrome-importable trace.',
      'Source timestamps are run-monotonic milliseconds. Use segments and frame mappings for holds, replay and slow motion; null uncertainty remains unknown.',
      'Raw trace/rrweb files, DOM text, credentials, headers, bodies and storage remain local. URLs omit credentials, query strings and fragments.',
      ...(source
        ? []
        : [
            'This older run has no verified diagnostic event stream. Missing data was not recreated.',
          ]),
      ...(frames
        ? []
        : [
            'Legacy presentation has segment timing only; exact source-frame identities were not recorded in its presentation.',
          ]),
    ],
  };
  const safe = devToolsReportSchema.parse(
    sanitizeDiagnostic(report, input.patterns),
  );
  assertDiagnosticPolicy(safe);
  return safe;
}
