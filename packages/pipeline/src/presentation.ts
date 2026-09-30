import { join } from 'node:path';
import { withFileLock } from '@jitterbox/repro-core';
import type { VersionOverlayOptions } from './app-version.js';
import { renderSceneEvidence } from './scene-presentation.js';

export type RenderEvidenceOptions = {
  evidence?: string;
  treatment?: string;
} & VersionOverlayOptions;

/** All presentations use the source-mapped scene compositor. */
export async function renderEvidence(
  directory: string,
  options: RenderEvidenceOptions = {},
) {
  // Reject stale JavaScript callers as well as the removed CLI/MCP option.
  if ('renderer' in options)
    throw new Error(
      'Renderer selection was removed; use render with optional treatments.',
    );
  return withFileLock(join(directory, 'render.lock'), () =>
    renderSceneEvidence(directory, options),
  );
}
