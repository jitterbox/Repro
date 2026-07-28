import { describe, expect, it } from 'vitest';

import { classifySeverity, diffGeometry } from './geometry-diff.js';

describe('geometry diff', () => {
  it('bands geometry deltas by requested thresholds', () => {
    expect(classifySeverity(0.5)).toBe('ignore');
    expect(classifySeverity(2)).toBe('info');
    expect(classifySeverity(8)).toBe('warn');
    expect(classifySeverity(11)).toBe('critical');
  });

  it('matches by test id and reports dimension captions', () => {
    const deltas = diffGeometry({
      after: [
        {
          bounds: { h: 22, w: 130, x: 14, y: 20 },
          path: 'body/button[1]',
          testId: 'save',
        },
      ],
      before: [
        {
          bounds: { h: 20, w: 120, x: 10, y: 20 },
          path: 'body/button[1]',
          testId: 'save',
        },
      ],
    });

    expect(deltas[0]?.kind).toBe('resized');
    expect(deltas[0]?.severity).toBe('warn');
    expect(deltas[0]?.caption).toContain('Δw +10.0px');
  });
});
