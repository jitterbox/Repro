import { validateConfig } from '@repro/core';

import { formatValidation, readJson } from './io.js';

import type { ValidationResult } from '@repro/core';

export interface ValidateConfigCommandOptions {
  readonly config: string;
}

export interface ValidateConfigCommandResult {
  readonly output: string;
  readonly validation: ValidationResult;
}

export async function validateConfigCommand(
  options: ValidateConfigCommandOptions,
): Promise<ValidateConfigCommandResult> {
  const validation = validateConfig(await readJson(options.config));

  return {
    output: formatValidation(validation),
    validation,
  };
}
