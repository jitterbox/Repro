import { deliverEvidence } from '../delivery.js';
import { basename } from 'node:path';

import { evidenceFilename, uploadEvidence } from '@jitterbox/repro-alm';
import { enforceOcrAudit } from '@jitterbox/repro-render';

import { loadConfig } from './io.js';

import type { AlmSystem } from '@jitterbox/repro-alm';

export interface FileCommandOptions {
  readonly config?: string;
  readonly description?: string;
  readonly endpoint?: string;
  readonly evidence: string;
  readonly system: AlmSystem;
  readonly title: string;
  readonly issue?: string;
  readonly project?: string;
}

export async function fileCommand(options: FileCommandOptions) {
  if (options.issue && options.endpoint)
    return deliverEvidence({
      system: options.system,
      evidence: options.evidence,
      issue: options.issue,
      baseUrl: options.endpoint,
      ...(options.project ? { project: options.project } : {}),
    });
  const config =
    options.config === undefined
      ? undefined
      : (await loadConfig(options.config)).config;

  await enforceOcrAudit({
    path: options.evidence,
    requireAudit: true,
    redaction: {
      masks: [],
      maskConcealedInputs: false,
      ...config?.redaction,
      strict: true,
    },
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
          : (config?.profile ?? 'repro'),
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
