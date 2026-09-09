import type { Observation } from '@repro/contracts';

/** A ring belongs to one screenshot on its measured page, never a namesake popup. */
export function screenshotForBounds(
  bounds: Observation,
  observations: readonly Observation[],
): Observation | undefined {
  if (bounds.kind !== 'bounds' || bounds.status !== 'passed' || !bounds.bounds)
    return undefined;
  const matches = observations.filter(
    (image) =>
      image.kind === 'screenshot' &&
      image.status === 'passed' &&
      image.checkpoint === bounds.checkpoint &&
      image.pageId === bounds.pageId &&
      (bounds.endMs === undefined ||
        (image.timeMs >= bounds.timeMs &&
          (image.endMs ?? image.timeMs) <= bounds.endMs)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
