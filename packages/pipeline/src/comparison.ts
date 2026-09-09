import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { diffGeometry } from '@repro/compare';
import type { CompareComposition } from '@repro/compare';
import type { RunManifest } from '@repro/contracts';
import {
  validateEvidence,
  parseCompareComposition,
  observationUncertaintyMs,
  mapComparisonTime,
} from '@repro/contracts';
import { containedArtifact, verifyRun, writeJson } from './evidence-run.js';
import { recordingDurationMs } from './recording-duration.js';
import { alignCheckpointImages } from './image-alignment.js';
export async function compareEvidence(
  beforeDirectory: string,
  afterDirectory: string,
  output?: string,
) {
  const before = await verifyRun(beforeDirectory),
    after = await verifyRun(afterDirectory);
  const evidence = before.artifacts.find(
    (artifact) => artifact.kind === 'evidence',
  );
  const specification = evidence
    ? validateEvidence(
        JSON.parse(
          await readFile(
            await containedArtifact(beforeDirectory, evidence.path),
            'utf8',
          ),
        ),
      )
    : undefined;
  if (before.scenario.id !== after.scenario.id)
    throw new Error('Scenario identity differs');
  if (
    before.scenario.executableHash &&
    after.scenario.executableHash &&
    before.scenario.executableHash !== after.scenario.executableHash
  )
    throw new Error(
      'Committed scenario or Playwright configuration changed; rerun the same scenario for both variants',
    );
  if (
    before.scenario.testCase &&
    after.scenario.testCase &&
    before.scenario.testCase !== after.scenario.testCase
  )
    throw new Error(
      'Different Playwright test cases cannot establish before/after proof',
    );
  const sourceVerified = Boolean(
    before.scenario.executableHash &&
    after.scenario.executableHash &&
    before.scenario.testCase &&
    after.scenario.testCase,
  );
  const afterEvidence = after.artifacts.find(
    (artifact) => artifact.kind === 'evidence',
  );
  const afterSpecification = afterEvidence
    ? validateEvidence(
        JSON.parse(
          await readFile(
            await containedArtifact(afterDirectory, afterEvidence.path),
            'utf8',
          ),
        ),
      )
    : undefined;
  if (specification && afterSpecification) {
    const definition = (spec: typeof specification) =>
      JSON.stringify({
        id: spec.id,
        claim: spec.claim,
        expected: spec.expected,
        targets: spec.targets.map((target) => target.id),
        steps: spec.steps.map(({ id, trigger }) => ({ id, trigger })),
        checkpoints: spec.checkpoints.map(({ title, ...checkpoint }) => {
          void title;
          return checkpoint;
        }),
        segments: spec.segments.map(({ title, ...segment }) => {
          void title;
          return segment;
        }),
      });
    if (definition(specification) !== definition(afterSpecification))
      throw new Error(
        'Before and after claims or committed proof requirements differ',
      );
  }
  if (before.variant.role !== 'before' || after.variant.role !== 'after')
    throw new Error('Explicit before and after roles required');
  for (const run of [before, after]) {
    if (run.environment.viewportSource !== 'page')
      throw new Error(
        'Unknown measured viewport provenance; capture a new run',
      );
    const fonts = run.environment.fontManifest;
    if (
      !Array.isArray(fonts) ||
      !fonts.length ||
      fonts.some(
        (font: unknown) =>
          !font ||
          typeof font !== 'object' ||
          !('sha256' in font) ||
          typeof font.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(font.sha256),
      )
    )
      throw new Error(
        'Unknown font provenance; capture with readable installed fonts',
      );
  }
  const fields = [
    'viewport',
    'reducedMotion',
    'locale',
    'timezone',
    'browserVersion',
    'playwrightVersion',
    'fontManifest',
  ];
  for (const field of fields)
    if (
      before.environment[field] === undefined ||
      before.environment[field] === null ||
      before.environment[field] === 'unknown' ||
      after.environment[field] === undefined ||
      JSON.stringify(before.environment[field]) !==
        JSON.stringify(after.environment[field])
    )
      throw new Error(`Incompatible or unknown environment: ${field}`);
  const controlled = (run: RunManifest) =>
    (run.environment.appliedConfiguration as { profile?: string } | undefined)
      ?.profile === 'controlled';
  if (!controlled(before) || !controlled(after))
    throw new Error('Comparison requires controlled capture');
  const a = before.observations.filter(
      (o) => o.kind === 'screenshot' && o.status === 'passed',
    ),
    b = after.observations.filter(
      (o) => o.kind === 'screenshot' && o.status === 'passed',
    );
  const offsetA = Number(before.environment.recordingStartMs ?? 0),
    offsetB = Number(after.environment.recordingStartMs ?? 0);
  const matched = a.flatMap((left) => {
    const right = b.find((r) => r.checkpoint === left.checkpoint);
    return right
      ? [
          {
            id: left.checkpoint,
            aMs: left.timeMs - offsetA,
            bMs: right.timeMs - offsetB,
            uncertaintyMs: Math.max(
              observationUncertaintyMs(left),
              observationUncertaintyMs(right),
            ),
          },
        ]
      : [];
  });
  const unmatched = [
    ...a
      .filter((o) => !b.some((r) => r.checkpoint === o.checkpoint))
      .map((o) => ({ role: 'before', checkpoint: o.checkpoint })),
    ...b
      .filter((o) => !a.some((r) => r.checkpoint === o.checkpoint))
      .map((o) => ({ role: 'after', checkpoint: o.checkpoint })),
  ];
  const images = async (directory: string, observations: typeof a) =>
    Promise.all(
      observations
        .filter((o) => o.artifact)
        .map(async (observation) => ({
          observation,
          bytes: await readFile(
            await containedArtifact(
              directory,
              requireValue(observation.artifact),
            ),
          ),
        })),
    );
  const imageMatches = unmatched.length
    ? alignCheckpointImages(
        await images(
          beforeDirectory,
          a.filter((o) => !b.some((r) => r.checkpoint === o.checkpoint)),
        ),
        await images(
          afterDirectory,
          b.filter((o) => !a.some((r) => r.checkpoint === o.checkpoint)),
        ),
        matched.map((p) => ({ aMs: p.aMs + offsetA, bMs: p.bMs + offsetB })),
      ).map((pair) => ({
        id: pair.a.checkpoint,
        afterCheckpoint: pair.b.checkpoint,
        aMs: pair.a.timeMs - offsetA,
        bMs: pair.b.timeMs - offsetB,
        changedPixelRatio: pair.ratio,
        method: 'decoded-image-heuristic' as const,
        confidence: 0.5,
      }))
    : [];
  const geometry = (run: RunManifest) =>
    run.observations
      .filter((o) => o.kind === 'bounds' && o.status === 'passed' && o.bounds)
      .map((o) => ({
        path: `${o.checkpoint}/${o.target}`,
        testId: `${o.checkpoint}/${o.target}`,
        bounds: {
          x: requireValue(o.bounds).x,
          y: requireValue(o.bounds).y,
          w: requireValue(o.bounds).width,
          h: requireValue(o.bounds).height,
        },
      }));
  const geometryDeltas = diffGeometry({
    before: geometry(before),
    after: geometry(after),
  });
  const points = [
    { aMs: 0, bMs: 0 },
    ...[...matched, ...imageMatches].sort((a, b) => a.aMs - b.aMs),
    { aMs: before.durationMs - offsetA, bMs: after.durationMs - offsetB },
  ];
  let outMs = 0;
  const knots: [number, number, number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = requireValue(points[i]),
      prev = points[i - 1];
    if (prev) {
      if (p.aMs <= prev.aMs || p.bMs <= prev.bMs)
        throw new Error('Checkpoint order is ambiguous');
      outMs += Math.max(p.aMs - prev.aMs, p.bMs - prev.bMs);
    }
    knots.push([p.aMs, p.bMs, outMs, 'confidence' in p ? p.confidence : 1]);
  }
  const presentation: NonNullable<CompareComposition['presentation']> = {
    steps: [before, after].flatMap((run, side) => {
      const spec = side === 0 ? specification : afterSpecification;
      const offset = side === 0 ? offsetA : offsetB;
      return run.steps.map((step) => ({
        id: step.id,
        role: side === 0 ? ('before' as const) : ('after' as const),
        index: step.index,
        title: spec?.steps.find((s) => s.id === step.id)?.title ?? step.title,
        trigger: spec?.steps.find((s) => s.id === step.id)?.trigger ?? false,
        startMs: mapComparisonTime(
          Math.max(0, step.startMs - offset),
          knots,
          side === 0 ? 0 : 1,
          2,
        ),
        endMs: mapComparisonTime(
          Math.max(0, step.endMs - offset),
          knots,
          side === 0 ? 0 : 1,
          2,
        ),
      }));
    }),
    outcomes: [before, after].flatMap((run, side) => {
      const checks = run.observations.filter(
        (o) =>
          o.kind === 'assertion' &&
          o.status === 'passed' &&
          o.data?.designated === true,
      );
      if (!checks.length) return [];
      const spec = side === 0 ? specification : afterSpecification;
      return [
        {
          role: side === 0 ? ('before' as const) : ('after' as const),
          label: {
            'bug-reproduced': 'Bug reproduced',
            'fix-verified': 'Fix verified',
            passed: 'Passed',
            failed: 'Failed',
            inconclusive: 'Inconclusive',
          }[run.scenarioOutcome],
          expected: spec?.expected ?? 'Expected result unavailable',
          observed: checks.every((o) => o.data?.assertionPassed === true)
            ? 'All designated checks passed'
            : 'Designated check failed',
          atMs: mapComparisonTime(
            Math.max(...checks.map((o) => o.timeMs)) -
              (side === 0 ? offsetA : offsetB),
            knots,
            side === 0 ? 0 : 1,
            2,
          ),
          observationRefs: checks.map((o) => o.id),
        },
      ];
    }),
  };
  const composition: CompareComposition = {
    schemaVersion: '1.0.0',
    bugId: before.scenario.title,
    presentation,
    layout: 'side-by-side',
    output: { width: 1280, height: 720, fps: 30 },
    panes: {
      a: { runId: before.id, role: 'before', label: before.variant.label },
      b: { runId: after.id, role: 'after', label: after.variant.label },
    },
    sync: {
      strategy: imageMatches.length
        ? 'anchors-with-image-fallback'
        : 'anchors-only',
      knots,
      anchors: matched.map((p) => ({
        stepId: p.id,
        aMs: p.aMs,
        bMs: p.bMs,
        title:
          specification?.checkpoints.find((cp) => cp.id === p.id)?.title ??
          p.id,
      })),
      lowConfidenceSpans: [
        ...matched
          .filter((p) => p.uncertaintyMs > 2000 / 30)
          .map((p) => ({
            outStartMs: knots.find((k) => k[0] === p.aMs)?.[2] ?? 0,
            outEndMs:
              (knots.find((k) => k[0] === p.aMs)?.[2] ?? 0) + p.uncertaintyMs,
            confidence: 0.5,
          })),
        ...imageMatches.map((p) => {
          const index = knots.findIndex((k) => k[0] === p.aMs);
          return {
            outStartMs: knots[Math.max(0, index - 1)]?.[2] ?? 0,
            outEndMs:
              knots[Math.min(knots.length - 1, index + 1)]?.[2] ?? outMs,
            confidence: p.confidence,
          };
        }),
      ],
    },
    deltas: geometryDeltas.map((d) => ({
      selector: d.key,
      class: 'geometry',
      dx: d.dx,
      dy: d.dy,
      dw: d.dw,
      dh: d.dh,
      caption: d.caption,
    })),
  };
  const result = {
    schemaVersion: '1.0.0',
    ok:
      sourceVerified &&
      Boolean(specification && afterSpecification) &&
      before.pipelineOutcome === 'passed' &&
      after.pipelineOutcome === 'passed' &&
      unmatched.length === 0 &&
      matched.length > 0 &&
      matched.every((p) => p.uncertaintyMs <= 2000 / 30) &&
      before.scenarioOutcome === 'bug-reproduced' &&
      after.scenarioOutcome === 'fix-verified',
    before: before.id,
    scenarioSource: sourceVerified ? 'verified' : 'unknown',
    after: after.id,
    matched,
    imageMatches,
    unmatched,
    geometryDeltas,
    composition: parseCompareComposition(composition),
    originalDurations: {
      before: await recordingDurationMs(beforeDirectory, before),
      after: await recordingDurationMs(afterDirectory, after),
    },
  };
  await writeJson(output ?? join(afterDirectory, 'comparison.json'), result);
  return result;
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
