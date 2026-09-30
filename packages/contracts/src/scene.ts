import { z } from 'zod';

const id = z.string().min(1);
const ms = z.number().nonnegative();
export const sceneRectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const treatmentSchema = z.strictObject({
  id,
  kind: z.enum([
    'highlight',
    'magnifier',
    'alignment',
    'slowmo',
    'data-panel',
    'callout',
  ]),
  checkpoint: id.optional(),
  target: id.optional(),
  reference: id.optional(),
  segment: id.optional(),
  eventKind: id.optional(),
  title: z.string().min(1).max(160),
  rationale: z.string().min(1),
  detail: z.string().default(''),
  severity: z.enum(['normal', 'critical']).default('normal'),
  expected: z.string().optional(),
  stateKey: id.optional(),
  eventMatch: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  valuePath: z.string().optional(),
  format: z.enum(['value', 'object', 'events', 'sparkline']).default('value'),
  unit: z.string().default(''),
  dotted: z.boolean().default(false),
  required: z.boolean().default(true),
  magnification: z.union([z.literal(2), z.literal(4)]).default(2),
  rate: z.union([z.literal(0.1), z.literal(0.2)]).default(0.2),
  axis: z.enum(['x', 'y']).default('x'),
});
/** All dimensions are logical output pixels before outputScale. */
export const sceneStyleSchema = z.strictObject({
  bodyFontSize: z.number().min(12).max(32).default(18),
  headingFontSize: z.number().min(14).max(40).default(20),
  titleFontSize: z.number().min(18).max(48).default(28),
  dataFontSize: z.number().min(10).max(28).default(14),
  lineHeight: z.number().min(1.1).max(2).default(1.4),
  cardWidth: z.number().int().min(280).max(640).default(336),
  cardPadding: z.number().int().min(8).max(32).default(12),
  cardRadius: z.number().min(0).max(24).default(8),
  cardGap: z.number().min(8).max(64).default(16),
  outerInset: z.number().int().min(16).max(80).default(24),
  gutterGap: z.number().int().min(16).max(96).default(24),
  sourceTop: z.number().int().min(80).max(240).default(96),
  mobileSourceTop: z.number().int().min(112).max(280).default(128),
  minHeight: z.number().int().min(720).max(2160).default(960),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#101721'),
  cardBackground: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#1c2734'),
  foreground: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#edf3f8'),
  criticalAccent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#f0b86c'),
  criticalBackground: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#30251e'),
  cursorColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#66d4e5'),
});
export const sceneTimingSchema = z.strictObject({
  entryMs: z.number().int().min(0).max(500).default(150),
  exitMs: z.number().int().min(0).max(500).default(200),
  readingHoldMs: z.number().int().min(4000).max(30000).default(5400),
  outcomeHoldMs: z.number().int().min(1000).max(15000).default(2200),
  clickWaveMs: z.number().int().min(200).max(1000).default(350),
});
export const sceneEncodingSchema = z.strictObject({
  crf: z.number().int().min(0).max(35).default(18),
  preset: z
    .enum([
      'ultrafast',
      'superfast',
      'veryfast',
      'faster',
      'fast',
      'medium',
      'slow',
      'slower',
      'veryslow',
    ])
    .default('veryfast'),
});
export const sceneLayoutSchema = z.strictObject({
  overlayPanels: z.enum(['never', 'as-needed']).default('as-needed'),
  retireSteps: z.boolean().default(true),
  minStepVisibleMs: z.number().int().min(1000).max(30000).default(5000),
  useHeaderSpace: z.boolean().default(true),
  protectedPadding: z.number().min(8).max(48).default(12),
  protectedRegions: z.array(sceneRectSchema).default([]),
});
const scenePreferences = {
  layout: sceneLayoutSchema.prefault({}),
  style: sceneStyleSchema.prefault({}),
  timing: sceneTimingSchema.prefault({}),
  encoding: sceneEncodingSchema.prefault({}),
};

export const treatmentPlanSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  ...scenePreferences,
  treatments: z.array(treatmentSchema).default([]),
  steps: z
    .array(
      z.strictObject({
        step: id,
        text: z.string().optional(),
        sequence: id.default('main'),
        numbered: z.boolean().default(true),
      }),
    )
    .default([]),
  outputScale: z.union([z.literal(1), z.literal(2)]).default(1),
  actionAudio: z.boolean().default(false),
  cursorGlow: z.boolean().default(true),
});
export function parseTreatmentPlan(value: unknown) {
  const plan = treatmentPlanSchema.parse(value);
  if (new Set(plan.treatments.map((t) => t.id)).size !== plan.treatments.length)
    throw new Error('Duplicate treatment ID');
  for (const t of plan.treatments) {
    if (
      ['highlight', 'magnifier', 'alignment', 'callout'].includes(t.kind) &&
      (!t.checkpoint || !t.target)
    )
      throw new Error(`${t.id}: measured checkpoint and target required`);
    if (t.kind === 'alignment' && !t.reference)
      throw new Error(`${t.id}: reference target required`);
    if (t.kind === 'slowmo' && !t.segment)
      throw new Error(`${t.id}: recorded segment required`);
    if (t.kind === 'data-panel' && !t.eventKind)
      throw new Error(`${t.id}: eventKind required`);
  }
  return plan;
}
export const sceneSegmentSchema = z.strictObject({
  id,
  kind: z.enum(['play', 'hold', 'insert']),
  outStartMs: ms,
  outDurationMs: z.number().positive(),
  sourceStartMs: ms.optional(),
  rate: z.number().nonnegative(),
  pageId: id.optional(),
  checkpoint: id.optional(),
  label: z.string().optional(),
});
export const sceneCueSchema = z.strictObject({
  id,
  kind: z.enum([
    'title',
    'app-version',
    'step',
    'highlight',
    'magnifier',
    'alignment',
    'data-panel',
    'outcome',
    'pointer',
    'marker',
    'callout',
  ]),
  startMs: ms,
  endMs: ms,
  layer: z.number().int(),
  title: z.string(),
  detail: z.string().default(''),
  severity: z.enum(['normal', 'critical']).default('normal'),
  expected: z.string().optional(),
  observed: z.string().optional(),
  format: z.enum(['value', 'object', 'events', 'sparkline']).default('value'),
  unit: z.string().default(''),
  evidenceRefs: z.array(id).default([]),
  target: sceneRectSchema.optional(),
  reference: sceneRectSchema.optional(),
  placement: sceneRectSchema.optional(),
  step: z.number().int().positive().optional(),
  magnification: z.number().positive().optional(),
  axis: z.enum(['x', 'y']).optional(),
  dotted: z.boolean().default(false),
  points: z
    .array(z.strictObject({ x: z.number(), y: z.number(), timeMs: ms }))
    .default([]),
  action: z
    .enum(['click', 'double-click', 'right-click', 'hold', 'drag', 'cancel'])
    .optional(),
  samples: z
    .array(
      z.strictObject({
        timeMs: ms,
        text: z.string(),
        value: z.number().optional(),
      }),
    )
    .default([]),
});
export const scenePlanSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  renderer: z.literal('hyperframes'),
  ...scenePreferences,
  viewport: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  output: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.literal(30),
  }),
  outputScale: z.union([z.literal(1), z.literal(2)]).default(1),
  actionAudio: z.boolean().default(false),
  cursorGlow: z.boolean().default(true),
  privacyMasks: z.array(sceneRectSchema).default([]),
  cursorSamples: z
    .array(
      z.strictObject({
        x: z.number(),
        y: z.number(),
        timeMs: ms,
        pageId: id,
        phase: z.string(),
      }),
    )
    .default([]),
  sourceOrigin: z.strictObject({ x: ms, y: ms }),
  segments: z.array(sceneSegmentSchema).min(1),
  cues: z.array(sceneCueSchema),
});
export type TreatmentPlan = z.infer<typeof treatmentPlanSchema>;
export type ScenePlan = z.infer<typeof scenePlanSchema>;
export type SceneCue = z.infer<typeof sceneCueSchema>;
export type SceneRect = z.infer<typeof sceneRectSchema>;
export type SceneSegment = z.infer<typeof sceneSegmentSchema>;
export function parseScenePlan(value: unknown): ScenePlan {
  const scene = scenePlanSchema.parse(value);
  let end = 0;
  for (const segment of scene.segments) {
    if (Math.abs(segment.outStartMs - end) > 0.001)
      throw new Error('Scene segments must be contiguous');
    if (segment.kind !== 'insert' && segment.sourceStartMs === undefined)
      throw new Error('Missing source time');
    if (
      (segment.kind === 'hold') !== (segment.rate === 0) &&
      segment.kind !== 'insert'
    )
      throw new Error('Invalid segment rate');
    end += segment.outDurationMs;
  }
  const ids = scene.cues.map((c) => c.id);
  if (new Set(ids).size !== ids.length)
    throw new Error('Duplicate scene cue ID');
  for (const cue of scene.cues)
    if (cue.endMs <= cue.startMs || cue.endMs > end + 0.001)
      throw new Error(`Invalid cue interval: ${cue.id}`);
  return scene;
}
/** Output time is unambiguous even when the same source interval is replayed. */
export function sceneSourceAt(scene: ScenePlan, outputMs: number) {
  const segment = scene.segments.find(
    (s) =>
      outputMs >= s.outStartMs && outputMs < s.outStartMs + s.outDurationMs,
  );
  if (
    !segment ||
    segment.kind === 'insert' ||
    segment.sourceStartMs === undefined
  )
    return null;
  return {
    segment,
    sourceMs:
      segment.sourceStartMs + (outputMs - segment.outStartMs) * segment.rate,
  };
}
export const treatmentPlanJsonSchema = {
  $id: 'https://repro.dev/schemas/treatment-plan.schema.json',
  ...z.toJSONSchema(treatmentPlanSchema, { io: 'input' }),
};
export const scenePlanJsonSchema = {
  $id: 'https://repro.dev/schemas/scene-plan.schema.json',
  ...z.toJSONSchema(scenePlanSchema, { io: 'input' }),
};

export const treatmentCatalog = [
  {
    kind: 'callout',
    needs:
      'Measured checkpoint target; source-linked expected and observed detail',
    use: 'Explain a defect with severity critical, or give ordinary instructions with severity normal',
    avoid: 'Presenting an expected value as measured evidence',
  },
  {
    kind: 'highlight',
    needs: 'Aligned checkpoint bounds and screenshot',
    use: 'Direct attention to the affected control',
    avoid: 'Covering focus rings or the edge being measured',
  },
  {
    kind: 'magnifier',
    needs: 'Aligned checkpoint bounds and screenshot',
    use: 'Expose small details at 2× or 4× from the same sanitized pixels',
    avoid: 'Inventing detail or magnifying stale geometry',
  },
  {
    kind: 'alignment',
    needs: 'Two targets measured against the same screenshot',
    use: 'Show a measured horizontal or vertical edge gap',
    avoid: 'Treating ticket coordinates as measurements',
  },
  {
    kind: 'slowmo',
    needs: 'Recorded segment with captured decisive frames',
    use: 'Replay a brief event at 0.2× or 0.1×',
    avoid: 'Claiming a missed transient was captured',
  },
  {
    kind: 'data-panel',
    needs:
      'Recorded events matching eventKind and optional eventMatch; explicit valuePath, format value/object/events/sparkline',
    use: 'Explain relevant console, network, or performance observations',
    avoid: 'Inferring causation from temporal proximity',
  },
];
