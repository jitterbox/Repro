import type { z } from 'zod';
import type { annotationComponentSchema } from './annotation-component.js';
export const SCHEMA_NAMES = [
  'event',
  'config',
  'plan',
  'manifest',
  'capability',
  'annotation',
  'annotation.v2',
  'quality-report',
  'timeline',
  'slate',
  'compare-composition',
  'overlay-theme',
  'visual-cue',
  'rendered-layer',
] as const;

export type SchemaName = (typeof SCHEMA_NAMES)[number];

export type DeterminismLevel = 'none' | 'best-effort' | 'strict';

export type RedactionLayer = 'source' | 'stream' | 'pixel' | 'audit';

export interface ProtocolCompatibility {
  name: string;
  minVersion: string;
  maxVersion: string;
}

export interface BrowserSupport {
  engine: 'chromium' | 'firefox' | 'webkit';
  minVersion: string;
  maxVersion?: string;
  platforms?: ('linux' | 'macos' | 'windows')[];
}

export interface ArtifactRef {
  artifactType: string;
  required?: boolean;
  schemaRef?: string;
}

export interface OutputArtifactRef {
  artifactType: string;
  schemaRef?: string;
}

export interface DeterminismDescriptor {
  level: DeterminismLevel;
  requiresControlledProfile?: boolean;
  notes?: string;
}

export interface RedactionGuarantees {
  layers: RedactionLayer[];
  blocksUploadOnLeak?: boolean;
  notes?: string;
}

/** Capability descriptor for pipeline stage negotiation. */
export interface CapabilityDescriptor {
  id: string;
  version: string;
  protocol: ProtocolCompatibility;
  browsers: BrowserSupport[];
  permissions: string[];
  inputs: ArtifactRef[];
  outputs: OutputArtifactRef[];
  determinism: DeterminismDescriptor;
  redactionGuarantees: RedactionGuarantees;
  description?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Runtime time range — matches @jitterbox/repro-core. */
export interface TimeRange {
  start: number;
  end: number;
}

export interface AnnotationTarget {
  selector?: string;
  pageId?: string;
  bbox?: BoundingBox;
  evidenceRef?: string;
}

export type AnnotationComponent = z.infer<typeof annotationComponentSchema>;

export interface ReproAnnotation {
  id: string;
  component: AnnotationComponent;
  severity: 'info' | 'low' | 'medium' | 'warn' | 'high' | 'critical';
  kind?: string;
  feature?: string;
  beatId?: string;
  timeRange?: TimeRange;
  outTimeRange?: TimeRange;
  target?: AnnotationTarget;
  label?: string;
  shape?:
    'rect' | 'ellipse' | 'underline' | 'arrow' | 'line' | 'badge' | 'none';
  icon?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  priority?: number;
  confidence?: number;
  reviewState?: 'open' | 'resolved' | 'dismissed' | 'verified';
  renderer?: 'ass' | 'compositor';
}

export interface ReproEvent {
  id: string;
  schemaVersion: number;
  runId: string;
  pageId: string;
  seq: number;
  t_mono: number;
  t_epoch?: number;
  kind: string;
  payload: unknown;
  prevHash?: string;
  hash: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export const REPRO_CONTRACTS_VERSION = '0.3.0' as const;
