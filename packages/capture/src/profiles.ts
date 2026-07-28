import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from 'playwright';
import type { CaptureProfile, Viewport } from '@repro/core';

export interface CaptureProfileOptions {
  readonly blockServiceWorkers?: boolean;
  readonly freezeTimeEpoch?: number;
  readonly profile: CaptureProfile;
  readonly seed?: number;
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

  await page.clock.install({ time: options.freezeTimeEpoch });
  await page.clock.setFixedTime(options.freezeTimeEpoch);
}

function controlledContextOptions(
  options: CaptureProfileOptions,
  viewport: NonNullable<BrowserContextOptions['viewport']>,
): BrowserContextOptions {
  const contextOptions: BrowserContextOptions = {
    deviceScaleFactor: options.viewport.deviceScaleFactor,
    reducedMotion: 'reduce',
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
    '*',
    '*::before',
    '*::after {',
    '  animation-delay: 0s !important;',
    '  animation-duration: 0s !important;',
    '  transition-delay: 0s !important;',
    '  transition-duration: 0s !important;',
    '}',
  ].join('\\n');
  document.documentElement.append(style);
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
