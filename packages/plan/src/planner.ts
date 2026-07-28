import { placeAnnotations } from './collision.js';
import { emitFeatureAnnotations } from './features.js';
import {
  buildVarianceGrid,
  findLargestLowVarianceRect,
} from './variance-grid.js';

import type {
  AnnotationBox,
  BuildPlanInput,
  Rect,
  ReproPlan,
} from './types.js';
import type { Annotation } from '@repro/core';

export function buildPlan(input: BuildPlanInput): ReproPlan {
  const emitted = emitFeatureAnnotations(input);
  const explicitRedactions = input.redactionRects ?? [];
  const redactionRects = [...explicitRedactions, ...emitted.redactionRects];
  const lowVarianceRect = bestAnnotationRegion(input);
  const annotations = seedUnanchoredBounds(
    emitted.annotations,
    lowVarianceRect,
  );
  const regions = [...regionsOfInterest(annotations), ...redactionRects];
  const placed = placeAnnotations({
    annotations,
    regionsOfInterest: regions,
    viewport: input.viewport,
  });

  return {
    annotations: placed,
    chapters: emitted.chapters,
    metadata: {
      durationMs: durationMs(input, emitted.segments),
      generatedAtEpoch: Date.now(),
    },
    narrationSegments: emitted.narrationSegments,
    redactionRects,
    schemaVersion: 1,
    segments: emitted.segments,
    viewport: input.viewport,
  };
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

function seedUnanchoredBounds(
  annotations: readonly AnnotationBox[],
  region: Rect | null,
): readonly AnnotationBox[] {
  if (region === null) {
    return annotations;
  }

  return annotations.map((annotation) => {
    if (hasObjectTarget(annotation)) {
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

function durationMs(
  input: BuildPlanInput,
  segments: ReproPlan['segments'],
): number {
  const eventEnd = Math.max(
    0,
    ...input.events.map((event) => event.t_mono),
    ...input.frames.map((frame) => frame.t_mono),
  );
  const segmentEnd = Math.max(
    0,
    ...segments.map((segment) => {
      return segment.timeRange.end;
    }),
  );

  return Math.max(eventEnd, segmentEnd);
}
