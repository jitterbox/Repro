import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  EventRecordSchema,
  FrameRecordSchema,
  ReproConfigSchema,
  validateConfig,
} from '@repro/core';

import type {
  EventRecord,
  FrameRecord,
  ReproConfig,
  ValidationResult,
} from '@repro/core';

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function loadConfig(path: string): Promise<{
  readonly config: ReproConfig;
  readonly validation: ValidationResult;
}> {
  const raw = await readJson(path);
  const validation = validateConfig(raw);

  if (!validation.ok) {
    throw new Error(formatValidation(validation));
  }

  return {
    config: ReproConfigSchema.parse(raw),
    validation,
  };
}

export async function readEvents(path: string): Promise<readonly EventRecord[]> {
  const lines = (await readFile(path, 'utf8')).split('\n');
  return lines.filter(Boolean).map((line) => {
    return EventRecordSchema.parse(JSON.parse(line) as unknown);
  });
}

export async function readFrames(path: string): Promise<readonly FrameRecord[]> {
  const raw = await readJson(path);
  const values = Array.isArray(raw) ? raw : [];
  return values.map((value) => FrameRecordSchema.parse(value));
}

export function formatValidation(result: ValidationResult): string {
  const messages = [...result.errors, ...result.warnings];

  if (messages.length === 0) {
    return 'No config conflicts found.';
  }

  return messages
    .map((message) => {
      return `${message.path || '$'}: ${message.message}`;
    })
    .join('\n');
}
