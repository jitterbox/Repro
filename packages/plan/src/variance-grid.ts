import type { KeyframeBuffer, Rect } from './types.js';

export interface VarianceGrid {
  readonly columns: number;
  readonly rows: number;
  readonly values: readonly number[];
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

export interface LowVarianceRectOptions {
  readonly threshold: number;
  readonly minColumns?: number;
  readonly minRows?: number;
}

export const varianceGridColumns = 32;
export const varianceGridRows = 18;

export function buildVarianceGrid(input: KeyframeBuffer): VarianceGrid {
  const channels = input.channels ?? 4;
  const values: number[] = [];

  for (let row = 0; row < varianceGridRows; row += 1) {
    for (let column = 0; column < varianceGridColumns; column += 1) {
      values.push(cellVariance(input, column, row, channels));
    }
  }

  return {
    columns: varianceGridColumns,
    rows: varianceGridRows,
    sourceHeight: input.height,
    sourceWidth: input.width,
    values,
  };
}

export function findLargestLowVarianceRect(
  grid: VarianceGrid,
  options: LowVarianceRectOptions,
): Rect | null {
  const minColumns = options.minColumns ?? 1;
  const minRows = options.minRows ?? 1;
  const heights = Array.from({ length: grid.columns }, () => 0);
  let best: Rect | null = null;
  let bestArea = 0;

  for (let row = 0; row < grid.rows; row += 1) {
    updateHeights(grid, heights, row, options.threshold);
    const candidate = bestHistogramRect(heights, row);

    if (candidate === null || candidate.width < minColumns) {
      continue;
    }

    if (candidate.height < minRows) {
      continue;
    }

    const area = candidate.width * candidate.height;
    if (area > bestArea) {
      best = candidate;
      bestArea = area;
    }
  }

  return best === null ? null : scaleGridRect(grid, best);
}

function cellVariance(
  input: KeyframeBuffer,
  column: number,
  row: number,
  channels: number,
): number {
  const x0 = Math.floor((column * input.width) / varianceGridColumns);
  const x1 = Math.ceil(((column + 1) * input.width) / varianceGridColumns);
  const y0 = Math.floor((row * input.height) / varianceGridRows);
  const y1 = Math.ceil(((row + 1) * input.height) / varianceGridRows);
  const stats = cellStats(input, channels, x0, x1, y0, y1);

  if (stats.count === 0) {
    return 0;
  }

  const mean = stats.sum / stats.count;
  return stats.sumSquares / stats.count - mean * mean;
}

function cellStats(
  input: KeyframeBuffer,
  channels: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { readonly count: number; readonly sum: number; readonly sumSquares: number } {
  let count = 0;
  let sum = 0;
  let sumSquares = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const luminance = pixelLuminance(input, channels, x, y);
      count += 1;
      sum += luminance;
      sumSquares += luminance * luminance;
    }
  }

  return { count, sum, sumSquares };
}

function pixelLuminance(
  input: KeyframeBuffer,
  channels: number,
  x: number,
  y: number,
): number {
  const index = (y * input.width + x) * channels;
  const red = input.data[index] ?? 0;

  if (channels === 1) {
    return red;
  }

  const green = input.data[index + 1] ?? red;
  const blue = input.data[index + 2] ?? red;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function updateHeights(
  grid: VarianceGrid,
  heights: number[],
  row: number,
  threshold: number,
): void {
  for (let column = 0; column < grid.columns; column += 1) {
    const value = grid.values[row * grid.columns + column] ?? Infinity;
    heights[column] = value <= threshold ? (heights[column] ?? 0) + 1 : 0;
  }
}

function bestHistogramRect(heights: readonly number[], row: number): Rect | null {
  const stack: number[] = [];
  let best: Rect | null = null;
  let bestArea = 0;

  for (let index = 0; index <= heights.length; index += 1) {
    const height = index === heights.length ? 0 : (heights[index] ?? 0);

    while (stack.length > 0 && height < (heights[last(stack)] ?? 0)) {
      const rect = popHistogramRect(stack, heights, index, row);
      const area = rect.width * rect.height;

      if (area > bestArea) {
        best = rect;
        bestArea = area;
      }
    }

    stack.push(index);
  }

  return best;
}

function popHistogramRect(
  stack: number[],
  heights: readonly number[],
  index: number,
  row: number,
): Rect {
  const top = stack.pop() ?? 0;
  const height = heights[top] ?? 0;
  const left = stack.length === 0 ? 0 : last(stack) + 1;
  const width = index - left;

  return {
    height,
    width,
    x: left,
    y: row - height + 1,
  };
}

function last(values: readonly number[]): number {
  return values[values.length - 1] ?? 0;
}

function scaleGridRect(grid: VarianceGrid, rect: Rect): Rect {
  const cellWidth = grid.sourceWidth / grid.columns;
  const cellHeight = grid.sourceHeight / grid.rows;

  return {
    height: rect.height * cellHeight,
    width: rect.width * cellWidth,
    x: rect.x * cellWidth,
    y: rect.y * cellHeight,
  };
}
