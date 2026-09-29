import { z } from 'zod';

const value = z.string().trim().min(1).max(160);
export const appVersionSchema = z.object({
  version: value.optional(),
  build: value.optional(),
  sources: z
    .object({
      version: z.enum(['provided', 'runtime']).optional(),
      build: z.enum(['provided', 'runtime']).optional(),
    })
    .default({}),
  methods: z.record(z.string(), z.string()).default({}),
  origin: z.string().optional(),
  observedAtMs: z.number().nonnegative().optional(),
});
export type AppVersion = z.infer<typeof appVersionSchema>;

export const appVersionJsonSchema = z.toJSONSchema(appVersionSchema);
