import { probeMediaDurationMs, PRIVACY_RENDER_METHOD } from '@repro/render';
import { readFile } from 'node:fs/promises';
import {
  validateEvidence,
  shareReportSchema,
  parseScenePlan,
} from '@repro/contracts';
import { mapTime, type ReproPlan } from '@repro/plan';
import { join, basename } from 'node:path';
import { verifyRun } from './evidence-run.js';
import { compareEvidence } from './comparison.js';
import { recordingDurationMs } from './recording-duration.js';
import { packageCommand, type EvidenceAssetInput } from './commands/package.js';

async function presentation(directory: string, draft = false) {
  const run = await verifyRun(directory);
  if (
    run.pipelineOutcome !== 'passed' ||
    !['bug-reproduced', 'fix-verified', 'passed'].includes(run.scenarioOutcome)
  )
    throw new Error('Required evidence or designated outcome is missing');
  if (run.stages.presentation?.status !== 'passed')
    throw new Error(
      'Presentation is incomplete or failed; inspect and rerender before export',
    );
  if (run.artifacts.some((a) => a.kind === 'presentation-scene') && !draft)
    throw new Error(
      'Scene renderer awaits visual acceptance. Use --draft for an OCR-audited acceptance bundle; final-quality scene export is not promoted yet.',
    );
  const media = run.artifacts.find((a) => a.kind === 'presentation-video');
  const planArtifact = run.artifacts.find((a) =>
    a.kind.startsWith('presentation-key:'),
  );
  if (!media || !planArtifact)
    throw new Error(
      'Render and inspect presentation media before export; raw captures remain local',
    );
  const source =
    run.artifacts.find((a) => a.kind === 'presentation-spec')?.path ??
    'evidence.json';
  const spec = validateEvidence(
    JSON.parse(await readFile(join(directory, source), 'utf8')),
  );
  let plan = JSON.parse(
    await readFile(join(directory, planArtifact.path), 'utf8'),
  ) as ReproPlan;
  const sceneRef = run.artifacts.find((a) => a.kind === 'presentation-scene');
  if (sceneRef) {
    const scene = parseScenePlan(
      JSON.parse(await readFile(join(directory, sceneRef.path), 'utf8')),
    );
    plan = {
      ...plan,
      annotations: plan.annotations.map((annotation) => {
        const cue = scene.cues.find(
          (c) =>
            ['step', 'marker'].includes(c.kind) &&
            [`step-${annotation.id}`, `marker-${annotation.id}`].includes(c.id),
        );
        return cue
          ? { ...annotation, timeRange: { start: cue.startMs, end: cue.endMs } }
          : annotation;
      }),
    };
  }
  assertCurrentPrivacyPresentation(spec, plan);
  const assets: EvidenceAssetInput[] = run.artifacts.flatMap((a) => {
    const kind =
      a.kind === 'presentation-video'
        ? 'mp4'
        : a.kind === 'presentation-image'
          ? 'png'
          : a.kind === 'captions'
            ? 'vtt'
            : null;
    return kind
      ? [
          {
            kind,
            path: join(directory, a.path),
            ...(kind === 'png'
              ? {
                  title: basename(a.path).startsWith('diagnostic-')
                    ? 'Hit-test sample — measured element bounds'
                    : (spec.checkpoints.find(
                        (cp) => basename(a.path) === `${cp.id}.png`,
                      )?.title ?? 'Annotated checkpoint'),
                }
              : {}),
            ...(run.variant.role === 'standalone'
              ? {}
              : { role: run.variant.role }),
          },
        ]
      : [];
  });
  const presentationDurationMs = await probeMediaDurationMs(
    join(directory, media.path),
  );
  if (!presentationDurationMs)
    throw new Error('Presentation duration is unavailable');
  return {
    run,
    spec,
    plan,
    assets,
    presentationDurationMs,
    originalDurationMs: await recordingDurationMs(directory, run),
  };
}

/** Old pixelated or omitted selector masks must be rerendered, even after OCR passes. */
export function assertCurrentPrivacyPresentation(
  spec: Pick<ReturnType<typeof validateEvidence>, 'privacy'>,
  plan: Pick<ReproPlan, 'metadata' | 'redactionRects'>,
): void {
  if (
    (spec.privacy.selectors.length > 0 || plan.redactionRects.length > 0) &&
    plan.metadata.redactionMethod !== PRIVACY_RENDER_METHOD
  )
    throw new Error(
      'Rerender selector-protected evidence with opaque masks before export',
    );
}

/** Share only audited pixels and an allowlisted summary; raw diagnostics remain local. */
export async function exportEvidence(
  directory: string,
  outDir: string,
  baseline?: string,
  draft = false,
) {
  const current = await presentation(directory, draft);
  const previous = baseline ? await presentation(baseline, draft) : undefined;
  const items = previous ? [previous, current] : [current];
  let compare: { syncMap: [number, number, number, number][] } | undefined;
  if (previous && baseline) {
    if (
      current.run.artifacts.some((a) => a.kind === 'presentation-scene') ||
      previous.run.artifacts.some((a) => a.kind === 'presentation-scene')
    )
      throw new Error(
        'Scene paired export requires occurrence-aware synchronization; export each reviewed scene separately until that capability is available',
      );
    const measured = await compareEvidence(baseline, directory);
    if (!measured.ok)
      throw new Error(
        'Required before/after evidence is incomplete or ambiguous',
      );
    const points = measured.composition.sync.knots.map(
      (k) =>
        [
          mapTime(previous.plan.timeline, k[0]),
          mapTime(current.plan.timeline, k[1]),
        ] as const,
    );
    // The final reading hold extends beyond capture-time knots. Keep both
    // recordings seekable through their actual encoded ends.
    const lastPoint = points.at(-1);
    if (
      lastPoint &&
      (lastPoint[0] < previous.presentationDurationMs ||
        lastPoint[1] < current.presentationDurationMs)
    )
      points.push([
        previous.presentationDurationMs,
        current.presentationDurationMs,
      ]);
    const knots: [number, number, number, number][] = [];
    let output = 0;
    for (const [a, b] of points) {
      const last = knots.at(-1);
      if (last) {
        if (a <= last[0] || b <= last[1])
          throw new Error('Presentation synchronization is ambiguous');
        output += Math.max(a - last[0], b - last[1]);
      }
      knots.push([a, b, output, 1]);
    }
    compare = { syncMap: knots };
  }
  const primary = items[0] ?? current;
  const report = shareReportSchema.parse({
    schemaVersion: '1.0.0',
    title: draft ? `[DRAFT] ${primary.spec.title}` : primary.spec.title,
    variants: items.map(({ run, spec, originalDurationMs }) => ({
      id: run.variant.id,
      label: spec.variant.label,
      role: run.variant.role,
      outcome: run.scenarioOutcome,
      expected: spec.expected,
      durationMs: originalDurationMs,
    })),
    chapters: primary.spec.steps.flatMap((step) => {
      const annotation = primary.plan.annotations.find((a) => a.id === step.id);
      return annotation
        ? [
            {
              title: annotation.label,
              timeRange: annotation.timeRange,
              variantTimeRanges: Object.fromEntries(
                items.flatMap((item) => {
                  const corresponding = item.plan.annotations.find(
                    (a) => a.id === step.id,
                  );
                  return corresponding
                    ? [[item.run.variant.role, corresponding.timeRange]]
                    : [];
                }),
              ),
            },
          ]
        : [];
    }),
  });
  return packageCommand({
    outDir,
    report,
    ...(compare ? { compare } : {}),
    privacyPatterns: [
      ...new Set(items.flatMap((item) => item.spec.privacy.patterns)),
    ],
    assets: items.flatMap((item) => item.assets),
  });
}
