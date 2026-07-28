import { ReproConfigSchema } from './schema.js';

import type { ReproConfig, Viewport } from './schema.js';

export interface ValidationMessage {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ValidationMessage[];
  readonly warnings: readonly ValidationMessage[];
}

export function validateConfig(config: unknown): ValidationResult {
  const parsed = ReproConfigSchema.safeParse(config);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.'),
      })),
      ok: false,
      warnings: [],
    };
  }

  const errors = conflictErrors(parsed.data);
  const warnings = conflictWarnings(parsed.data);
  return {
    errors,
    ok: errors.length === 0,
    warnings,
  };
}

function conflictErrors(config: ReproConfig): ValidationMessage[] {
  return [
    ...compareProfileErrors(config),
    ...showActionErrors(config),
    ...viewportErrors(config),
    ...timingErrors(config),
    ...redactionErrors(config),
  ];
}

function conflictWarnings(config: ReproConfig): ValidationMessage[] {
  if (config.features.redaction !== true) {
    return [];
  }

  if (config.redaction?.strict === true) {
    return [];
  }

  return [
    {
      message: 'redaction.strict should gate protected captures',
      path: 'redaction.strict',
    },
  ];
}

function compareProfileErrors(config: ReproConfig): ValidationMessage[] {
  if (config.mode !== 'compare' || config.profile === 'controlled') {
    return [];
  }

  return [
    {
      message: 'compare mode requires the controlled capture profile',
      path: 'profile',
    },
  ];
}

function showActionErrors(config: ReproConfig): ValidationMessage[] {
  if (config.showActions !== true) {
    return [];
  }

  const errors: ValidationMessage[] = [];
  if (config.timingSensitive === true) {
    errors.push({
      message: 'showActions is incompatible with timingSensitive captures',
      path: 'showActions',
    });
  }

  if (config.compare?.streams.includes('pixel-diff') === true) {
    errors.push({
      message: 'showActions is incompatible with pixel-diff streams',
      path: 'compare.streams',
    });
  }

  return errors;
}

function viewportErrors(config: ReproConfig): ValidationMessage[] {
  const strategy = config.compare?.strategy;
  if (strategy !== 'onion' && strategy !== 'difference') {
    return [];
  }

  const viewports = config.compare?.viewports ?? [config.viewport];
  if (viewports.every((viewport) => sameViewport(viewport, config.viewport))) {
    return [];
  }

  return [
    {
      message: 'onion and difference comparisons require identical viewport DSF',
      path: 'compare.viewports',
    },
  ];
}

function timingErrors(config: ReproConfig): ValidationMessage[] {
  if (config.features.voiceover !== true || config.preserveRealTiming !== true) {
    return [];
  }

  return [
    {
      message: 'voiceover conflicts with preserveRealTiming',
      path: 'features.voiceover',
    },
  ];
}

function redactionErrors(config: ReproConfig): ValidationMessage[] {
  if (config.redaction?.strict !== true) {
    return [];
  }

  if (config.features.redaction === true) {
    return [];
  }

  return [
    {
      message: 'redaction.strict requires the redaction feature gate',
      path: 'redaction.strict',
    },
  ];
}

function sameViewport(left: Viewport, right: Viewport): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.deviceScaleFactor === right.deviceScaleFactor
  );
}
