export interface MaskSample {
  readonly group: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
/** Conservative coverage between observed selector positions; one opaque region per group. */
export function motionMaskEnvelopes(samples: readonly MaskSample[]) {
  const groups = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  for (const sample of samples) {
    if (
      ![sample.x, sample.y, sample.width, sample.height].every(
        Number.isFinite,
      ) ||
      sample.width < 0 ||
      sample.height < 0
    )
      throw new Error('Invalid measured privacy region');
    if (!sample.width || !sample.height) continue;
    const previous = groups.get(sample.group);
    if (!previous)
      groups.set(sample.group, {
        x: sample.x,
        y: sample.y,
        width: sample.width,
        height: sample.height,
      });
    else {
      const x = Math.min(previous.x, sample.x),
        y = Math.min(previous.y, sample.y);
      groups.set(sample.group, {
        x,
        y,
        width:
          Math.max(previous.x + previous.width, sample.x + sample.width) - x,
        height:
          Math.max(previous.y + previous.height, sample.y + sample.height) - y,
      });
    }
  }
  return [...groups.values()];
}
