import { compileTimeline, mapTime, annotationsToVisualCues } from '@repro/plan';
import type { AnnotationBox } from '@repro/plan';
import { overlayTheme, visualCueSchema } from '@repro/contracts';
import type { EvidenceSpec, RunManifest } from '@repro/contracts';
import type { Viewport } from '@repro/core';

/** One deterministic source for capture plans, screenshot cues and rendered video annotations. */
export function compileEvidencePresentation(
  spec: EvidenceSpec,
  run: Pick<
    RunManifest,
    'steps' | 'durationMs' | 'observations' | 'scenarioOutcome'
  >,
  viewport: Viewport,
  offset: number,
  readingHolds = true,
) {
  const steps = run.steps.map((step) => ({
    ...step,
    title:
      spec.steps.find((definition) => definition.id === step.id)?.title ??
      step.title,
  }));
  const duration = run.durationMs - offset;
  const holdMs = readingHolds ? spec.presentation.readingHoldMs : 0;
  const timeline = compileTimeline({
    captureDurationMs: duration,
    ...(!readingHolds ? { targetDurationMs: duration } : {}),
    includeSlate: false,
    drafts: !readingHolds
      ? []
      : steps.map((step) => ({
          id: `read-${step.id}`,
          kind: 'hold' as const,
          captureAtMs: Math.max(
            0,
            Math.min(duration - 34, step.endMs - offset),
          ),
          minOutDurationMs: holdMs,
        })),
    outcomeHoldMs: holdMs,
  });
  const outputDuration = timeline.beats.reduce(
    (max, b) => Math.max(max, b.outStartMs + b.outDurationMs),
    0,
  );
  const range = (start: number, end: number) => ({
    start: Math.max(0, mapTime(timeline, start - offset)),
    end: Math.min(outputDuration, mapTime(timeline, end - offset)),
  });
  const annotation = (
    input: Partial<AnnotationBox> &
      Pick<AnnotationBox, 'id' | 'label' | 'bounds' | 'timeRange'>,
  ): AnnotationBox => ({
    kind: 'info',
    severity: 'info',
    priority: 1,
    collisionPolicy: 'overlay',
    confidence: 1,
    feature: 'steps',
    component: 'step-badge',
    renderer: 'ass',
    fontSize: overlayTheme.type.slateTitle.size,
    ...input,
  });
  const annotations: AnnotationBox[] = [
    annotation({
      id: 'title',
      label: `${spec.title} — ${spec.variant.label}`,
      bounds: { x: 24, y: 20, width: viewport.width - 48, height: 48 },
      timeRange: { start: 0, end: outputDuration },
    }),
  ];
  for (const step of steps)
    annotations.push(
      annotation({
        id: step.id,
        label: `${step.index}. ${step.title}`,
        bounds: {
          x: 24,
          y: viewport.height - 68,
          width: viewport.width - 48,
          height: 44,
        },
        timeRange: {
          start: range(step.startMs, step.endMs).start,
          end:
            step.id === steps.at(-1)?.id
              ? outputDuration
              : (timeline.beats.find((b) => b.id === `read-${step.id}`)
                  ?.outStartMs ?? range(step.startMs, step.endMs).end) + holdMs,
        },
      }),
    );
  for (const obs of run.observations) {
    if (!obs.bounds || obs.kind !== 'bounds' || obs.status !== 'passed')
      continue;
    const cp = run.observations.find(
      (o) =>
        o.checkpoint === obs.checkpoint &&
        o.kind === 'screenshot' &&
        o.status === 'passed',
    );
    if (!cp) continue;
    annotations.push(
      annotation({
        id: obs.id,
        label: `Measured bounds: ${obs.target ?? 'target'}`,
        feature: 'clickViz',
        component: 'target-ring',
        bounds: obs.bounds,
        timeRange: range(
          cp.timeMs,
          Math.min(run.durationMs, obs.endMs ?? cp.endMs ?? cp.timeMs + 34),
        ),
        anchor: {
          bbox: {
            x: obs.bounds.x,
            y: obs.bounds.y,
            w: obs.bounds.width,
            h: obs.bounds.height,
          },
          evidenceRef: obs.id,
        },
        shape: 'rect',
      }),
    );
  }
  const designated = run.observations.filter(
    (o) =>
      o.kind === 'assertion' &&
      o.status === 'passed' &&
      o.data?.designated === true,
  );
  const verifiedAt = designated.length
    ? Math.max(...designated.map((o) => range(o.timeMs, o.timeMs).start))
    : outputDuration;
  const outcomeStart = Math.max(
    verifiedAt,
    timeline.beats.at(-1)?.outStartMs ?? 0,
  );
  annotations.push(
    annotation({
      id: 'outcome',
      label: `${{ 'bug-reproduced': 'Bug reproduced', 'fix-verified': 'Fix verified', passed: 'Passed', failed: 'Failed', inconclusive: 'Inconclusive' }[run.scenarioOutcome]}: ${spec.expected}`,
      bounds: {
        x: 24,
        y: viewport.height - 166,
        width: viewport.width - 48,
        height: 44,
      },
      timeRange: { start: outcomeStart, end: outputDuration },
    }),
  );
  const cues = annotations.flatMap((annotation) => {
    const step = steps.find((s) => s.id === annotation.id);
    const common = {
      schemaVersion: '1.0.0',
      id: annotation.id,
      severity: annotation.severity,
      renderer: 'ass',
      layer: 3,
      outTimeRange: annotation.timeRange,
      accessibilityText: annotation.label,
    };
    if (step)
      return [
        visualCueSchema.parse({
          ...common,
          component: 'step-badge',
          step: {
            index: step.index,
            total: spec.steps.length,
            title: step.title,
          },
        }),
      ];
    if (annotation.id === 'title')
      return [visualCueSchema.parse({ ...common, component: 'slate' })];
    if (annotation.id === 'outcome')
      return [
        visualCueSchema.parse({
          ...common,
          component: 'outcome-pair',
          outcome: { expected: spec.expected, actual: annotation.label },
        }),
      ];
    return annotationsToVisualCues([annotation]).map((cue) =>
      visualCueSchema.parse(cue),
    );
  });
  return { steps, timeline, annotations, outputDuration, cues };
}
