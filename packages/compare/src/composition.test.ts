import { describe, expect, it } from 'vitest';

import { buildCompareComposition, selectLayout } from './composition.js';
import type { GeometryDelta } from './geometry-diff.js';

function delta(
  partial: Partial<GeometryDelta> & Pick<GeometryDelta, 'kind' | 'key'>,
): GeometryDelta {
  return {
    caption: partial.caption ?? partial.kind,
    dh: partial.dh ?? 0,
    dw: partial.dw ?? 0,
    dx: partial.dx ?? 0,
    dy: partial.dy ?? 0,
    severity: partial.severity ?? 'info',
    ...partial,
  };
}

describe('selectLayout', () => {
  it('selects cropped-roi for sub-8px geometry deltas', () => {
    const result = selectLayout([
      delta({ dx: 2, dy: 1, dw: 0, dh: 0, kind: 'moved', key: 'btn' }),
    ]);

    expect(result.layout).toBe('cropped-roi');
    expect(result.reason).toContain('sub-8px');
  });

  it('selects onion for geometry shifts', () => {
    const result = selectLayout([
      delta({ dx: 12, kind: 'moved', key: 'btn' }),
    ]);

    expect(result.layout).toBe('onion');
    expect(result.reason).toContain('geometry');
  });

  it('selects wipe for restyled deltas', () => {
    const result = selectLayout([
      delta({
        after: {
          bounds: { h: 20, w: 80, x: 0, y: 0 },
          path: 'button',
          styles: { color: 'red' },
        },
        before: {
          bounds: { h: 20, w: 80, x: 0, y: 0 },
          path: 'button',
          styles: { color: 'blue' },
        },
        kind: 'restyled',
        key: 'btn',
      }),
    ]);

    expect(result.layout).toBe('wipe');
    expect(result.reason).toContain('color');
  });

  it('selects side-by-side for content changes', () => {
    const result = selectLayout([
      delta({
        after: {
          bounds: { h: 20, w: 80, x: 0, y: 0 },
          path: 'button',
        },
        kind: 'appeared',
        key: 'btn',
      }),
    ]);

    expect(result.layout).toBe('side-by-side');
    expect(result.reason).toContain('content');
  });
});

describe('buildCompareComposition', () => {
  it('matches compare-composition schema shape', () => {
    const composition = buildCompareComposition({
      bugId: 'BUG-1001',
      deltas: [delta({ dx: 12, kind: 'moved', key: 'btn' })],
      output: { fps: 30, height: 720, width: 1280, filename: 'out.mp4' },
      panes: {
        a: {
          color: 'before',
          label: 'BEFORE',
          role: 'before',
          runId: 'run-a',
        },
        b: {
          color: 'after',
          label: 'AFTER',
          role: 'after',
          runId: 'run-b',
        },
      },
      sync: {
        anchors: [{ aMs: 0, bMs: 0, stepId: 'start' }],
        knots: [[0, 0, 0, 1]],
        lowConfidenceSpans: [],
        strategy: 'anchored-dtw',
      },
    });

    expect(composition.schemaVersion).toBe('1.0.0');
    expect(composition.layout).toBe('onion');
    expect(composition.sync.knots).toEqual([[0, 0, 0, 1]]);
    expect(composition.panes.a.label).toBe('BEFORE');
    expect(composition.deltas?.[0]?.class).toBe('geometry');
  });
});
