import type { SceneSegment } from '@jitterbox/repro-contracts';

/** Preserve source/output clocks while applying recorded active-page changes. */
export function splitScenePages(
  segments: SceneSegment[],
  cuts: { t_mono: number; pageId: string }[],
  initialPage: string | undefined,
): SceneSegment[] {
  const ordered = [...cuts].sort((a, b) => a.t_mono - b.t_mono);
  return segments.flatMap((segment) => {
    if (segment.kind !== 'play' || segment.pageId) return [segment];
    const start = segment.sourceStartMs ?? 0;
    const end = start + segment.outDurationMs * segment.rate;
    const inside = ordered.filter(
      (cut) => cut.t_mono > start && cut.t_mono < end,
    );
    const boundaries = [
      start,
      ...new Set(inside.map((cut) => cut.t_mono)),
      end,
    ];
    return boundaries.slice(0, -1).map((sourceStartMs, i) => {
      const pageId =
        ordered.filter((cut) => cut.t_mono <= sourceStartMs).at(-1)?.pageId ??
        initialPage;
      if (!pageId)
        throw new Error(`Missing active page for segment ${segment.id}`);
      return {
        ...segment,
        id: i === 0 ? segment.id : `${segment.id}-page-${i + 1}`,
        pageId,
        sourceStartMs,
        outStartMs: segment.outStartMs + (sourceStartMs - start) / segment.rate,
        outDurationMs:
          ((boundaries[i + 1] ?? end) - sourceStartMs) / segment.rate,
      };
    });
  });
}
