import { describe, expect, it } from 'vitest';

import {
  buildVarianceGrid,
  findLargestLowVarianceRect,
  varianceGridColumns,
  varianceGridRows,
} from './variance-grid.js';

describe('variance grid', () => {
  it('downscales a keyframe into a 32 by 18 variance grid', () => {
    const frame = solidFrame(64, 36, 120);
    const grid = buildVarianceGrid(frame);

    expect(grid.columns).toBe(varianceGridColumns);
    expect(grid.rows).toBe(varianceGridRows);
    expect(grid.values).toHaveLength(varianceGridColumns * varianceGridRows);
    expect(Math.max(...grid.values)).toBe(0);
  });

  it('finds the largest low-variance rectangle', () => {
    const values = Array.from(
      { length: varianceGridColumns * varianceGridRows },
      () => 100,
    );

    for (let row = 3; row < 9; row += 1) {
      for (let column = 5; column < 17; column += 1) {
        values[row * varianceGridColumns + column] = 0;
      }
    }

    const rect = findLargestLowVarianceRect(
      {
        columns: varianceGridColumns,
        rows: varianceGridRows,
        sourceHeight: 180,
        sourceWidth: 320,
        values,
      },
      { threshold: 1 },
    );

    expect(rect).toEqual({
      height: 60,
      width: 120,
      x: 50,
      y: 30,
    });
  });
});

function solidFrame(width: number, height: number, value: number) {
  return {
    data: new Uint8Array(width * height).fill(value),
    height,
    width,
    channels: 1,
  } as const;
}
