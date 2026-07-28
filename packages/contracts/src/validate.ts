import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import type { SchemaName, ValidationResult } from './types.js';
import { SCHEMA_NAMES } from './types.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemasDir = join(packageRoot, 'schemas');

let ajvInstance: Ajv2020 | undefined;
const validators = new Map<SchemaName, ValidateFunction>();

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) {
    return [];
  }

  return errors.map((error) => {
    const path = error.instancePath || '/';
    return `${path}: ${error.message ?? 'invalid'}`;
  });
}

function loadSchemas(): Ajv2020 {
  if (ajvInstance) {
    return ajvInstance;
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateSchema: true,
  });
  const registerFormats = addFormats as unknown as (
    instance: Ajv2020,
  ) => Ajv2020;
  registerFormats(ajv);

  const schemaFiles = readdirSync(schemasDir).filter((file) =>
    file.endsWith('.schema.json'),
  );

  for (const file of schemaFiles) {
    const raw = readFileSync(join(schemasDir, file), 'utf8');
    const schema = JSON.parse(raw) as Record<string, unknown>;
    ajv.addSchema(schema);
  }

  for (const name of SCHEMA_NAMES) {
    const schemaId = `https://repro.dev/schemas/${name}.schema.json`;
    const validate = ajv.getSchema(schemaId);
    if (!validate) {
      throw new Error(`Schema not registered: ${schemaId}`);
    }
    validators.set(name, validate);
  }

  ajvInstance = ajv;
  return ajv;
}

/** Lazily initialize Ajv and register all bundled schemas. */
export function getValidator(): Ajv2020 {
  return loadSchemas();
}

/** Validate data against a named JSON Schema. */
export function validateAgainst(
  schemaName: SchemaName,
  data: unknown,
): ValidationResult {
  loadSchemas();
  const validate = validators.get(schemaName);
  if (!validate) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }

  const valid = validate(data);
  if (valid) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: formatErrors(validate.errors),
  };
}

/** Return the absolute path to bundled schema files. */
export function getSchemasDir(): string {
  return schemasDir;
}

export { SCHEMA_NAMES };
