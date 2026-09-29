import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

export * from './ado.js';
export * from './evidence.js';
export * from './http.js';
export * from './iso29119.js';
export * from './jira.js';
export * from './naming.js';
export * from './outbox.js';
export * from './retention.js';

export const REPRO_ALM_VERSION = '0.2.1' as const;

export type AlmSystem = 'ado' | 'jira';
export type AlmUploadStatus = 'uploaded' | 'prepared';

export interface UploadEvidenceInput {
  readonly system: AlmSystem;
  readonly evidencePath: string;
  readonly title: string;
  readonly description?: string;
  readonly endpoint?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UploadEvidenceResult {
  readonly system: AlmSystem;
  readonly status: AlmUploadStatus;
  readonly evidenceName: string;
  readonly remoteId?: string;
  readonly url?: string;
}

export async function uploadEvidence(
  input: UploadEvidenceInput,
): Promise<UploadEvidenceResult> {
  if (input.endpoint === undefined) {
    return preparedResult(input);
  }

  const body = await evidencePayload(input);
  const response = await fetch(input.endpoint, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`ALM upload failed with ${String(response.status)}`);
  }

  return uploadedResult(input, await response.json());
}

function preparedResult(input: UploadEvidenceInput): UploadEvidenceResult {
  return {
    evidenceName: basename(input.evidencePath),
    status: 'prepared',
    system: input.system,
  };
}

async function evidencePayload(
  input: UploadEvidenceInput,
): Promise<Readonly<Record<string, unknown>>> {
  const evidence = await readFile(input.evidencePath);

  return {
    description: input.description ?? '',
    evidenceBase64: evidence.toString('base64'),
    evidenceName: basename(input.evidencePath),
    metadata: input.metadata ?? {},
    system: input.system,
    title: input.title,
  };
}

function uploadedResult(
  input: UploadEvidenceInput,
  response: unknown,
): UploadEvidenceResult {
  const record = isRecord(response) ? response : {};
  const remoteId = stringValue(record.remoteId) ?? stringValue(record.id);
  const url = stringValue(record.url) ?? stringValue(record.webUrl);

  return {
    evidenceName: basename(input.evidencePath),
    ...(remoteId === undefined ? {} : { remoteId }),
    status: 'uploaded',
    system: input.system,
    ...(url === undefined ? {} : { url }),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
