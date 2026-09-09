import { z } from 'zod';

const text = z.string().trim().min(1);
export const discoveryConcernSchema = z.enum([
  'interaction',
  'geometry',
  'appearance',
  'transient',
  'console',
  'performance',
  'accessibility',
  'keyboard',
  'multipage',
  'privacy',
  'network',
  'native',
]);
export type DiscoveryConcern = z.infer<typeof discoveryConcernSchema>;
export const bugBriefSchema = z
  .object({
    id: text.optional(),
    title: text,
    description: z.string().default(''),
    expected: z.string().default(''),
    actual: z.string().default(''),
    steps: z.array(text).default([]),
    tags: z.array(text).default([]),
  })
  .strict();
export type BugBrief = z.infer<typeof bugBriefSchema>;

/** Agent-authored interpretation, not evidence that the application behaved this way. */
export const discoveryAssessmentSchema = z
  .object({
    claim: text,
    expected: text,
    concerns: z
      .array(
        z
          .object({
            kind: discoveryConcernSchema,
            rationale: text,
            sourceRefs: z.array(text).min(1),
          })
          .strict(),
      )
      .min(1),
    triggerStep: z.number().int().positive(),
    targets: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
            description: text.max(64),
            role: z.enum(['action', 'affected', 'reference']),
          })
          .strict(),
      )
      .min(1),
    transientFrame: z
      .object({
        kind: text,
        match: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .default({}),
        offsetMs: z.number(),
        maxOffsetMs: z
          .number()
          .nonnegative()
          .default(2000 / 30),
      })
      .strict()
      .optional(),
    uncertainties: z.array(text).default([]),
  })
  .strict();
export type DiscoveryAssessment = z.infer<typeof discoveryAssessmentSchema>;
export const bugBriefJsonSchema = z.toJSONSchema(bugBriefSchema, {
  io: 'input',
});
export const discoveryAssessmentJsonSchema = z.toJSONSchema(
  discoveryAssessmentSchema,
  { io: 'input' },
);
