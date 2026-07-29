import { basename } from 'node:path';

import { evidenceFilename, uploadEvidence } from '@repro/alm';
import { enforceOcrAudit } from '@repro/render';

import { loadConfig } from './io.js';

import type { AlmSystem, UploadEvidenceResult } from '@repro/alm';

export interface FileCommandOptions {
  readonly config?: string;
  readonly description?: string;
  readonly endpoint?: string;
  readonly evidence: string;
  readonly system: AlmSystem;
  readonly title: string;
}

export async function fileCommand(
  options: FileCommandOptions,
): Promise<UploadEvidenceResult> {
  const config = options.config === undefined
    ? undefined
    : (await loadConfig(options.config)).config;

  await enforceOcrAudit({
    path: options.evidence,
    ...(config?.redaction === undefined ? {} : { redaction: config.redaction }),
  });

  const evidenceName = basename(options.evidence);
  const bugId =
    typeof config?.metadata.bugId === 'string'
      ? config.metadata.bugId
      : undefined;
  if (bugId !== undefined && !evidenceName.startsWith(bugId)) {
    const expected = evidenceFilename({
      env:
        typeof config?.metadata.env === 'string'
          ? config.metadata.env
          : config?.profile ?? 'repro',
      issueId: bugId,
      recordedAt: new Date(),
      sha:
        typeof config?.metadata.sha === 'string' &&
        config.metadata.sha.length >= 7
          ? config.metadata.sha
          : '0000000',
      slug:
        typeof config?.metadata.slug === 'string'
          ? config.metadata.slug
          : options.title,
    });
    throw new Error(
      `evidence filename bugId mismatch: file=${evidenceName} expected prefix ${bugId} (e.g. ${expected})`,
    );
  }

  return uploadEvidence({
    evidencePath: options.evidence,
    system: options.system,
    title: options.title,
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
  });
}
