import { z } from 'zod';

const hashPattern = /^[a-f0-9]{64}$/u;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const ModeSchema = z.enum(['repro', 'compare', 'demo']);

export const FeatureFlagsSchema = z
  .object({
    cursor: z.boolean().optional(),
    keystrokes: z.boolean().optional(),
    clickViz: z.boolean().optional(),
    consoleOverlay: z.boolean().optional(),
    specCard: z.boolean().optional(),
    steps: z.boolean().optional(),
    pauses: z.boolean().optional(),
    slowmo: z.boolean().optional(),
    zoom: z.boolean().optional(),
    redaction: z.boolean().optional(),
    vitalsHud: z.boolean().optional(),
    voiceover: z.boolean().optional(),
    freezeDetect: z.boolean().optional(),
    a11yOverlay: z.boolean().optional(),
    hiddenElements: z.boolean().optional(),
    hitTargets: z.boolean().optional(),
    stackingContexts: z.boolean().optional(),
    layoutShiftViz: z.boolean().optional(),
  })
  .strict();

export const CaptureProfileSchema = z.enum(['faithful', 'controlled']);
export const SurfaceCaptureSchema = z.enum(['page', 'os']);

export const EventRecordSchema = z
  .object({
    id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    schemaVersion: z.number().int().positive(),
    runId: z.string().min(1),
    pageId: z.string().min(1),
    t_mono: z.number().nonnegative(),
    t_epoch: z.number().nonnegative().optional(),
    kind: z.string().min(1),
    payload: JsonValueSchema,
    prevHash: z.string().regex(hashPattern).optional(),
    hash: z.string().regex(hashPattern),
  })
  .strict();

export const FrameRecordSchema = z
  .object({
    runId: z.string().min(1),
    pageId: z.string().min(1),
    seq: z.number().int().nonnegative(),
    sourceTs: z.number().nonnegative(),
    t_mono: z.number().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    path: z.string().min(1),
    droppedCount: z.number().int().nonnegative(),
  })
  .strict();

export const StageNameSchema = z.enum([
  'capture',
  'normalize',
  'analyze',
  'redact',
  'compose',
  'encode',
  'package',
]);

export const TimeRangeSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
  })
  .strict()
  .refine((range) => range.end >= range.start, {
    message: 'timeRange.end must be greater than or equal to start',
  });

export const AnnotationTargetSchema = z.union([
  z.string().min(1),
  z
    .object({
      selector: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().nonnegative().optional(),
      height: z.number().nonnegative().optional(),
    })
    .strict(),
]);

export const AnnotationSchema = z
  .object({
    kind: z.enum([
      'action',
      'assertion',
      'warning',
      'info',
      'measurement',
      'redaction',
    ]),
    severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
    timeRange: TimeRangeSchema,
    target: AnnotationTargetSchema.optional(),
    label: z.string().min(1),
    shape: z.enum(['rect', 'ellipse', 'path', 'underline']).optional(),
    icon: z.string().min(1).optional(),
    lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    placement: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional(),
    priority: z.number().int().min(0).default(0),
    collisionPolicy: z.enum(['avoid', 'overlay', 'hide']).default('avoid'),
    confidence: z.number().min(0).max(1).default(1),
  })
  .strict();

export const ViewportSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    deviceScaleFactor: z.number().positive().default(1),
  })
  .strict();

export const CompareConfigSchema = z
  .object({
    strategy: z
      .enum(['side-by-side', 'onion', 'difference', 'pixel-diff'])
      .optional(),
    streams: z.array(z.enum(['video', 'dom', 'pixel-diff'])).default([]),
    viewports: z.array(ViewportSchema).optional(),
  })
  .strict();

export const ReproConfigSchema = z
  .object({
    mode: ModeSchema,
    features: FeatureFlagsSchema.default({}),
    profile: CaptureProfileSchema,
    surfaceCapture: SurfaceCaptureSchema,
    timingSensitive: z.boolean().optional(),
    preserveRealTiming: z.boolean().optional(),
    showActions: z.boolean().optional(),
    redaction: z
      .object({
        strict: z.boolean().optional(),
        masks: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .optional(),
    viewport: ViewportSchema,
    compare: CompareConfigSchema.optional(),
    metadata: z.record(z.string(), JsonValueSchema).default({}),
  })
  .strict();

export type Mode = z.infer<typeof ModeSchema>;
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type CaptureProfile = z.infer<typeof CaptureProfileSchema>;
export type SurfaceCapture = z.infer<typeof SurfaceCaptureSchema>;
export type EventRecord = z.infer<typeof EventRecordSchema>;
export type FrameRecord = z.infer<typeof FrameRecordSchema>;
export type StageName = z.infer<typeof StageNameSchema>;
export type TimeRange = z.infer<typeof TimeRangeSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type ReproConfig = z.infer<typeof ReproConfigSchema>;
