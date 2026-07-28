export interface LayoutInput {
  readonly left: string;
  readonly right: string;
  readonly output?: string;
}

export interface WipeLayoutInput extends LayoutInput {
  readonly progress: number;
}

export function sideBySideLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  return `${input.left}${input.right}xstack=inputs=2:layout=0_0|w0_0${output}`;
}

export function onionLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  return `${input.left}${input.right}blend=all_mode=average:all_opacity=0.5${output}`;
}

export function wipeLayout(input: WipeLayoutInput): string {
  const output = input.output ?? '[v]';
  const progress = Math.max(0, Math.min(1, input.progress));

  return `${input.left}${input.right}overlay=x='W*${String(progress)}'${output}`;
}

export function blinkLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  return `${input.left}${input.right}blend=all_expr='if(eq(mod(N,2),0),A,B)'${output}`;
}

export function differenceLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  return `${input.left}${input.right}blend=all_mode=difference,eq=contrast=2${output}`;
}

export function edgeOverlayLayout(input: LayoutInput): string {
  const output = input.output ?? '[v]';

  return [
    `${input.left}sobel,format=rgba,colorchannelmixer=rr=1:gg=0:bb=0[edgeA]`,
    `${input.right}sobel,format=rgba,colorchannelmixer=rr=0:gg=1:bb=1[edgeB]`,
    `[edgeA][edgeB]blend=all_mode=addition${output}`,
  ].join(';');
}
