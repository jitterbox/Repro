import { z } from 'zod';
import { JsonValueSchema } from './config.js';

const ms = z.number().nonnegative();
/** A portable synchronized diagnostic report, not a raw browser profile or trace. */
export const devToolsReportSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  kind: z.literal('repro-devtools'),
  workItem: z.string().min(1),
  variant: z.strictObject({
    id: z.string(),
    label: z.string(),
    role: z.enum(['before', 'after', 'standalone']),
  }),
  runId: z.string(),
  video: z.string().regex(/^[^/\\]+\.mp4$/),
  clock: z.strictObject({
    source: z.literal('run-monotonic-ms'),
    recordingStartMs: ms,
    captureDurationMs: ms,
    outputDurationMs: ms,
  }),
  segments: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.enum(['play', 'hold', 'insert']),
      outputStartMs: ms,
      outputDurationMs: ms,
      sourceStartMs: ms.nullable(),
      rate: z.number().nonnegative(),
      pageId: z.string().nullable(),
    }),
  ),
  frames: z.array(
    z.strictObject({
      frame: z.number().int().nonnegative(),
      outputMs: ms,
      sourceMs: ms,
      capturedSourceMs: ms,
      sourceFrameId: z.string(),
      pageId: z.string(),
      segmentId: z.string(),
    }),
  ),
  events: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.string(),
      pageId: z.string(),
      timeMs: ms,
      uncertaintyMs: ms.nullable(),
      timing: z.string(),
      data: z.record(z.string(), JsonValueSchema),
    }),
  ),
  checkpoints: z.array(
    z.strictObject({
      id: z.string(),
      checkpoint: z.string(),
      kind: z.string(),
      pageId: z.string(),
      timeMs: ms,
      endMs: ms.optional(),
      status: z.string(),
      target: z.string().optional(),
      bounds: z
        .strictObject({ x: z.number(), y: z.number(), width: ms, height: ms })
        .nullable()
        .optional(),
      data: z.record(z.string(), JsonValueSchema),
    }),
  ),
  coverage: z.array(z.record(z.string(), JsonValueSchema)),
  omittedEventCount: z.number().int().nonnegative(),
  limitations: z.array(z.string()),
});
export type DevToolsReport = z.infer<typeof devToolsReportSchema>;
export const devToolsReportJsonSchema = z.toJSONSchema(devToolsReportSchema);
