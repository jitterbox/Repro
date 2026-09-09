import { z } from 'zod';

const ms = z.number().nonnegative();
const fraction = z.number().min(0).max(1);
const text = z.string().min(1);
const knotFields = [ms, ms, ms, fraction] as const;
const syncKnotSchema = z.tuple(knotFields);
export const compareLayoutSchema = z.enum([
  'side-by-side',
  'onion',
  'wipe',
  'cropped-roi',
  'difference',
  'edge',
  'blink',
]);
export const syncAnchorSchema = z
  .strictObject({
    stepId: text,
    title: text.optional(),
    aMs: ms,
    bMs: ms,
    outMs: ms.optional(),
  })
  .readonly();
export const lowConfidenceSpanSchema = z
  .strictObject({ outStartMs: ms, outEndMs: ms, confidence: fraction })
  .readonly();
export const comparePaneSchema = z
  .strictObject({
    runId: text,
    role: z.enum(['before', 'after']),
    label: text,
    build: z.string().optional(),
    viewport: z.record(z.string(), z.unknown()).optional(),
    color: z.enum(['before', 'after']).optional(),
  })
  .readonly();
export const compareDeltaSchema = z
  .strictObject({
    selector: z.string(),
    class: z.enum([
      'geometry',
      'color',
      'typography',
      'content',
      'visibility',
      'flow',
    ]),
    dx: z.number().optional(),
    dy: z.number().optional(),
    dw: z.number().optional(),
    dh: z.number().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    caption: z.string().optional(),
    ringA: z.enum(['remove', 'change', 'before']).optional(),
    ringB: z.enum(['add', 'change', 'after']).optional(),
  })
  .readonly();

export const comparisonPresentationSchema = z
  .strictObject({
    steps: z
      .array(
        z
          .strictObject({
            id: text,
            role: z.enum(['before', 'after']),
            index: z.number().int().positive(),
            title: text,
            trigger: z.boolean(),
            startMs: ms,
            endMs: ms,
          })
          .readonly(),
      )
      .readonly(),
    outcomes: z
      .array(
        z
          .strictObject({
            role: z.enum(['before', 'after']),
            label: text,
            expected: text,
            observed: text,
            atMs: ms,
            observationRefs: z.array(text).min(1).readonly(),
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

/** Structural source for TypeScript and published JSON Schema. Cross-field rules are below. */
export const compareCompositionSchema = z
  .strictObject({
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    bugId: z.string().optional(),
    presentation: comparisonPresentationSchema.optional(),
    layout: compareLayoutSchema,
    layoutReason: z.string().optional(),
    output: z
      .strictObject({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fps: z.number().int().positive(),
        filename: z
          .string()
          // eslint-disable-next-line no-control-regex -- NUL must be rejected in both runtime paths and published JSON Schema.
          .regex(/^[^/\\\u0000]+\.mp4$/)
          .optional(),
      })
      .readonly(),
    panes: z
      .strictObject({ a: comparePaneSchema, b: comparePaneSchema })
      .readonly(),
    sync: z
      .strictObject({
        strategy: z.enum([
          'anchored-dtw',
          'anchors-only',
          'dtw-only',
          'anchors-with-image-fallback',
        ]),
        anchors: z.array(syncAnchorSchema).readonly().optional(),
        band: z
          .strictObject({
            kind: z.literal('sakoe-chiba'),
            radiusMs: ms.optional(),
          })
          .readonly()
          .optional(),
        signature: z.string().optional(),
        maxStretch: z.number().positive().optional(),
        knots: z.array(syncKnotSchema.readonly()).readonly(),
        lowConfidenceSpans: z
          .array(lowConfidenceSpanSchema)
          .readonly()
          .optional(),
      })
      .readonly(),
    onion: z
      .strictObject({
        beforeOpacity: fraction.optional(),
        ghostRing: z.boolean().optional(),
      })
      .readonly()
      .optional(),
    wipe: z
      .strictObject({
        axis: z.enum(['vertical', 'horizontal']).optional(),
        animate: z.boolean().optional(),
        restAt: fraction.optional(),
        restForMs: ms.optional(),
      })
      .readonly()
      .optional(),
    croppedRoi: z
      .strictObject({
        rect: z
          .strictObject({
            x: ms,
            y: ms,
            w: z.number().positive(),
            h: z.number().positive(),
          })
          .readonly()
          .optional(),
        magnification: z.number().positive().optional(),
      })
      .readonly()
      .optional(),
    blink: z
      .strictObject({
        hz: z.number().positive().max(2).optional(),
        optIn: z.literal(true),
      })
      .readonly()
      .optional(),
    deltas: z.array(compareDeltaSchema).readonly().optional(),
    chrome: z
      .strictObject({
        sharedRail: z.boolean().optional(),
        driftTicks: z.boolean().optional(),
        legend: z.string().optional(),
        stepCounter: z.boolean().optional(),
      })
      .readonly()
      .optional(),
    a11y: z
      .strictObject({
        blinkUsed: z.boolean().optional(),
        maxFlashHz: z.number().nonnegative().max(2).optional(),
      })
      .readonly()
      .optional(),
  })
  .readonly();

export type CompareComposition = z.infer<typeof compareCompositionSchema>;
export type CompareLayout = z.infer<typeof compareLayoutSchema>;
export type ComparePane = z.infer<typeof comparePaneSchema>;
export type CompareCompositionDelta = z.infer<typeof compareDeltaSchema>;
export type SyncAnchor = z.infer<typeof syncAnchorSchema>;
export type LowConfidenceSpan = z.infer<typeof lowConfidenceSpanSchema>;
export const compareCompositionJsonSchema = {
  $id: 'https://repro.dev/schemas/compare-composition.schema.json',
  title: 'Repro comparison composition',
  description:
    'Structural comparison contract. parseCompareComposition additionally validates pane roles, strictly increasing synchronization, measured ROI bounds and explicit blink opt-in.',
  ...z.toJSONSchema(compareCompositionSchema, {
    io: 'input',
    // The pinned exporter emits tuple prefixItems without length bounds.
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema === syncKnotSchema) {
        jsonSchema.minItems = knotFields.length;
        jsonSchema.maxItems = knotFields.length;
      }
    },
  }),
};

export function parseCompareComposition(value: unknown): CompareComposition {
  const composition = compareCompositionSchema.parse(value);
  if (
    composition.panes.a.role !== 'before' ||
    composition.panes.b.role !== 'after'
  )
    throw new Error('Comparison panes must identify before (a) and after (b)');
  if (composition.layout === 'blink' && composition.blink?.optIn !== true)
    throw new Error('Blink comparison requires explicit opt-in');
  if (composition.layout === 'cropped-roi' && !composition.croppedRoi?.rect)
    throw new Error('ROI comparison requires measured shared crop bounds');
  for (let i = 1; i < composition.sync.knots.length; i++) {
    const previous = composition.sync.knots[i - 1],
      current = composition.sync.knots[i];
    if (
      !previous ||
      !current ||
      current[0] <= previous[0] ||
      current[1] <= previous[1] ||
      current[2] <= previous[2]
    )
      throw new Error(
        'Synchronization knots must strictly increase on both sources and output',
      );
  }
  for (const span of composition.sync.lowConfidenceSpans ?? [])
    if (span.outEndMs < span.outStartMs)
      throw new Error('Low-confidence span ends before it starts');
  return composition;
}
