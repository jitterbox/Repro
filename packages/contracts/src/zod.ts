import { z } from 'zod';

import {
  AnnotationSchema,
  ReproConfigSchema,
} from '@repro/core';

import type { CapabilityDescriptor } from './types.js';

const semverPattern = /^\d+\.\d+\.\d+$/;

export const capabilityDescriptorSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/),
  version: z.string().regex(semverPattern),
  protocol: z.object({
    name: z.string().min(1),
    minVersion: z.string(),
    maxVersion: z.string(),
  }),
  browsers: z
    .array(
      z.object({
        engine: z.enum(['chromium', 'firefox', 'webkit']),
        minVersion: z.string(),
        maxVersion: z.string().optional(),
        platforms: z
          .array(z.enum(['linux', 'macos', 'windows']))
          .optional(),
      }),
    )
    .min(1),
  permissions: z.array(z.string()),
  inputs: z.array(
    z.object({
      artifactType: z.string().min(1),
      required: z.boolean().optional(),
      schemaRef: z.string().optional(),
    }),
  ),
  outputs: z.array(
    z.object({
      artifactType: z.string().min(1),
      schemaRef: z.string().optional(),
    }),
  ),
  determinism: z.object({
    level: z.enum(['none', 'best-effort', 'strict']),
    requiresControlledProfile: z.boolean().optional(),
    notes: z.string().optional(),
  }),
  redactionGuarantees: z.object({
    layers: z.array(z.enum(['source', 'stream', 'pixel', 'audit'])),
    blocksUploadOnLeak: z.boolean().optional(),
    notes: z.string().optional(),
  }),
  description: z.string().optional(),
});

/** Re-export runtime config schema from @repro/core. */
export const reproConfigSchema = ReproConfigSchema;

/** Re-export runtime annotation schema from @repro/core. */
export const reproAnnotationSchema = AnnotationSchema;

export function parseCapabilityDescriptor(
  data: unknown,
): CapabilityDescriptor {
  return capabilityDescriptorSchema.parse(data) as CapabilityDescriptor;
}

export function parseReproConfig(data: unknown) {
  return reproConfigSchema.parse(data);
}

export function parseReproAnnotation(data: unknown) {
  return reproAnnotationSchema.parse(data);
}

const timeRangeSchema = z
  .object({
    start: z.number().min(0),
    end: z.number().min(0),
  })
  .refine((range) => range.end >= range.start, {
    message: 'end must be >= start',
  });

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
});

const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().min(0),
  h: z.number().min(0),
});

const visualCueBaseSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id: z.string().min(1),
  severity: z.enum(['info', 'low', 'medium', 'warn', 'high', 'critical']),
  outTimeRange: timeRangeSchema,
  renderer: z.enum(['ass', 'compositor']),
  layer: z.number().int().min(0).max(20),
  accessibilityText: z.string().optional(),
  evidenceRef: z.string().optional(),
  step: z
    .object({
      index: z.number().int().min(1),
      total: z.number().int().min(1),
      title: z.string().min(1),
    })
    .optional(),
  console: z
    .object({
      level: z.enum(['error', 'warn', 'info', 'log']),
      message: z.string().min(1),
      timestamp: z.string().optional(),
    })
    .optional(),
  layoutShift: z
    .object({
      before: rectSchema,
      after: rectSchema,
      dx: z.number().optional(),
      dy: z.number().optional(),
      dw: z.number().optional(),
      dh: z.number().optional(),
    })
    .optional(),
  outcome: z
    .object({
      expected: z.string().min(1),
      actual: z.string().min(1),
    })
    .optional(),
  roi: z
    .object({
      source: rectSchema,
      magnification: z.number().min(1),
      destination: rectSchema.optional(),
    })
    .optional(),
  delta: z
    .object({
      class: z.enum([
        'geometry',
        'color',
        'typography',
        'content',
        'visibility',
        'flow',
      ]),
      caption: z.string().min(1),
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .optional(),
  plate: z
    .object({
      kicker: z.string().optional(),
      label: z.string().optional(),
      measurement: z.string().optional(),
    })
    .optional(),
  anchor: z
    .object({
      bbox: bboxSchema.optional(),
      selector: z.string().optional(),
    })
    .optional(),
});

export const visualCueSchema = z.discriminatedUnion('component', [
  visualCueBaseSchema.extend({
    component: z.literal('step-badge'),
    step: z.object({
      index: z.number().int().min(1),
      total: z.number().int().min(1),
      title: z.string().min(1),
    }),
  }),
  visualCueBaseSchema.extend({
    component: z.literal('console-toast'),
    console: z.object({
      level: z.enum(['error', 'warn', 'info', 'log']),
      message: z.string().min(1),
      timestamp: z.string().optional(),
    }),
  }),
  visualCueBaseSchema.extend({
    component: z.literal('layout-shift-pair'),
    layoutShift: z.object({
      before: rectSchema,
      after: rectSchema,
      dx: z.number().optional(),
      dy: z.number().optional(),
      dw: z.number().optional(),
      dh: z.number().optional(),
    }),
  }),
  visualCueBaseSchema.extend({
    component: z.literal('outcome-pair'),
    outcome: z.object({
      expected: z.string().min(1),
      actual: z.string().min(1),
    }),
  }),
  visualCueBaseSchema.extend({
    component: z.literal('roi-magnifier'),
    roi: z.object({
      source: rectSchema,
      magnification: z.number().min(1),
      destination: rectSchema.optional(),
    }),
  }),
  visualCueBaseSchema.extend({
    component: z.literal('delta-caption'),
    delta: z.object({
      class: z.enum([
        'geometry',
        'color',
        'typography',
        'content',
        'visibility',
        'flow',
      ]),
      caption: z.string().min(1),
      before: z.string().optional(),
      after: z.string().optional(),
    }),
  }),
  visualCueBaseSchema.extend({
    component: z.enum([
      'target-ring',
      'leader',
      'plate',
      'callout',
      'progress-rail',
      'chapter',
      'pause-badge',
      'speed-chip',
      'click-ripple',
      'cursor-path',
      'keystroke-pill',
      'hit-target-guide',
      'hidden-ghost',
      'stacking-labels',
      'freeze-banner',
      'vitals-hud',
      'redaction',
      'slate',
    ]),
  }),
]);

export const renderedLayerManifestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  layers: z.array(
    z.object({
      cueId: z.string().min(1),
      source: z.string().min(1),
      kind: z.enum(['png', 'ass']),
      startMs: z.number().min(0),
      endMs: z.number().min(0),
      zIndex: z.number().int().min(0),
      x: z.number().optional(),
      y: z.number().optional(),
      opacity: z.number().min(0).max(1).optional(),
      enable: z.string().optional(),
      expectedAlphaMin: z.number().min(0).max(1).optional(),
    }),
  ),
});

export function parseVisualCue(data: unknown) {
  return visualCueSchema.parse(data);
}

export function parseRenderedLayerManifest(data: unknown) {
  return renderedLayerManifestSchema.parse(data);
}
