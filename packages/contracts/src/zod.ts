import { z } from 'zod';

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

export const reproConfigSchema = z.object({
  schemaVersion: z.string().regex(semverPattern),
  mode: z.enum(['repro', 'compare', 'demo']),
  executionProfile: z.enum(['faithful', 'controlled']).optional(),
  timingSensitive: z.boolean().optional(),
  surfaceCapture: z.enum(['page', 'os']).optional(),
  features: z
    .object({
      cursor: z.boolean().optional(),
      keystrokes: z.boolean().optional(),
      clickViz: z.boolean().optional(),
      consoleOverlay: z.boolean().optional(),
      specCard: z.boolean().optional(),
      steps: z.boolean().optional(),
      pauses: z.boolean().optional(),
      slowmo: z.boolean().optional(),
      zoom: z.boolean().optional(),
      redaction: z.boolean().optional(),
      vitalsHud: z.boolean().optional(),
      voiceover: z.boolean().optional(),
      freezeDetect: z.boolean().optional(),
      a11yOverlay: z.boolean().optional(),
      hiddenElements: z.boolean().optional(),
      hitTargets: z.boolean().optional(),
      stackingContexts: z.boolean().optional(),
      layoutShiftViz: z.boolean().optional(),
    })
    .optional(),
  viewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      deviceScaleFactor: z.number().positive().optional(),
    })
    .optional(),
  redaction: z
    .object({
      strict: z.boolean().optional(),
    })
    .optional(),
  compare: z
    .object({
      layout: z
        .enum([
          'side-by-side',
          'onion',
          'wipe',
          'blink',
          'difference',
        ])
        .optional(),
      baselineRunId: z.uuid().optional(),
      candidateRunId: z.uuid().optional(),
    })
    .optional(),
});

export const reproAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'callout',
    'highlight',
    'cursor',
    'keystroke',
    'console',
    'step',
    'chapter',
    'redaction',
    'diff',
    'freeze',
    'spec',
  ]),
  severity: z.enum(['info', 'warn', 'critical']),
  timeRange: z.object({
    startMono: z.number().min(0),
    endMono: z.number().min(0),
  }),
  target: z
    .object({
      selector: z.string().optional(),
      pageId: z.string().optional(),
      bbox: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number().min(0),
          height: z.number().min(0),
        })
        .optional(),
      evidenceRef: z.string().optional(),
    })
    .optional(),
  label: z.string().min(1),
  shape: z
    .enum(['rect', 'ellipse', 'arrow', 'line', 'badge', 'none'])
    .optional(),
  icon: z.string().optional(),
  lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  placement: z
    .enum([
      'auto',
      'top',
      'bottom',
      'left',
      'right',
      'center',
      'leader',
    ])
    .optional(),
  priority: z.number().int().min(0).optional(),
  collisionPolicy: z.enum(['avoid', 'overlap', 'truncate']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reviewState: z
    .enum(['open', 'resolved', 'dismissed', 'verified'])
    .optional(),
});

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
