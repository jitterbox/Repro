export interface LayoutInput {
  readonly left: string;
  readonly right: string;
  readonly output?: string;
}

export interface WipeLayoutInput extends LayoutInput {
  readonly progress: number;
}

export interface CroppedRoiLayoutInput extends LayoutInput {
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly magnification?: number;
}

/** 2 Hz flash cap at 30 fps (15-frame period). Opt-in only — see blink layout. */
export const BLINK_PERIOD_FRAMES = 15;

export function sideBySideLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  // legend chip: BEFORE | AFTER panes
  return `${input.left}${input.right}xstack=inputs=2:layout=0_0|w0_0${output}`;
}

export function onionLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  // legend chip: ghost onion overlay
  return `${input.left}${input.right}blend=all_mode=average:all_opacity=0.5${output}`;
}

export function wipeLayout(input: WipeLayoutInput): string {
  const output = input.output ?? '[v]';
  const progress = Math.max(0, Math.min(1, input.progress));

  // legend chip: vertical wipe divider
  return `${input.left}${input.right}overlay=x='W*${String(progress)}'${output}`;
}

/**
 * Opt-in only. Clamped to 2 Hz (15-frame period at 30 fps) for a11y.
 * Prefer onion or side-by-side for default compare output.
 */
export function blinkLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';
  const half = Math.floor(BLINK_PERIOD_FRAMES / 2);

  return (
    `${input.left}${input.right}` +
    `blend=all_expr='if(lt(mod(N,${String(BLINK_PERIOD_FRAMES)}),` +
    `${String(half)}),A,B)'${output}`
  );
}

export function differenceLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  // format=gbrp avoids blend rounding artifacts on yuv420p inputs
  return [
    `${input.left}format=gbrp[diffA]`,
    `${input.right}format=gbrp[diffB]`,
    `[diffA][diffB]blend=all_mode=difference,eq=contrast=2${output}`,
  ].join(';');
}

export function edgeOverlayLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  // legend chip: edge delta overlay
  return [
    `${input.left}sobel,format=rgba,colorchannelmixer=rr=1:gg=0:bb=0[edgeA]`,
    `${input.right}sobel,format=rgba,colorchannelmixer=rr=0:gg=1:bb=1[edgeB]`,
    `[edgeA][edgeB]blend=all_mode=addition${output}`,
  ].join(';');
}

export function croppedRoiLayout(input: CroppedRoiLayoutInput): string {
  const output = input.output ?? '[v]';
  const magnification = input.magnification ?? 2.5;
  const { h, w, x, y } = input.rect;
  const crop = `crop=${String(w)}:${String(h)}:${String(x)}:${String(y)}`;
  const scale = `scale=iw*${String(magnification)}:ih*${String(magnification)}`;

  // legend chip: ROI magnifier
  return [
    `${input.left}${crop},${scale}[roiA]`,
    `${input.right}${crop},${scale}[roiB]`,
    `[roiA][roiB]xstack=inputs=2:layout=0_0|w0_0${output}`,
  ].join(';');
}
