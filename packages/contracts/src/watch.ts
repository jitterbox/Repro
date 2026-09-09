import { z } from 'zod';
export const watchServerSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    url: z.url(),
    startupTimeoutMs: z.number().int().min(100).max(120000).default(30000),
  })
  .strict();
export type WatchServerOptions = z.input<typeof watchServerSchema>;
