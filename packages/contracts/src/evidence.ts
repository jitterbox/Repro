import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const text = z.string().trim().min(1);
export const boundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export const gateStateSchema = z.enum([
  'passed',
  'failed',
  'skipped',
  'unsupported',
]);
export const captureSegmentSchema = z.object({
  id,
  title: text,
  step: id,
  pageId: text,
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  status: gateStateSchema,
});
export const evidenceSpecSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    id,
    title: text,
    variant: z.object({
      id,
      role: z.enum(['before', 'after', 'standalone']),
      label: text,
    }),
    claim: text,
    expected: text,
    targets: z.array(z.object({ id, description: text })).default([]),
    steps: z
      .array(z.object({ id, title: text, trigger: z.boolean().default(false) }))
      .min(1),
    segments: z
      .array(
        z.object({
          id,
          title: text,
          step: id,
          required: z.boolean().default(true),
        }),
      )
      .default([]),
    checkpoints: z
      .array(
        z.object({
          id,
          step: id,
          title: text,
          targets: z.array(id).default([]),
          required: z.boolean().default(true),
          observations: z
            .array(
              z.enum([
                'screenshot',
                'bounds',
                'assertion',
                'hit-test',
                'accessibility',
                'network',
              ]),
            )
            .min(1),
          timing: z.enum(['stable', 'transient']).default('stable'),
          frame: z
            .object({
              segment: id,
              event: z.object({
                kind: text,
                match: z
                  .record(
                    z.string(),
                    z.union([z.string(), z.number(), z.boolean()]),
                  )
                  .default({}),
                occurrence: z.number().int().nonnegative().default(0),
              }),
              offsetMs: z.number().default(0),
              maxOffsetMs: z
                .number()
                .nonnegative()
                .default(2000 / 30),
            })
            .optional(),
        }),
      )
      .min(1),
    outputs: z.array(z.enum(['png', 'mp4', 'review', 'package'])).min(1),
    presentation: z
      .object({
        padding: z.number().nonnegative().default(24),
        readingHoldMs: z.number().nonnegative().default(1200),
        context: z.literal(true).default(true),
      })
      .default({ padding: 24, readingHoldMs: 1200, context: true }),
    privacy: z
      .object({
        strict: z.boolean().default(true),
        selectors: z.array(text).default([]),
        patterns: z.array(text).default([]),
      })
      .default({ strict: true, selectors: [], patterns: [] }),
  })
  .strict();
export type EvidenceSpec = z.infer<typeof evidenceSpecSchema>;

export function validateEvidence(value: unknown): EvidenceSpec {
  const spec = evidenceSpecSchema.parse(value);
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(`Duplicate ${label} ID`);
  };
  unique(
    spec.targets.map((v) => v.id),
    'target',
  );
  unique(
    spec.steps.map((v) => v.id),
    'step',
  );
  unique(
    spec.checkpoints.map((v) => v.id),
    'checkpoint',
  );
  unique(
    spec.segments.map((v) => v.id),
    'segment',
  );
  for (const segment of spec.segments)
    if (!spec.steps.some((step) => step.id === segment.step))
      throw new Error(`Unknown step ${segment.step} in segment ${segment.id}`);
  if (!spec.steps.some((s) => s.trigger))
    throw new Error('At least one step must identify the trigger');
  for (const cp of spec.checkpoints) {
    if (
      cp.frame &&
      (cp.timing !== 'transient' || !cp.observations.includes('screenshot'))
    )
      throw new Error(
        `Event-linked frame ${cp.id} requires a transient screenshot checkpoint`,
      );
    if (
      cp.frame &&
      !spec.segments.some((segment) => segment.id === cp.frame?.segment)
    )
      throw new Error(`Unknown segment in ${cp.id}`);
    if (!spec.steps.some((s) => s.id === cp.step))
      throw new Error(`Unknown step ${cp.step} in ${cp.id}`);
    for (const target of cp.targets)
      if (!spec.targets.some((t) => t.id === target))
        throw new Error(`Unknown target ${target} in ${cp.id}`);
  }
  return spec;
}

export const observationSchema = z.object({
  id,
  checkpoint: id,
  kind: z.enum([
    'screenshot',
    'bounds',
    'assertion',
    'hit-test',
    'accessibility',
    'network',
  ]),
  pageId: text,
  frameId: text.optional(),
  target: id.optional(),
  timeMs: z.number().nonnegative(),
  endMs: z.number().nonnegative().optional(),
  bounds: boundsSchema.nullable().optional(),
  status: gateStateSchema,
  detail: text.optional(),
  artifact: text.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type Observation = z.infer<typeof observationSchema>;
const diagnosticSampleSchema = z.object({
  diagnosticFrame: z.object({
    aligned: z.literal(true),
    timeMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    uncertaintyMs: z.number().nonnegative(),
  }),
  stack: z
    .array(z.object({ tag: text, id: z.string(), bounds: boundsSchema }))
    .min(1),
});
/** A diagnostic outline belongs to its bracketed sample image, never a later checkpoint. */
export function hitTestOutline(observation: Observation) {
  if (
    observation.kind !== 'hit-test' ||
    observation.status !== 'passed' ||
    !observation.artifact
  )
    return null;
  const parsed = diagnosticSampleSchema.safeParse(observation.data);
  const top = parsed.success ? parsed.data.stack[0] : undefined;
  if (!parsed.success || !top) return null;
  return {
    bounds: top.bounds,
    label: `Sampled recipient: ${top.tag}${top.id ? '#' + top.id : ''}`,
    observationId: observation.id,
    frame: parsed.data.diagnosticFrame,
  };
}
/** Screenshot acquisition duration and post-capture selection error are distinct measurements. */
export function observationUncertaintyMs(observation: Observation): number {
  return Math.max(
    typeof observation.data?.uncertaintyMs === 'number'
      ? observation.data.uncertaintyMs
      : 0,
    (observation.endMs ?? observation.timeMs) - observation.timeMs,
  );
}
export const artifactSchema = z.object({
  path: text,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  kind: text,
  shareable: z.boolean(),
});
export const runManifestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id,
  scenario: z.object({
    id,
    title: text,
    specHash: text,
    executableHash: text.nullable().default(null),
    testCase: text.nullable().default(null),
  }),
  variant: evidenceSpecSchema.shape.variant,
  build: z.object({ id: text.nullable(), url: text.nullable() }),
  environment: z.record(z.string(), z.unknown()),
  tools: z.record(z.string(), text),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  scenarioOutcome: z.enum([
    'bug-reproduced',
    'fix-verified',
    'passed',
    'failed',
    'inconclusive',
  ]),
  pipelineOutcome: z.enum(['passed', 'failed', 'inconclusive']),
  steps: z.array(
    z.object({
      id,
      title: text,
      index: z.number().int().positive(),
      startMs: z.number().nonnegative(),
      endMs: z.number().nonnegative(),
    }),
  ),
  observations: z.array(observationSchema),
  segments: z.array(captureSegmentSchema).default([]),
  diagnostics: z
    .array(
      z.object({
        eventId: text,
        kind: z.enum(['console', 'exception', 'request-failure', 'http-error']),
        pageId: text,
        timeMs: z.number().nonnegative(),
        timing: z.literal('host-receipt'),
        uncertaintyMs: z.null(),
        stepId: id.nullable(),
        message: z.string(),
        level: z.string().optional(),
        requestId: z.string().optional(),
        requestStartedMs: z.number().nonnegative().optional(),
        url: z.string().optional(),
        method: z.string().optional(),
        status: z.number().int().optional(),
      }),
    )
    .default([]),
  artifacts: z.array(artifactSchema),
  stages: z.record(
    z.string(),
    z.object({
      status: gateStateSchema,
      durationMs: z.number().nonnegative(),
      cacheHit: z.boolean(),
    }),
  ),
  errors: z.array(text),
});
export type RunManifest = z.infer<typeof runManifestSchema>;

export function cropBounds(
  bounds: z.infer<typeof boundsSchema>,
  viewport: { width: number; height: number },
  padding = 24,
) {
  const x = Math.max(0, Math.min(viewport.width, bounds.x - padding));
  const y = Math.max(0, Math.min(viewport.height, bounds.y - padding));
  return {
    x,
    y,
    width: Math.max(
      0,
      Math.min(viewport.width, bounds.x + bounds.width + padding) - x,
    ),
    height: Math.max(
      0,
      Math.min(viewport.height, bounds.y + bounds.height + padding) - y,
    ),
  };
}

/** Preserve the requested CSS region while reporting the actual integer pixel crop. */
export function rasterCropBounds(
  requested: z.infer<typeof boundsSchema>,
  viewport: { width: number; height: number },
  scale: number,
) {
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error('Invalid pixel scale');
  const region = cropBounds(requested, viewport, 0);
  const x = Math.floor(region.x * scale),
    y = Math.floor(region.y * scale);
  const right = Math.min(
    Math.round(viewport.width * scale),
    Math.ceil((region.x + region.width) * scale),
  );
  const bottom = Math.min(
    Math.round(viewport.height * scale),
    Math.ceil((region.y + region.height) * scale),
  );
  const pixels = { x, y, width: right - x, height: bottom - y };
  if (pixels.width <= 0 || pixels.height <= 0)
    throw new Error('Crop has no visible pixels');
  return {
    pixels,
    css: {
      x: x / scale,
      y: y / scale,
      width: pixels.width / scale,
      height: pixels.height / scale,
    },
    scale,
  };
}

export function evidenceRequirements(
  spec: EvidenceSpec,
  observations: Observation[],
) {
  return spec.checkpoints.flatMap((cp) =>
    cp.observations.flatMap((kind) => {
      const targets: (string | undefined)[] =
        kind === 'bounds' || kind === 'hit-test' ? cp.targets : [undefined];
      return (targets.length ? targets : [undefined]).map((target) => ({
        checkpoint: cp.id,
        kind,
        target,
        required: cp.required,
        status: observations.some(
          (o) =>
            o.checkpoint === cp.id &&
            o.kind === kind &&
            o.status === 'passed' &&
            (kind !== 'screenshot' ||
              cp.timing !== 'stable' ||
              !cp.observations.includes('assertion') ||
              observations.some(
                (assertion) =>
                  assertion.checkpoint === cp.id &&
                  assertion.kind === 'assertion' &&
                  assertion.status === 'passed' &&
                  assertion.pageId === o.pageId &&
                  assertion.timeMs <= o.timeMs,
              )) &&
            (target === undefined || o.target === target),
        )
          ? ('passed' as const)
          : ('failed' as const),
      }));
    }),
  );
}

/** Structural JSON schemas plus validateEvidence's cross-reference rules form the contract. */
export const evidenceJsonSchema = z.toJSONSchema(evidenceSpecSchema, {
  io: 'input',
});
export const runJsonSchema = z.toJSONSchema(runManifestSchema);

/** Presentation edits cannot change the claim, proof requirements, or privacy policy. */
export function validatePresentationEdit(
  captured: EvidenceSpec,
  edited: EvidenceSpec,
): EvidenceSpec {
  const execution = (spec: EvidenceSpec) => ({
    ...spec,
    title: '',
    variant: { ...spec.variant, label: '' },
    steps: spec.steps.map((step) => ({ ...step, title: '' })),
    checkpoints: spec.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      title: '',
    })),
    presentation: null,
  });
  if (
    JSON.stringify(execution(captured)) !== JSON.stringify(execution(edited))
  ) {
    throw new Error(
      'Presentation edits changed execution or privacy requirements; capture a new run',
    );
  }
  return edited;
}

/** Allowlisted shareable summary: no raw events, errors, URLs, HAR or traces. */
const chapterRangeSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
  })
  .strict();
export const shareReportSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    title: text,
    variants: z
      .array(
        z
          .object({
            id,
            label: text,
            role: z.enum(['before', 'after', 'standalone']),
            outcome: runManifestSchema.shape.scenarioOutcome,
            expected: text,
            durationMs: z.number().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    chapters: z.array(
      z
        .object({
          title: text,
          timeRange: chapterRangeSchema,
          variantTimeRanges: z
            .object({
              before: chapterRangeSchema.optional(),
              after: chapterRangeSchema.optional(),
              standalone: chapterRangeSchema.optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type ShareReport = z.infer<typeof shareReportSchema>;
