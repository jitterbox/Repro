import type { Rect } from '@jitterbox/repro-contracts/plan';

export const PRIVACY_RENDER_METHOD = 'blur-v1' as const;

const MIN_PRIVACY_BLUR = 8;
const MAX_GBLUR_SIGMA = 1024;
const MIN_GBLUR_PLANE = 12;

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

/** CSS-pixel sigma. Readable glyphs stopped at the mask's shorter side. */
export function privacyBlurSigma(width: number, height: number): number {
  const span = Math.min(Math.abs(width), Math.abs(height));
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.max(span, MIN_PRIVACY_BLUR);
}

function assertViewport(viewport: RectMaskOptions): void {
  if (
    ![viewport.width, viewport.height].every((v) => Number.isFinite(v) && v > 0)
  )
    throw new Error('Redaction requires a finite positive viewport');
}

function assertRect(rect: Rect): void {
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width < 0 ||
    rect.height < 0
  )
    throw new Error('Redaction bounds are invalid');
}

function gblurSteps(sigma: number): string {
  const passes = Math.max(
    1,
    Math.ceil((sigma * sigma) / (MAX_GBLUR_SIGMA * MAX_GBLUR_SIGMA)),
  );
  const each = Math.min(MAX_GBLUR_SIGMA, sigma / Math.sqrt(passes));
  return Array.from(
    { length: passes },
    () => `gblur=sigma=${each.toFixed(3)}`,
  ).join(',');
}

interface BlurCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sigma: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function blurCrop(
  rect: Rect,
  viewport: RectMaskOptions,
  image: RectMaskOptions,
): BlurCrop | undefined {
  const scaleX = image.width / viewport.width;
  const scaleY = image.height / viewport.height;
  const x = clamp(Math.floor(rect.x * scaleX), 0, image.width);
  const y = clamp(Math.floor(rect.y * scaleY), 0, image.height);
  const right = clamp(
    Math.ceil((rect.x + rect.width) * scaleX),
    0,
    image.width,
  );
  const bottom = clamp(
    Math.ceil((rect.y + rect.height) * scaleY),
    0,
    image.height,
  );
  if (right <= x || bottom <= y) return undefined;
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    sigma: privacyBlurSigma(rect.width, rect.height) * Math.max(scaleX, scaleY),
  };
}

interface PrivacyBlurStage {
  readonly crop: BlurCrop;
  readonly current: string;
  readonly next: string;
  readonly index: number;
}

function blurSteps(crop: BlurCrop): string {
  // gblur zeros a border when sigma exceeds a plane smaller than a glyph.
  if (Math.min(crop.width, crop.height) < MIN_GBLUR_PLANE)
    return (
      'scale=1:1:flags=area,' +
      `scale=${crop.width}:${crop.height}:flags=neighbor`
    );
  return gblurSteps(crop.sigma);
}

function privacyBlurStage(stage: PrivacyBlurStage): string {
  const { crop } = stage;
  const blur = `[privacy_blur_${stage.index}]`;
  const region =
    `crop=w=${crop.width}:h=${crop.height}:x=${crop.x}:y=${crop.y},` +
    `${blurSteps(crop)}${blur}`;
  return (
    `${stage.current}${region};${stage.current}${blur}` +
    `overlay=x=${crop.x}:y=${crop.y}:format=rgb${stage.next}`
  );
}

export interface PrivacyBlurFilterInput {
  readonly rects: readonly Rect[];
  readonly sourceLabel: string;
  readonly outputLabel: string;
  readonly viewport: RectMaskOptions;
  readonly image?: RectMaskOptions;
}

/** Crop, blur, and overlay so the kernel cannot paint outside the mask. */
export function buildPrivacyBlurFilter(input: PrivacyBlurFilterInput): string {
  const image = input.image ?? input.viewport;
  assertViewport(input.viewport);
  assertViewport(image);
  const steps: string[] = [];
  let current = input.sourceLabel;
  const crops = input.rects.flatMap((rect) => {
    assertRect(rect);
    const crop = blurCrop(rect, input.viewport, image);
    return crop === undefined ? [] : [crop];
  });
  crops.forEach((crop, index) => {
    const next =
      index === crops.length - 1
        ? input.outputLabel
        : `[privacy_step_${index}]`;
    steps.push(privacyBlurStage({ crop, current, next, index }));
    current = next;
  });
  return steps.length
    ? steps.join(';')
    : `${input.sourceLabel}null${input.outputLabel}`;
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
