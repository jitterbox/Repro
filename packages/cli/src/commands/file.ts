import { uploadEvidence } from '@repro/alm';
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
