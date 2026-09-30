import type { Rect } from '@jitterbox/repro-contracts/plan';

export const PRIVACY_RENDER_METHOD = 'opaque-v2' as const;

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

/** Privacy masks replace pixels completely; pixelation is not a secrecy boundary. */
export function buildOpaqueRedactionFilter(
  rects: readonly Rect[],
  sourceLabel: string,
  outputLabel: string,
  viewport: RectMaskOptions,
): string {
  if (
    ![viewport.width, viewport.height].every((v) => Number.isFinite(v) && v > 0)
  )
    throw new Error('Redaction requires a finite positive viewport');
  const filters = rects.flatMap((rect) => {
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width < 0 ||
      rect.height < 0
    )
      throw new Error('Redaction bounds are invalid');
    if (rect.width === 0 || rect.height === 0) return [];
    // Outward rounding covers fractional edges. Input-relative scaling also
    // protects full-resolution checkpoint PNGs when video is normalized to 1x.
    const x = `floor(${rect.x}*iw/${viewport.width})`;
    const y = `floor(${rect.y}*ih/${viewport.height})`;
    const width = `ceil(${rect.x + rect.width}*iw/${viewport.width})-${x}`;
    const height = `ceil(${rect.y + rect.height}*ih/${viewport.height})-${y}`;
    return [
      `drawbox=x='${x}':y='${y}':w='${width}':h='${height}':color=black@1:t=fill`,
    ];
  });
  return `${sourceLabel}${filters.length ? filters.join(',') : 'null'}${outputLabel}`;
}

export function buildPixelizeRedactionFilter(
  input: RedactionFilterInput,
): string {
  const work = input.workLabel ?? 'redact_pixel';
  const pixelized =
    `scale=iw/16:ih/16:flags=neighbor,` + 'scale=iw*16:ih*16:flags=neighbor';

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
    return (
      `drawbox=x=${String(x)}:y=${String(y)}:w=${String(width)}` +
      `:h=${String(height)}:color=white:t=fill`
    );
  });
  const size =
    options === undefined
      ? 'iwxih'
      : `${String(options.width)}x${String(options.height)}`;

  return (
    `color=c=black:s=${size}${draws.map((draw) => `,${draw}`).join('')}` +
    outputLabel
  );
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
