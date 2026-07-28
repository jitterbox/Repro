import { PROBE_IIFE } from './iife.js';

export { PROBE_IIFE };

export const PROBE_PROTOCOL = 1 as const;

export interface RrwebMaskOptions {
  readonly maskAllInputs: true;
  readonly maskTextSelector: '*';
  readonly blockSelector: '[data-repro-overlay]';
}

const RRWEB_MASK_OPTIONS: RrwebMaskOptions = {
  maskAllInputs: true,
  maskTextSelector: '*',
  blockSelector: '[data-repro-overlay]',
};

export function getProbeInitScript(): string {
  return PROBE_IIFE;
}

export function defaultRrwebMaskOptions(): RrwebMaskOptions {
  return { ...RRWEB_MASK_OPTIONS };
}
