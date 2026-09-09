import type {
  EventRecord,
  FrameRecord,
  ReproConfig,
  TimeRange,
  Viewport,
} from './config.js';

import type { Beat, BeatBadge, Timeline } from './timeline.js';
import { timelineSchema, parseTimeline } from './timeline.js';
import { z } from 'zod';
import {
  AnnotationSchema,
  FeatureFlagsSchema,
  TimeRangeSchema,
  ViewportSchema,
} from './config.js';
import { annotationComponentSchema } from './annotation-component.js';

export type { TimeRange };
export type { Beat, BeatBadge, Timeline };

const ms = z.number().nonnegative();
export const pointSchema = z
  .strictObject({ x: z.number(), y: z.number() })
  .readonly();
export const rectSchema = z
  .strictObject({ x: z.number(), y: z.number(), width: ms, height: ms })
  .readonly();
export const leaderLineSchema = z
  .strictObject({ from: pointSchema, to: pointSchema })
  .readonly();
export const annotationAnchorSchema = z
  .strictObject({
    selector: z.string().optional(),
    pageId: z.string().optional(),
    bbox: z
      .strictObject({ x: z.number(), y: z.number(), w: ms, h: ms })
      .readonly()
      .optional(),
    track: z.enum(['static', 'sticky', 'path']).optional(),
    pad: ms.optional(),
    evidenceRef: z.string().optional(),
  })
  .readonly();
export const annotationPlateSchema = z
  .strictObject({
    kicker: z.string().optional(),
    label: z.string().optional(),
    measurement: z.string().optional(),
    maxChars: z.number().int().positive().optional(),
  })
  .readonly();
export const annotationBoxSchema = AnnotationSchema.extend({
  fontSize: z.number().positive().optional(),
  id: z.string().min(1),
  feature: z.enum([
    ...FeatureFlagsSchema.keyof().options,
    'chapter',
    'progress',
    'outcome',
  ]),
  component: annotationComponentSchema.optional(),
  renderer: z.enum(['ass', 'compositor']).optional(),
  beatId: z.string().optional(),
  outTimeRange: TimeRangeSchema.optional(),
  anchor: annotationAnchorSchema.optional(),
  plate: annotationPlateSchema.optional(),
  bounds: rectSchema,
  leaderLine: leaderLineSchema.optional(),
  cursorSegment: leaderLineSchema.optional(),
}).readonly();
export const chapterSchema = z
  .strictObject({
    id: z.string().min(1),
    title: z.string(),
    timeRange: TimeRangeSchema,
    outTimeRange: TimeRangeSchema.optional(),
  })
  .readonly();
export const narrationSegmentSchema = z
  .strictObject({
    id: z.string().min(1),
    text: z.string(),
    timeRange: TimeRangeSchema,
    outTimeRange: TimeRangeSchema.optional(),
  })
  .readonly();
const segmentSchema = z
  .strictObject({
    id: z.string().min(1),
    kind: z.enum(['pause', 'slowmo']),
    timeRange: TimeRangeSchema,
    factor: z.number().positive(),
  })
  .readonly();
export const beatDraftSchema = z
  .strictObject({
    id: z.string().min(1),
    kind: z.enum(['play', 'hold', 'insert', 'trim', 'pause', 'slowmo']),
    captureStartMs: ms.optional(),
    captureEndMs: ms.optional(),
    captureAtMs: ms.optional(),
    rate: z.number().positive().optional(),
    minOutDurationMs: ms.optional(),
    badge: z.enum(['PAUSED', 'FREEZE', 'SLOWMO']).optional(),
    assetRef: z.string().optional(),
  })
  .readonly();
export const planSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    viewport: ViewportSchema,
    annotations: z.array(annotationBoxSchema).readonly(),
    chapters: z.array(chapterSchema).readonly(),
    narrationSegments: z.array(narrationSegmentSchema).readonly().optional(),
    redactionRects: z.array(rectSchema).readonly(),
    segments: z.array(segmentSchema).readonly(),
    timeline: timelineSchema,
    metadata: z
      .strictObject({
        durationMs: ms,
        generatedAtEpoch: ms,
        bugId: z.string().optional(),
        redactionMethod: z.string().optional(),
      })
      .readonly(),
  })
  .readonly();
export type Point = z.infer<typeof pointSchema>;
export type Rect = z.infer<typeof rectSchema>;
export type LeaderLine = z.infer<typeof leaderLineSchema>;
export type AnnotationBox = z.infer<typeof annotationBoxSchema>;
export type AnnotationAnchor = z.infer<typeof annotationAnchorSchema>;
export type AnnotationPlate = z.infer<typeof annotationPlateSchema>;
export type CollisionPolicy = AnnotationBox['collisionPolicy'];
export type AnnotationPlacement = NonNullable<AnnotationBox['placement']>;
export type Chapter = z.infer<typeof chapterSchema>;
export type NarrationSegment = z.infer<typeof narrationSegmentSchema>;
/** @deprecated Use timeline beats; retained for existing plans. */
export type Segment = z.infer<typeof segmentSchema>;
/** @deprecated Use timeline beats; retained for existing plans. */
export type SegmentKind = Segment['kind'];
export type BeatDraft = z.infer<typeof beatDraftSchema>;
export type ReproPlan = z.infer<typeof planSchema>;
export function parsePlan(value: unknown): ReproPlan {
  const plan = planSchema.parse(value);
  parseTimeline(plan.timeline);
  return plan;
}
export const planJsonSchema = {
  $id: 'https://repro.dev/schemas/executable-plan.schema.json',
  ...z.toJSONSchema(planSchema, {
    io: 'input',
    override: ({ jsonSchema }) => {
      if (Array.isArray(jsonSchema.prefixItems)) {
        jsonSchema.minItems = jsonSchema.prefixItems.length;
        jsonSchema.maxItems = jsonSchema.prefixItems.length;
      }
    },
  }),
};

export interface KeyframeBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly channels?: 1 | 3 | 4;
}

export interface FeatureEmitInput {
  readonly config: ReproConfig;
  readonly events: readonly EventRecord[];
  readonly frames: readonly FrameRecord[];
  readonly viewport: Viewport;
}

export interface FeatureEmitResult {
  readonly annotations: readonly AnnotationBox[];
  readonly chapters: readonly Chapter[];
  readonly narrationSegments: readonly NarrationSegment[];
  /** @deprecated Prefer beatDrafts. */
  readonly segments: readonly Segment[];
  readonly beatDrafts: readonly BeatDraft[];
  readonly redactionRects: readonly Rect[];
}

export interface BuildPlanInput extends FeatureEmitInput {
  readonly keyframe?: KeyframeBuffer;
  readonly redactionRects?: readonly Rect[];
  readonly includeSlate?: boolean;
  readonly bugId?: string;
  /**
   * Decoded media length. When set, capture timeline is clamped so holds
   * land on real frames (event clocks often outlive sparse screencasts).
   */
  readonly mediaDurationMs?: number;
}
