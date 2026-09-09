import { describe, expect, it, vi } from 'vitest';

import {
  activeAnnotationIndex,
  annotationCue,
  keyboardShortcutFor,
  mapSyncTime,
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
    expect(keyboardShortcutFor('Home')).toEqual({
      action: 'start',
      handled: true,
    });
    expect(keyboardShortcutFor('End')).toEqual({
      action: 'end',
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

  it('tracks active annotation within 100ms tolerance', () => {
    const annotations = [
      {
        label: 'First',
        timeRange: { start: 0, end: 1_000 },
      },
      {
        label: 'Second',
        timeRange: { start: 2_000, end: 3_000 },
      },
    ];

    expect(activeAnnotationIndex(annotations, 0.95)).toBe(0);
    expect(activeAnnotationIndex(annotations, 2.05)).toBe(1);
    expect(activeAnnotationIndex(annotations, 1.5)).toBe(-1);
  });

  it('maps compare sync knots between sides', () => {
    const knots: [number, number, number, number][] = [
      [0, 0, 0, 1],
      [5_000, 4_000, 5_000, 1],
    ];

    expect(mapSyncTime(2_500, knots, 'a', 'b')).toBe(2_000);
    expect(mapSyncTime(2_000, knots, 'b', 'a')).toBe(2_500);
  });
});
