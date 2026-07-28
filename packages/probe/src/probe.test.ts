import { describe, expect, it } from 'vitest';

import { PROBE_IIFE } from './iife.js';
import { PROBE_CAPABILITIES, RRWEB_MASK_OPTIONS } from './probe-source.js';

describe('PROBE_IIFE', () => {
  it('contains the overlay marker', () => {
    expect(PROBE_IIFE).toContain('data-repro-overlay');
  });

  it('declares rrweb and web-vitals capabilities', () => {
    expect(PROBE_CAPABILITIES).toEqual(
      expect.arrayContaining(['rrweb', 'web-vitals-attribution', 'vitals']),
    );
  });

  it('uses inverted-safe rrweb mask defaults', () => {
    expect(RRWEB_MASK_OPTIONS).toEqual({
      blockSelector: '[data-repro-overlay]',
      maskAllInputs: true,
      maskTextSelector: '*',
    });
  });

  it('bundles rrweb recording and web-vitals attribution', () => {
    expect(PROBE_IIFE).toContain('maskAllInputs');
    expect(PROBE_IIFE).toContain('largestShiftTarget');
    expect(PROBE_IIFE).toContain('interactionTarget');
  });

  it('does not assign unsafe HTML sinks', () => {
    const forbidden = [
      /\.innerHTML\s*=/,
      /\[['"]innerHTML['"]\]\s*=/,
      /document\.write\s*\(/,
      /\beval\s*\(/,
    ];

    for (const pattern of forbidden) {
      expect(PROBE_IIFE).not.toMatch(pattern);
    }
  });
});
