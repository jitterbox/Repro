import { z } from 'zod';
import type { ModeSchema } from './config.js';
export const gateStatusSchema = z.enum([
  'passed',
  'failed',
  'skipped',
  'unsupported',
]);
export const qualityResultSchema = z.strictObject({
  name: z.string().min(1),
  pass: z.boolean(),
  status: gateStatusSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type QualityResult = z.infer<typeof qualityResultSchema>;
/** Compatibility for low-level gate implementations. Public results normalize status. */
export type GateResult = Omit<QualityResult, 'status'> & {
  readonly status?: QualityResult['status'];
};
export type ReproMode = z.infer<typeof ModeSchema>;
export interface DeterministicGateInput {
  readonly videoPath?: string;
  readonly planPath?: string;
  readonly timelinePath?: string;
  readonly compositionPath?: string;
  readonly baselineTimelinePath?: string;
  readonly filename?: string;
  readonly mode?: ReproMode;
  readonly bugId?: string;
  readonly strictRedaction?: boolean;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}
export function normalizeQualityResult(result: GateResult): QualityResult {
  const value = qualityResultSchema.parse({
    ...result,
    status: result.status ?? (result.pass ? 'passed' : 'failed'),
  });
  if (
    (value.status === 'passed' && !value.pass) ||
    (['failed', 'unsupported'].includes(value.status) && value.pass)
  )
    throw new Error(`Quality status contradicts pass value: ${value.name}`);
  return value;
}
