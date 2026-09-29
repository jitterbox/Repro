import type { Page } from '@playwright/test';
import { appVersionSchema, type AppVersion } from '@repro/contracts';
import type { ReproConfig } from '@repro/core';

/** Read declared target-app metadata, never the evidence repository or Repro package version. */
export async function observeAppVersion(
  page: Page,
  settings: ReproConfig['versionOverlay'],
  supplied: { version?: string | undefined; build?: string | undefined },
  timeMs: () => number,
): Promise<AppVersion> {
  const result = appVersionSchema.parse({
    ...(supplied.version ? { version: supplied.version } : {}),
    ...(supplied.build ? { build: supplied.build } : {}),
    sources: {
      ...(supplied.version ? { version: 'provided' } : {}),
      ...(supplied.build ? { build: 'provided' } : {}),
    },
  });
  if (settings?.discover === false || (result.version && result.build))
    return result;
  const observed = await page
    .evaluate((settings) => {
      const text = (value: unknown) =>
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.trim().length <= 160
          ? value.trim()
          : undefined;
      const readPath = (path: string) => {
        let current: unknown = window;
        for (const key of path.split('.')) {
          if (
            !current ||
            (typeof current !== 'object' && typeof current !== 'function')
          )
            return undefined;
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          // Do not execute application getters to discover a version.
          if (!descriptor || !('value' in descriptor)) return undefined;
          current = descriptor.value as unknown;
        }
        return text(current);
      };
      const read = (kind: 'version' | 'build') => {
        const selector =
          kind === 'version'
            ? settings?.versionSelector
            : settings?.buildSelector;
        const path =
          kind === 'version' ? settings?.versionPath : settings?.buildPath;
        if (selector) {
          const element = document.querySelector(selector);
          const value = text(
            element?.getAttribute('content') ??
              element?.getAttribute(`data-app-${kind}`) ??
              element?.textContent,
          );
          if (value) return { value, method: `selector:${selector}` };
        }
        if (path) {
          const value = readPath(path);
          if (value) return { value, method: `window.${path}` };
        }
        for (const name of kind === 'version'
          ? ['app-version', 'application-version', 'version']
          : ['app-build', 'build-id', 'build-version']) {
          const value = text(
            document
              .querySelector(`meta[name="${name}"]`)
              ?.getAttribute('content'),
          );
          if (value) return { value, method: `meta:${name}` };
        }
        const attribute =
          kind === 'version' ? 'data-app-version' : 'data-build-id';
        const declared = text(
          document.querySelector(`[${attribute}]`)?.getAttribute(attribute),
        );
        if (declared) return { value: declared, method: attribute };
        for (const candidate of kind === 'version'
          ? ['__APP_VERSION__', '__APP_CONFIG__.version']
          : ['__BUILD_ID__', '__APP_CONFIG__.buildId']) {
          const value = readPath(candidate);
          if (value) return { value, method: `window.${candidate}` };
        }
        return undefined;
      };
      return {
        version: read('version'),
        build: read('build'),
        origin: location.origin,
      };
    }, settings ?? null)
    .catch(() => null);
  if (!observed) {
    result.methods.discovery = 'unavailable';
    return result;
  }
  for (const key of ['version', 'build'] as const) {
    const observation = observed[key];
    if (!result[key] && observation) {
      result[key] = observation.value;
      result.sources[key] = 'runtime';
      result.methods[key] = observation.method;
      result.origin = observed.origin;
      result.observedAtMs = timeMs();
    }
  }
  return appVersionSchema.parse(result);
}
