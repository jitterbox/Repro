import { appVersionSchema, type RunManifest } from '@repro/contracts';
import type { ReproConfig } from '@repro/core';
import { redactText } from '@repro/core/redactor';

export interface VersionOverlayOptions {
  appVersion?: string;
  buildId?: string;
  versionOverlay?: boolean;
}

/** Only known target-app values become chrome; absence produces no placeholder. */
export function appVersionLabel(
  run: RunManifest,
  config: ReproConfig,
  patterns: readonly string[],
  options: VersionOverlayOptions = {},
): string | undefined {
  if (!(options.versionOverlay ?? config.versionOverlay?.enabled ?? true))
    return undefined;
  const captured = appVersionSchema.parse(run.environment.appVersion ?? {});
  const supplied = appVersionSchema.parse({
    version: options.appVersion ?? captured.version,
    build: options.buildId ?? captured.build ?? run.build.id ?? undefined,
  });
  const label = [
    supplied.version && `Version ${supplied.version}`,
    supplied.build && `Build ${supplied.build}`,
  ]
    .filter(Boolean)
    .join('\n');
  if (!label) return undefined;
  return patterns.reduce(
    (text, pattern) =>
      text.replaceAll(new RegExp(pattern, 'giu'), '[redacted]'),
    redactText(label).redacted,
  );
}
