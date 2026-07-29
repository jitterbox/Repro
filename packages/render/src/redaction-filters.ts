import type { Rect } from '@repro/plan';

export interface RedactionFilterInput {
  readonly sourceLabel: string;
  readonly maskLabel: string;
  readonly outputLabel: string;
  readonly workLabel?: string;
}

export interface ScrollBandInput {
  readonly rect: Rect;
  readonly viewportHeight: number;
  readonly margin: number;
}

export interface RectMaskOptions {
  readonly height: number;
  readonly width: number;
}

export function buildPixelizeRedactionFilter(
  input: RedactionFilterInput,
): string {
  const work = input.workLabel ?? 'redact_pixel';
  const pixelized = `scale=iw/16:ih/16:flags=neighbor,` +
    'scale=iw*16:ih*16:flags=neighbor';

  return [
    `${input.sourceLabel}${pixelized}[${work}]`,
    `${input.sourceLabel}[${work}]${input.maskLabel}` +
      `maskedmerge${input.outputLabel}`,
  ].join(';');
}

export function buildRectMaskFilter(
  rects: readonly Rect[],
  outputLabel: string,
  options?: RectMaskOptions,
): string {
  const draws = rects.map((rect) => {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    return `drawbox=x=${String(x)}:y=${String(y)}:w=${String(width)}` +
      `:h=${String(height)}:color=white:t=fill`;
  });
  const size = options === undefined
    ? 'iwxih'
    : `${String(options.width)}x${String(options.height)}`;

  return `color=c=black:s=${size}${draws.map((draw) => `,${draw}`).join('')}` +
    outputLabel;
}

export function expandScrollBand(input: ScrollBandInput): Rect {
  const y = Math.max(0, input.rect.y - input.margin);
  const bottom = Math.min(
    input.viewportHeight,
    input.rect.y + input.rect.height + input.margin,
  );

  return {
    height: Math.max(0, bottom - y),
    width: input.rect.width,
    x: input.rect.x,
    y,
  };
}
