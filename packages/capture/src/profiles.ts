import type { BrowserContext, BrowserContextOptions, Page } from 'playwright';
import type { CaptureProfile, Viewport } from '@repro/core';

export interface CaptureProfileOptions {
  readonly blockServiceWorkers?: boolean;
  readonly freezeTimeEpoch?: number;
  readonly profile: CaptureProfile;
  readonly seed?: number;
  readonly locale?: string;
  readonly timezone?: string;
  readonly viewport: Viewport;
}

export interface AppliedProfile {
  readonly freezeClock: () => Promise<void>;
  readonly profile: CaptureProfile;
}

export function contextOptionsForProfile(
  options: CaptureProfileOptions,
): BrowserContextOptions {
  const viewport = {
    height: options.viewport.height,
    width: options.viewport.width,
  };

  if (options.profile === 'faithful') {
    return {
      deviceScaleFactor: options.viewport.deviceScaleFactor,
      viewport,
    };
  }

  return controlledContextOptions(options, viewport);
}

export async function applyProfileToContext(
  context: BrowserContext,
  options: CaptureProfileOptions,
): Promise<void> {
  if (options.profile === 'faithful') {
    return;
  }

  await context.addInitScript(controlledInitScript(options.seed ?? 1));
  await context.addInitScript(disableAnimationDurationScript());
  await context.addInitScript(blockServiceWorkerScript(options));
}

export async function applyProfileToPage(
  page: Page,
  options: CaptureProfileOptions,
): Promise<AppliedProfile> {
  const freezeClock = async (): Promise<void> => {
    await freezePageClock(page, options);
  };

  if (options.profile === 'controlled') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await freezeClock();
  }

  return { freezeClock, profile: options.profile };
}

export async function freezePageClock(
  page: Page,
  options: CaptureProfileOptions,
): Promise<void> {
  if (options.profile !== 'controlled') {
    return;
  }

  if (options.freezeTimeEpoch === undefined) {
    return;
  }

  await page.clock.setFixedTime(options.freezeTimeEpoch);
}

function controlledContextOptions(
  options: CaptureProfileOptions,
  viewport: NonNullable<BrowserContextOptions['viewport']>,
): BrowserContextOptions {
  const contextOptions: BrowserContextOptions = {
    deviceScaleFactor: options.viewport.deviceScaleFactor,
    reducedMotion: 'reduce',
    locale: options.locale ?? 'en-US',
    timezoneId: options.timezone ?? 'UTC',
    viewport,
  };

  if (options.blockServiceWorkers === true) {
    contextOptions.serviceWorkers = 'block';
  }

  return contextOptions;
}

function controlledInitScript(seed: number): string {
  const normalizedSeed = Math.trunc(seed) || 1;

  return `
(() => {
  let state = ${JSON.stringify(normalizedSeed)} >>> 0;
  Math.random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
})();
`;
}

function disableAnimationDurationScript(): string {
  return `
(() => {
  const style = document.createElement('style');
  style.textContent = [
    '*,',
    '*::before,',
    '*::after {',
    '  animation-delay: 0s !important;',
    '  animation-duration: 0s !important;',
    '  transition-delay: 0s !important;',
    '  transition-duration: 0s !important;',
    '}',
  ].join('\\n');
  if (document.documentElement) document.documentElement.append(style);
  else document.addEventListener('DOMContentLoaded', () => document.documentElement.append(style), { once: true });
})();
`;
}

function blockServiceWorkerScript(options: CaptureProfileOptions): string {
  if (options.blockServiceWorkers !== true) {
    return '';
  }

  return `
(() => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const blocked = () => Promise.reject(
    new DOMException('Service workers blocked by @repro/capture'),
  );
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: blocked },
  });
})();
`;
}

export const faithfulProfile = 'faithful' satisfies CaptureProfile;
export const controlledProfile = 'controlled' satisfies CaptureProfile;

/** Context-only settings cannot be repaired after setup without changing the scenario. */
export async function verifyPageProfile(
  page: Page,
  options: CaptureProfileOptions,
): Promise<void> {
  const observed = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    deviceScaleFactor: devicePixelRatio,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    controlledByServiceWorker: !!(
      navigator as Partial<Pick<Navigator, 'serviceWorker'>>
    ).serviceWorker?.controller,
  }));
  for (const key of ['width', 'height', 'deviceScaleFactor'] as const)
    if (observed[key] !== options.viewport[key])
      throw new Error(
        `Capture viewport mismatch: ${key} is ${observed[key]}, expected ${options.viewport[key]}; configure the Playwright project before capture`,
      );
  if (options.profile === 'controlled') {
    if (observed.locale !== (options.locale ?? 'en-US'))
      throw new Error(
        'Controlled locale differs from the Playwright project; configure matching locale values',
      );
    if (observed.timezone !== (options.timezone ?? 'UTC'))
      throw new Error(
        'Controlled timezone differs from the Playwright project; configure matching timezone values',
      );
    if (
      options.blockServiceWorkers &&
      (observed.controlledByServiceWorker ||
        page.context().serviceWorkers().length)
    )
      throw new Error(
        'Controlled capture requires a context without active service workers',
      );
  }
}
