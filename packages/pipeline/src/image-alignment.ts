import type { Observation } from '@jitterbox/repro-contracts';
import { compareDecodedPng } from '@jitterbox/repro-evaluation';

interface Image {
  observation: Observation;
  bytes: Buffer;
}
/** Reciprocal, unique image matches are inspection hints, never semantic proof. */
export function alignCheckpointImages(
  before: Image[],
  after: Image[],
  anchors: { aMs: number; bMs: number }[],
) {
  const scores = before.flatMap((a) =>
    after.flatMap((b) => {
      if (
        !anchors.every(
          (anchor) =>
            a.observation.timeMs < anchor.aMs ===
            b.observation.timeMs < anchor.bMs,
        )
      )
        return [];
      try {
        return [
          {
            a: a.observation,
            b: b.observation,
            ratio: compareDecodedPng(a.bytes, b.bytes).ratio,
          },
        ];
      } catch {
        return [];
      } // Incompatible image dimensions cannot establish alignment.
    }),
  );
  const uniqueBest = (
    ranked: typeof scores,
    candidate: (typeof scores)[number],
  ) => {
    ranked.sort((a, b) => a.ratio - b.ratio);
    return (
      ranked[0] === candidate &&
      candidate.ratio <= 0.02 &&
      (!ranked[1] || ranked[1].ratio - candidate.ratio >= 0.01)
    );
  };
  const matches = scores
    .filter(
      (candidate) =>
        uniqueBest(
          scores.filter((p) => p.a.id === candidate.a.id),
          candidate,
        ) &&
        uniqueBest(
          scores.filter((p) => p.b.id === candidate.b.id),
          candidate,
        ),
    )
    .sort((a, b) => a.a.timeMs - b.a.timeMs);
  // Reordered states cannot be resolved by appearance alone.
  return matches.filter((match, index) =>
    matches.every(
      (other, j) =>
        index === j ||
        (index < j
          ? match.b.timeMs < other.b.timeMs
          : match.b.timeMs > other.b.timeMs),
    ),
  );
}
