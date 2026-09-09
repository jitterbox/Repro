import type { z } from 'zod';
import type { visualCueSchema, visualCueBaseSchema } from './zod.js';
import type { AnnotationComponent } from './types.js';
export type VisualCueDocument = z.infer<typeof visualCueSchema>;
/** Intermediate annotation conversion; the final discriminated document is validated. */
export type VisualCueDraft = z.infer<typeof visualCueBaseSchema> & { readonly component: AnnotationComponent };
