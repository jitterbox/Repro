import { z } from 'zod';
const ms = z.number().nonnegative();
export const beatKindSchema = z.enum(['play', 'hold', 'insert', 'trim']);
export const beatSourceSchema = z.enum(['capture', 'composited']);
export const beatBadgeSchema = z.enum(['PAUSED', 'FREEZE', 'SLOWMO']);
export const beatTransitionSchema = z
  .strictObject({ kind: z.enum(['cut', 'fade', 'dissolve']), ms })
  .readonly();
export const beatSchema = z
  .strictObject({
    id: z.string().min(1),
    kind: beatKindSchema,
    source: beatSourceSchema.default('capture'),
    assetRef: z.string().optional(),
    captureStartMs: ms.optional(),
    captureEndMs: ms.optional(),
    captureAtMs: ms.optional(),
    rate: z.number().positive().default(1),
    outStartMs: ms.default(0),
    outDurationMs: ms.default(0),
    minOutDurationMs: ms.optional(),
    chapterId: z.string().optional(),
    badge: beatBadgeSchema.optional(),
    transitionIn: beatTransitionSchema.optional(),
    transitionOut: beatTransitionSchema.optional(),
  })
  .readonly();
const timeKnotSchema = z.tuple([ms, ms]);
export const timeMapSchema = z
  .strictObject({
    kind: z.literal('piecewise-linear'),
    knots: z.array(timeKnotSchema.readonly()).readonly(),
  })
  .readonly();
export const timelineSchema = z
  .strictObject({
    schemaVersion: z.literal('1.0.0'),
    fps: z.literal(30),
    targetDurationMs: ms.optional(),
    beats: z.array(beatSchema).min(1).readonly(),
    timeMap: timeMapSchema,
    warnings: z.array(z.string()).readonly().default([]),
  })
  .readonly();
export type BeatKind = z.infer<typeof beatKindSchema>;
export type BeatSource = z.infer<typeof beatSourceSchema>;
export type BeatBadge = z.infer<typeof beatBadgeSchema>;
export type BeatTransition = z.infer<typeof beatTransitionSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type TimeMap = z.infer<typeof timeMapSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export const timelineJsonSchema = {
  $id: 'https://repro.dev/schemas/timeline.schema.json',
  title: 'Repro timeline',
  description:
    'Compiled output timing. parseTimeline additionally validates monotone time knots and capture ranges.',
  ...z.toJSONSchema(timelineSchema, {
    io: 'input',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema === timeKnotSchema) {
        jsonSchema.minItems = 2;
        jsonSchema.maxItems = 2;
      }
    },
  }),
};
export function parseTimeline(value: unknown): Timeline {
  const timeline = timelineSchema.parse(value);
  for (let index = 1; index < timeline.timeMap.knots.length; index++) {
    const previous = timeline.timeMap.knots[index - 1],
      current = timeline.timeMap.knots[index];
    if (
      previous &&
      current &&
      (current[0] < previous[0] || current[1] < previous[1])
    )
      throw new Error(
        'Timeline time map must be monotone in capture and output time',
      );
  }
  for (const beat of timeline.beats)
    if (
      beat.captureStartMs !== undefined &&
      beat.captureEndMs !== undefined &&
      beat.captureEndMs < beat.captureStartMs
    )
      throw new Error('Timeline capture range is reversed');
  return timeline;
}
