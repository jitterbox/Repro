import { createHash, randomUUID } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  realpath,
} from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import { evidenceRequirements, runManifestSchema } from '@repro/contracts';
import type { EvidenceSpec, Observation, RunManifest } from '@repro/contracts';
import { normalizeCapture } from '@repro/capture';
import type { CaptureRunResult } from '@repro/capture';
import { ReproStore } from '@repro/core';
import { correlateInteractionEvents } from './interaction-events.js';
import { correlateDiagnostics } from './diagnostics.js';
import { compileEvidencePresentation } from './evidence-presentation.js';
import { ReproConfigSchema } from '@repro/contracts/config';
import { resolveEventFrames } from './event-frames.js';
import type { CapturedEvent } from './interaction-events.js';

export async function artifactRef(
  root: string,
  path: string,
  kind: string,
  shareable = false,
) {
  const bytes = await readFile(path);
  return {
    path: relative(root, path),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    kind,
    shareable,
  };
}
export async function writeJson(path: string, data: unknown) {
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function readRun(directory: string): Promise<RunManifest> {
  return runManifestSchema.parse(
    JSON.parse(await readFile(join(directory, 'run.json'), 'utf8')),
  );
}
export async function verifyRun(directory: string) {
  const run = await readRun(directory);
  for (const artifact of run.artifacts) {
    if (
      artifact.path.startsWith('/') ||
      artifact.path.split(/[\\/]/).includes('..')
    )
      throw new Error('Unsafe artifact path');
    const actual = await artifactRef(
      directory,
      await containedArtifact(directory, artifact.path),
      artifact.kind,
    );
    if (actual.sha256 !== artifact.sha256 || actual.bytes !== artifact.bytes)
      throw new Error(`Corrupt artifact: ${artifact.path}`);
  }
  return run;
}
/** Manifest references cannot escape their run through a symlink or an absolute path. */
export async function containedArtifact(
  directory: string,
  path: string,
): Promise<string> {
  if (isAbsolute(path) || path.split(/[\\/]/).includes('..'))
    throw new Error('Unsafe artifact path');
  const root = await realpath(directory);
  const file = await realpath(join(root, path));
  const fromRoot = relative(root, file);
  if (
    !fromRoot ||
    isAbsolute(fromRoot) ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`)
  )
    throw new Error('Artifact resolves outside its run');
  return file;
}
export interface FinishEvidenceInput {
  scenarioCompletedAt?: number;
  directory: string;
  capture: CaptureRunResult;
  spec: EvidenceSpec;
  startedAt: string;
  durationMs: number;
  observations: Observation[];
  steps: RunManifest['steps'];
  segments?: RunManifest['segments'];
  executableIdentity?: string;
  testCase?: string;
  errors: string[];
  buildId?: string;
  url?: string;
  config: unknown;
  designatedChecks: boolean[];
  testFailed: boolean;
}
export async function finishEvidence(input: FinishEvidenceInput) {
  const processingStarted = input.scenarioCompletedAt ?? performance.now();
  const { directory, spec, capture } = input;
  await mkdir(directory, { recursive: true });
  const store = new ReproStore(
    capture.storePath ? { path: capture.storePath } : {},
  );
  let events: CapturedEvent[];
  try {
    const lines = store.exportJsonl({
      runId: capture.runId,
      path: join(directory, 'events.jsonl'),
    });
    events = lines
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedEvent);
  } finally {
    store.close();
  }
  const observations = correlateInteractionEvents(
    input.observations,
    input.steps,
    events,
  );
  const cuts = events
    .filter((e) => e.kind === 'editorial.cut')
    .map((e) => ({ pageId: e.pageId, timeMs: e.t_mono }));
  const normalized = await normalizeCapture(directory, cuts, input.durationMs);
  const segments = input.segments ?? [];
  const missingSegments = spec.segments.filter(
    (definition) =>
      definition.required &&
      !segments.some(
        (segment) =>
          segment.id === definition.id &&
          segment.status === 'passed' &&
          input.steps.some(
            (step) =>
              step.id === definition.step &&
              step.startMs <= segment.startMs &&
              step.endMs >= segment.endMs,
          ),
      ),
  );
  observations.push(
    ...(await resolveEventFrames(
      directory,
      spec,
      segments,
      events,
      normalized.frames,
    )),
  );
  await writeJson(join(directory, 'evidence.json'), spec);
  const required = evidenceRequirements(spec, observations).filter(
    (r) => r.required,
  );
  const complete =
    missingSegments.length === 0 &&
    required.every((r) => r.status === 'passed') &&
    spec.steps.every((step) =>
      input.steps.some((observed) => observed.id === step.id),
    );
  // Ordinary checkpoint checks never qualify as designated bug failures,
  // including when caller code catches their rethrown assertion error.
  const failedChecks = input.observations.filter(
    (o) => o.kind === 'assertion' && o.status === 'failed',
  );
  const testFailed = input.testFailed || failedChecks.length > 0;
  const intended =
    spec.variant.role === 'before'
      ? input.designatedChecks.length > 0 &&
        input.designatedChecks.every((v) => !v)
      : input.designatedChecks.length > 0 &&
        input.designatedChecks.every(Boolean);
  const scenarioOutcome = testFailed
    ? 'failed'
    : input.designatedChecks.length === 0
      ? 'inconclusive'
      : spec.variant.role === 'before'
        ? intended
          ? 'bug-reproduced'
          : 'inconclusive'
        : spec.variant.role === 'after'
          ? intended
            ? 'fix-verified'
            : 'failed'
          : intended
            ? 'passed'
            : 'failed';
  const { cues, timeline } = compileEvidencePresentation(
    spec,
    {
      steps: input.steps,
      observations,
      durationMs: input.durationMs,
      scenarioOutcome,
    },
    ReproConfigSchema.parse(input.config).viewport,
    normalized.startMs,
    false,
  );
  await writeJson(join(directory, 'presentation.json'), {
    schemaVersion: '1.0.0',
    title: spec.title,
    variant: spec.variant,
    executionOffsetMs: normalized.startMs,
    readingHoldMs: spec.presentation.readingHoldMs,
    cues,
    timeline,
  });
  // Preserve pre-normalization frame identities as verified, local-only artifacts.
  const sourceFrames = await Promise.all(
    normalized.frames.map(async (frame, index) => ({
      id: `source-${index}`,
      pageId: frame.pageId,
      timeMs: frame.timeMs,
      ...(await artifactRef(directory, frame.path, 'source-frame')),
    })),
  );
  await writeJson(join(directory, 'source-frames.json'), sourceFrames);
  const artifacts = await Promise.all([
    artifactRef(
      directory,
      join(directory, 'source-frames.json'),
      'source-frame-index',
    ),
    ...sourceFrames.map((frame) =>
      Promise.resolve({
        path: frame.path,
        sha256: frame.sha256,
        bytes: frame.bytes,
        kind: frame.kind,
        shareable: false,
      }),
    ),
    artifactRef(directory, normalized.video, 'recording'),
    artifactRef(directory, join(directory, 'events.jsonl'), 'events'),
    artifactRef(
      directory,
      join(directory, 'presentation.json'),
      'presentation',
    ),
    artifactRef(directory, join(directory, 'evidence.json'), 'evidence'),
    ...observations
      .filter((o) => o.artifact)
      .map((o) =>
        artifactRef(
          directory,
          join(directory, requireValue(o.artifact)),
          'checkpoint',
        ),
      ),
  ]);
  const environment = JSON.parse(
    await readFile(capture.environmentPath, 'utf8'),
  ) as Record<string, unknown>;
  const run = runManifestSchema.parse({
    schemaVersion: '1.0.0',
    id: capture.runId,
    scenario: {
      id: spec.id,
      title: spec.title,
      executableHash: input.executableIdentity ?? null,
      testCase: input.testCase ?? null,
      specHash:
        process.env.REPRO_CODE_IDENTITY ??
        createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
    },
    variant: spec.variant,
    build: { id: input.buildId ?? null, url: input.url ?? null },
    environment: {
      ...environment,
      appliedConfiguration: input.config,
      scenarioInputCoverage: {
        staticLocalImports: input.executableIdentity ? 'hashed' : 'unknown',
        runtimeFileReads: 'unknown',
        externalDependencies: 'reported-tool-versions-only',
      },
      buildIdentitySource: input.buildId ? 'caller-supplied' : 'unknown',
      recordingStartMs: normalized.startMs,
    },
    tools: { node: process.version, playwright: '1.62.0', repro: '0.1.0' },
    startedAt: input.startedAt,
    endedAt: new Date().toISOString(),
    durationMs: input.durationMs,
    scenarioOutcome,
    pipelineOutcome:
      complete && !testFailed && !input.errors.length
        ? 'passed'
        : 'inconclusive',
    steps: input.steps,
    segments,
    observations,
    diagnostics: correlateDiagnostics(events, input.steps),
    artifacts,
    stages: {
      capture: {
        status: 'passed',
        durationMs: input.durationMs,
        cacheHit: false,
      },
      reviewPreparation: {
        status: 'passed',
        durationMs: performance.now() - processingStarted,
        cacheHit: false,
      },
    },
    errors: [
      ...input.errors,
      ...missingSegments.map(
        (segment) =>
          `Required proof segment ${segment.id} is missing, failed, or outside its declared step`,
      ),
      ...failedChecks.map(
        (o) =>
          `Checkpoint check failed at ${o.checkpoint}: ${o.detail ?? o.id}`,
      ),
      ...required
        .filter((requirement) => requirement.status !== 'passed')
        .map(
          (requirement) =>
            `Required ${requirement.kind} evidence is missing or unsupported at ${requirement.checkpoint}${requirement.target ? ` for ${requirement.target}` : ''}.${requirement.kind === 'screenshot' ? ' Stable screenshots must follow their same-page assertion.' : ''}`,
        ),
    ],
  });
  await writeJson(join(directory, 'run.json'), run);
  return run;
}
/** Compatibility adapter using the same compiler with the default viewport and execution timing. */
export function compileEvidence(
  spec: EvidenceSpec,
  steps: RunManifest['steps'],
  observations: Observation[],
) {
  const durationMs = Math.max(
    1,
    ...steps.map((s) => s.endMs),
    ...observations.map((o) => o.endMs ?? o.timeMs),
  );
  return compileEvidencePresentation(
    spec,
    { steps, observations, durationMs, scenarioOutcome: 'inconclusive' },
    { width: 1280, height: 720, deviceScaleFactor: 1 },
    0,
    false,
  ).cues;
}
export function newObservationId() {
  return randomUUID();
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
