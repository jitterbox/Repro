import { placeAnnotations } from './collision.js';
import { emitFeatureAnnotations } from './features.js';
import {
  compileTimeline,
  mapTimeRange,
  timelineDurationMs,
} from './timeline.js';
import {
  buildVarianceGrid,
  findLargestLowVarianceRect,
} from './variance-grid.js';

import type {
  AnnotationBox,
  BeatDraft,
  BuildPlanInput,
  Chapter,
  NarrationSegment,
  Rect,
  ReproPlan,
  TimeRange,
} from './types.js';
import type { Annotation } from '@repro/core';

export function buildPlan(input: BuildPlanInput): ReproPlan {
  const emitted = emitFeatureAnnotations(input);
  const explicitRedactions = input.redactionRects ?? [];
  const redactionRects = [...explicitRedactions, ...emitted.redactionRects];
  const bounds = captureBounds(input);
  const captureDurationMs =
    input.mediaDurationMs === undefined
      ? bounds.durationMs
      : Math.max(1, Math.min(bounds.durationMs, input.mediaDurationMs));
  const rawDrafts =
    emitted.beatDrafts.length > 0
      ? emitted.beatDrafts
      : segmentsToDrafts(emitted.segments);
  const drafts = clampDrafts(
    shiftDrafts(rawDrafts, bounds.originMs),
    captureDurationMs,
  );

  const bugId =
    input.bugId ??
    stringMeta(input.config.metadata, 'bugId') ??
    stringMeta(input.config.metadata, 'issueId');
  // Slate is fail-closed without bugId; keep timeline aligned with encode.
  const includeSlate =
    (input.includeSlate ?? input.config.features.specCard === true) &&
    bugId !== undefined;
  const timeline = compileTimeline({
    captureDurationMs,
    drafts,
    includeSlate,
    ...(input.config.mode === 'repro' ? { outcomeHoldMs: 2_500 } : {}),
  });

  // Variance grid still informs ROI avoidance; centre-seeding is gone (P1).
  void bestAnnotationRegion(input);
  const annotations = mapAnnotations(
    shiftAnnotations(emitted.annotations, bounds.originMs),
    timeline,
    captureDurationMs,
  );
  const chapters = mapChapters(
    shiftChapters(emitted.chapters, bounds.originMs),
    timeline,
    captureDurationMs,
  );
  const narrationSegments = mapNarration(
    shiftNarration(emitted.narrationSegments, bounds.originMs),
    timeline,
    captureDurationMs,
  );

  const regions = [...regionsOfInterest(annotations), ...redactionRects];
  const placed = placeAnnotations({
    annotations,
    regionsOfInterest: regions,
    viewport: input.viewport,
  });

  return {
    annotations: placed,
    chapters,
    metadata: {
      durationMs: timelineDurationMs(timeline),
      generatedAtEpoch: Date.now(),
      ...(bugId === undefined ? {} : { bugId }),
    },
    narrationSegments,
    redactionRects,
    schemaVersion: 1,
    segments: emitted.segments,
    timeline,
    viewport: input.viewport,
  };
}

function stringMeta(
  metadata: BuildPlanInput['config']['metadata'],
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function mapAnnotations(
  annotations: readonly AnnotationBox[],
  timeline: ReproPlan['timeline'],
  captureDurationMs: number,
): readonly AnnotationBox[] {
  return annotations.map((annotation) => {
    if (annotation.component === 'slate') {
      const hold = Math.max(
        1,
        annotation.timeRange.end - annotation.timeRange.start,
      );
      return {
        ...annotation,
        outTimeRange: { start: 0, end: hold },
      };
    }
    const captureRange = clampCaptureRange(
      annotation.timeRange,
      captureDurationMs,
    );
    const mapped = mapTimeRange(timeline, captureRange);
    return {
      ...annotation,
      timeRange: captureRange,
      outTimeRange: ensureOutHold(
        mapped,
        timeline,
        minHoldForComponent(annotation.component),
      ),
    };
  });
}

function minHoldForComponent(component: string | undefined): number {
  switch (component) {
    case 'console-toast':
      return 900;
    case 'outcome-pair':
    case 'outcome':
      return 1_400;
    case 'slate':
      return 1_800;
    case 'step-badge':
      return 600;
    case 'plate':
    case 'callout':
      return 800;
    default:
      return 600;
  }
}

function mapChapters(
  chapters: readonly Chapter[],
  timeline: ReproPlan['timeline'],
  captureDurationMs: number,
): readonly Chapter[] {
  return chapters.map((chapter) => {
    const captureRange = clampCaptureRange(
      chapter.timeRange,
      captureDurationMs,
    );
    return {
      ...chapter,
      timeRange: captureRange,
      outTimeRange: ensureOutHold(
        mapTimeRange(timeline, captureRange),
        timeline,
        1_200,
      ),
    };
  });
}

function mapNarration(
  segments: readonly NarrationSegment[],
  timeline: ReproPlan['timeline'],
  captureDurationMs: number,
): readonly NarrationSegment[] {
  return segments.map((segment) => {
    const captureRange = clampCaptureRange(
      segment.timeRange,
      captureDurationMs,
    );
    return {
      ...segment,
      timeRange: captureRange,
      outTimeRange: ensureOutHold(
        mapTimeRange(timeline, captureRange),
        timeline,
        600,
      ),
    };
  });
}

function clampCaptureRange(
  range: TimeRange,
  captureDurationMs: number,
): TimeRange {
  const endLimit = Math.max(0, captureDurationMs);
  if (range.start >= endLimit) {
    const at = Math.max(0, endLimit - 1);
    return { start: at, end: endLimit };
  }
  const start = Math.min(Math.max(0, range.start), endLimit);
  const end = Math.min(Math.max(range.end, start + 1), endLimit);
  return { start, end: Math.max(end, start + 1) };
}

function ensureOutHold(
  range: TimeRange,
  timeline: ReproPlan['timeline'],
  minHoldMs: number,
): TimeRange {
  if (range.end - range.start >= minHoldMs) {
    return range;
  }
  const duration = timelineDurationMs(timeline);
  const end = Math.min(duration, Math.max(range.end, range.start + minHoldMs));
  const start = Math.max(0, end - minHoldMs);
  return { start, end: Math.max(end, start + 1) };
}

function segmentsToDrafts(
  segments: ReproPlan['segments'],
): ReturnType<typeof emitFeatureAnnotations>['beatDrafts'] {
  return segments.map((segment) => {
    if (segment.kind === 'pause') {
      return {
        id: segment.id,
        kind: 'hold' as const,
        captureAtMs: segment.timeRange.start,
        minOutDurationMs: Math.max(
          1_000,
          segment.timeRange.end - segment.timeRange.start,
        ),
        badge: 'PAUSED' as const,
      };
    }

    return {
      id: segment.id,
      kind: 'slowmo' as const,
      captureStartMs: segment.timeRange.start,
      captureEndMs: segment.timeRange.end,
      rate: 1 / Math.max(1, segment.factor),
      badge: 'SLOWMO' as const,
    };
  });
}

/** t_mono is absolute mono clock; capture time is relative to session origin. */
function captureBounds(input: BuildPlanInput): {
  readonly originMs: number;
  readonly durationMs: number;
} {
  const times = [
    ...input.events.map((event) => event.t_mono),
    ...input.frames.map((frame) => frame.t_mono),
  ];
  if (times.length === 0) {
    return { originMs: 0, durationMs: 1 };
  }
  const originMs = Math.min(...times);
  return {
    originMs,
    durationMs: Math.max(1, Math.max(...times) - originMs),
  };
}

function shiftRange(range: TimeRange, originMs: number): TimeRange {
  return {
    start: range.start - originMs,
    end: range.end - originMs,
  };
}

function shiftDrafts(
  drafts: readonly BeatDraft[],
  originMs: number,
): readonly BeatDraft[] {
  if (originMs === 0) {
    return drafts;
  }
  return drafts.map((draft) => ({
    ...draft,
    ...(draft.captureAtMs === undefined
      ? {}
      : { captureAtMs: draft.captureAtMs - originMs }),
    ...(draft.captureStartMs === undefined
      ? {}
      : { captureStartMs: draft.captureStartMs - originMs }),
    ...(draft.captureEndMs === undefined
      ? {}
      : { captureEndMs: draft.captureEndMs - originMs }),
  }));
}

function shiftAnnotations(
  annotations: readonly AnnotationBox[],
  originMs: number,
): readonly AnnotationBox[] {
  if (originMs === 0) {
    return annotations;
  }
  return annotations.map((annotation) => {
    // Slate is authored in output time [0, hold], not capture mono.
    if (annotation.component === 'slate') {
      return annotation;
    }
    return {
      ...annotation,
      timeRange: shiftRange(annotation.timeRange, originMs),
    };
  });
}

function shiftChapters(
  chapters: readonly Chapter[],
  originMs: number,
): readonly Chapter[] {
  if (originMs === 0) {
    return chapters;
  }
  return chapters.map((chapter) => ({
    ...chapter,
    timeRange: shiftRange(chapter.timeRange, originMs),
  }));
}

function shiftNarration(
  segments: readonly NarrationSegment[],
  originMs: number,
): readonly NarrationSegment[] {
  if (originMs === 0) {
    return segments;
  }
  return segments.map((segment) => ({
    ...segment,
    timeRange: shiftRange(segment.timeRange, originMs),
  }));
}

function clampDrafts(
  drafts: readonly BeatDraft[],
  captureDurationMs: number,
): readonly BeatDraft[] {
  const end = Math.max(0, captureDurationMs);
  return drafts.flatMap((draft) => {
    if (draft.captureAtMs !== undefined) {
      return [
        {
          ...draft,
          captureAtMs: Math.min(Math.max(0, draft.captureAtMs), end),
        },
      ];
    }
    const start = Math.min(Math.max(0, draft.captureStartMs ?? 0), end);
    const stop = Math.min(Math.max(0, draft.captureEndMs ?? end), end);
    if (stop <= start && draft.kind !== 'insert') {
      return [];
    }
    return [
      {
        ...draft,
        ...(draft.captureStartMs === undefined
          ? {}
          : { captureStartMs: start }),
        ...(draft.captureEndMs === undefined ? {} : { captureEndMs: stop }),
      },
    ];
  });
}

function bestAnnotationRegion(input: BuildPlanInput): Rect | null {
  if (input.keyframe === undefined) {
    return null;
  }

  const grid = buildVarianceGrid(input.keyframe);
  return findLargestLowVarianceRect(grid, {
    minColumns: 4,
    minRows: 2,
    threshold: 24,
  });
}

/**
 * @deprecated Centre-seeding will be removed in P1 once anchors are required.
 * Kept temporarily so existing fixtures still place something.
 */
function seedUnanchoredBounds(
  annotations: readonly AnnotationBox[],
  region: Rect | null,
): readonly AnnotationBox[] {
  if (region === null) {
    return annotations;
  }

  return annotations.map((annotation) => {
    if (hasObjectTarget(annotation) || annotation.anchor !== undefined) {
      return annotation;
    }

    return {
      ...annotation,
      bounds: {
        ...annotation.bounds,
        x: region.x + 12,
        y: region.y + 12,
      },
    };
  });
}

function regionsOfInterest(
  annotations: readonly AnnotationBox[],
): readonly Rect[] {
  return annotations.flatMap((annotation) => {
    const rect = targetRect(annotation);
    return rect === null ? [] : [rect];
  });
}

function targetRect(annotation: AnnotationBox): Rect | null {
  if (annotation.anchor?.bbox !== undefined) {
    const box = annotation.anchor.bbox;
    return { height: box.h, width: box.w, x: box.x, y: box.y };
  }

  if (!hasObjectTarget(annotation)) {
    return null;
  }

  const target = annotation.target;

  return {
    height: target.height ?? 0,
    width: target.width ?? 0,
    x: target.x ?? 0,
    y: target.y ?? 0,
  };
}

function hasObjectTarget(
  annotation: AnnotationBox,
): annotation is AnnotationBox & {
  readonly target: Extract<Annotation['target'], object>;
} {
  return (
    annotation.target !== undefined && typeof annotation.target === 'object'
  );
}
