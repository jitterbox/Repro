import { readFile } from 'node:fs/promises';

import { compareRepros } from './compare.js';

import type { TimelineStep } from './align.js';
import type { CompareResult } from './compare.js';
import type { ElementSnapshot } from './geometry-diff.js';

export * from './align.js';
export * from './compare.js';
export * from './composition.js';
export * from './dtw.js';
export * from './geometry-diff.js';
export * from './layouts.js';
export * from './sync.js';

export const REPRO_COMPARE_VERSION = '0.0.0' as const;

export interface EnvironmentViewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number;
}

export interface EnvironmentManifest {
  readonly schemaVersion?: 1;
  readonly nodeVersion?: string;
  readonly platform?: string;
  readonly arch?: string;
  readonly playwrightVersion?: string;
  readonly browserVersion?: string;
  readonly viewport?: EnvironmentViewport;
  readonly deviceScaleFactor?: number;
  readonly locale?: string;
  readonly timezone?: string;
  readonly ffmpegVersion?: string | null;
  readonly ffprobeVersion?: string | null;
  readonly gpuMode?: 'cpu' | 'unknown';
  readonly fontManifest?: readonly EnvironmentFontEntry[];
}

export interface EnvironmentFontEntry {
  readonly family: string;
  readonly source: string;
  readonly sha256: string | null;
}

export interface CompareManifest {
  readonly schemaVersion: 1;
  readonly steps: readonly TimelineStep[];
  readonly geometry: readonly ElementSnapshot[];
  readonly environment?: EnvironmentManifest;
  readonly overrideEnvDrift?: boolean;
}

export type CompareRunSource = string | CompareManifest;

export interface CompareRunInput {
  readonly left: CompareRunSource;
  readonly right: CompareRunSource;
  readonly overrideEnvDrift?: boolean;
}

export interface EnvDriftDifference {
  readonly field: string;
  readonly left: unknown;
  readonly right: unknown;
  readonly material: true;
}

export interface EnvDriftResult {
  readonly checked: boolean;
  readonly failed: boolean;
  readonly overridden: boolean;
  readonly differences: readonly EnvDriftDifference[];
}

export interface CompareRunResult extends CompareResult {
  readonly ok: boolean;
  readonly equal: boolean;
  readonly left: string;
  readonly right: string;
  readonly envDrift: EnvDriftResult;
}

export async function compareRuns(
  input: CompareRunInput,
): Promise<CompareRunResult> {
  const left = await loadManifest(input.left);
  const right = await loadManifest(input.right);
  const envDrift = compareEnvironment({
    left: left.manifest,
    override: input.overrideEnvDrift === true,
    right: right.manifest,
  });
  const comparison = compareRepros({
    baselineGeometry: left.manifest.geometry,
    baselineSteps: left.manifest.steps,
    candidateGeometry: right.manifest.geometry,
    candidateSteps: right.manifest.steps,
  });
  const equal =
    !envDrift.failed &&
    comparison.geometryDeltas.length === 0 &&
    comparison.alignments.every((alignment) => alignment.kind === 'matched');

  return {
    ...comparison,
    equal,
    envDrift,
    left: left.label,
    ok: !envDrift.failed,
    right: right.label,
  };
}

async function loadManifest(source: CompareRunSource): Promise<{
  readonly label: string;
  readonly manifest: CompareManifest;
}> {
  if (typeof source !== 'string') {
    return { label: '<inline>', manifest: parseManifest(source) };
  }

  return {
    label: source,
    manifest: parseManifest(JSON.parse(await readFile(source, 'utf8'))),
  };
}

function parseManifest(value: unknown): CompareManifest {
  if (!isRecord(value)) {
    throw new TypeError('compare manifest must be an object');
  }

  if (value.schemaVersion !== 1) {
    throw new TypeError('compare manifest schemaVersion must be 1');
  }

  const geometry = requiredArray(value.geometry, 'geometry');
  const steps = requiredArray(value.steps, 'steps');

  return {
    geometry: geometry as ElementSnapshot[],
    schemaVersion: 1,
    steps: steps as TimelineStep[],
    ...(isRecord(value.environment)
      ? { environment: value.environment }
      : {}),
    ...(value.overrideEnvDrift === true ? { overrideEnvDrift: true } : {}),
  };
}

function compareEnvironment(input: {
  readonly left: CompareManifest;
  readonly right: CompareManifest;
  readonly override: boolean;
}): EnvDriftResult {
  const differences = materialEnvDifferences(
    input.left.environment,
    input.right.environment,
  );
  const overridden =
    input.override ||
    input.left.overrideEnvDrift === true ||
    input.right.overrideEnvDrift === true;

  return {
    checked:
      input.left.environment !== undefined ||
      input.right.environment !== undefined,
    differences,
    failed: differences.length > 0 && !overridden,
    overridden,
  };
}

function materialEnvDifferences(
  left: EnvironmentManifest | undefined,
  right: EnvironmentManifest | undefined,
): readonly EnvDriftDifference[] {
  return materialEnvFields()
    .map((field) => differenceForField(field, left, right))
    .filter((difference) => difference !== null);
}

function materialEnvFields(): readonly string[] {
  return [
    'viewport.width',
    'viewport.height',
    'deviceScaleFactor',
    'locale',
    'browserVersion',
    'playwrightVersion',
  ];
}

function differenceForField(
  field: string,
  left: EnvironmentManifest | undefined,
  right: EnvironmentManifest | undefined,
): EnvDriftDifference | null {
  const leftValue = envFieldValue(left, field);
  const rightValue = envFieldValue(right, field);

  if (Object.is(leftValue, rightValue)) {
    return null;
  }

  return {
    field,
    left: leftValue,
    material: true,
    right: rightValue,
  };
}

function envFieldValue(
  environment: EnvironmentManifest | undefined,
  field: string,
): unknown {
  if (environment === undefined) {
    return undefined;
  }

  if (field === 'deviceScaleFactor') {
    return (
      environment.viewport?.deviceScaleFactor ?? environment.deviceScaleFactor
    );
  }

  if (field === 'viewport.width') {
    return environment.viewport?.width;
  }

  if (field === 'viewport.height') {
    return environment.viewport?.height;
  }

  return environment[field as keyof EnvironmentManifest];
}

function requiredArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`compare manifest ${field} must be an array`);
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
