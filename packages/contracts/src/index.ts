export {
  REPRO_CONTRACTS_VERSION,
  SCHEMA_NAMES,
  type AnnotationComponent,
  type AnnotationTarget,
  type ArtifactRef,
  type BoundingBox,
  type BrowserSupport,
  type CapabilityDescriptor,
  type DeterminismDescriptor,
  type DeterminismLevel,
  type OutputArtifactRef,
  type ProtocolCompatibility,
  type RedactionGuarantees,
  type RedactionLayer,
  type ReproAnnotation,
  type ReproEvent,
  type SchemaName,
  type TimeRange,
  type ValidationResult,
} from './types.js';

export { getSchemasDir, getValidator, validateAgainst } from './validate.js';

export {
  capabilityDescriptorSchema,
  parseCapabilityDescriptor,
  parseRenderedLayerManifest,
  parseReproAnnotation,
  parseReproConfig,
  parseVisualCue,
  renderedLayerManifestSchema,
  reproAnnotationSchema,
  reproConfigSchema,
  visualCueSchema,
} from './zod.js';

export {
  hexToAss,
  overlayTheme,
  severityAss,
  severityColor,
  type OverlayColorName,
  type OverlayTheme,
} from './generated/overlay-theme.js';

export * from './evidence.js';
export * from './registry.js';
export * from './comparison.js';
export * from './timeline.js';

export { configJsonSchema } from './config.js';

export * from './plan.js';
export type * from './visual-cues.js';
export * from './quality.js';
export * from './sync-time.js';

export * from './watch.js';

export * from './bug-discovery.js';

export * from './scene.js';

export * from './devtools.js';

export {
  appVersionSchema,
  appVersionJsonSchema,
  type AppVersion,
} from './app-version.js';
