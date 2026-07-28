import { describe, expect, it, vi } from 'vitest';

import {
  annotationCue,
  keyboardShortcutFor,
  reviewerPresetSections,
  shouldReduceMotion,
} from './viewer.js';

describe('viewer accessibility acceptance checks', () => {
  it('documents keyboard controls', () => {
    expect(keyboardShortcutFor(' ')).toEqual({
      action: 'toggle-play',
      handled: true,
    });
    expect(keyboardShortcutFor('ArrowLeft')).toEqual({
      action: 'back',
      handled: true,
    });
    expect(keyboardShortcutFor('ArrowRight')).toEqual({
      action: 'forward',
      handled: true,
    });
  });

  it('honors reduced-motion preference checks', () => {
    vi.stubGlobal('matchMedia', (query: string) => {
      return { matches: query.includes('reduced-motion') };
    });

    expect(shouldReduceMotion()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('renders annotation cues without relying on color alone', () => {
    expect(
      annotationCue({
        label: 'Submit button',
        severity: 'high',
        shape: 'ellipse',
      }),
    ).toContain('! circle highlight: Submit button');
  });

  it('exposes reviewer presets', () => {
    expect(reviewerPresetSections('developer')).toContain('console');
    expect(reviewerPresetSections('alm')).toContain('redaction');
  });
});
