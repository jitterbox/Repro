export const SCHEMA_NAMES = [
  'event',
  'config',
  'plan',
  'manifest',
  'capability',
  'annotation',
  'quality-report',
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

export interface TimeRange {
  startMono: number;
  endMono: number;
}

export interface AnnotationTarget {
  selector?: string;
  pageId?: string;
  bbox?: BoundingBox;
  evidenceRef?: string;
}

export interface ReproAnnotation {
  id: string;
  kind:
    | 'callout'
    | 'highlight'
    | 'cursor'
    | 'keystroke'
    | 'console'
    | 'step'
    | 'chapter'
    | 'redaction'
    | 'diff'
    | 'freeze'
    | 'spec';
  severity: 'info' | 'warn' | 'critical';
  timeRange: TimeRange;
  target?: AnnotationTarget;
  label: string;
  shape?: 'rect' | 'ellipse' | 'arrow' | 'line' | 'badge' | 'none';
  icon?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  placement?:
    | 'auto'
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'center'
    | 'leader';
  priority?: number;
  collisionPolicy?: 'avoid' | 'overlap' | 'truncate';
  confidence?: number;
  reviewState?: 'open' | 'resolved' | 'dismissed' | 'verified';
}

export interface ReproEvent {
  schemaVersion: string;
  runId: string;
  pageId: string;
  seq: number;
  tMono: number;
  tSource?: number;
  type:
    | 'navigation'
    | 'pointer'
    | 'keyboard'
    | 'console'
    | 'exception'
    | 'vitals'
    | 'geometry'
    | 'frame'
    | 'cut'
    | 'lifecycle'
    | 'action'
    | 'redaction'
    | 'stage';
  payload: Record<string, unknown>;
  prevHash?: string;
  hash?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export const REPRO_CONTRACTS_VERSION = '0.0.0' as const;
