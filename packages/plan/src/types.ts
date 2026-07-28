import type {
  Annotation,
  EventRecord,
  FeatureFlags,
  FrameRecord,
  ReproConfig,
  TimeRange,
  Viewport,
} from '@repro/core';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LeaderLine {
  readonly from: Point;
  readonly to: Point;
}

export type CollisionPolicy = Annotation['collisionPolicy'];
export type AnnotationPlacement = NonNullable<Annotation['placement']>;

export interface AnnotationBox extends Annotation {
  readonly id: string;
  readonly feature: keyof FeatureFlags | 'chapter' | 'progress';
  readonly bounds: Rect;
  readonly leaderLine?: LeaderLine;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly timeRange: TimeRange;
}

export interface NarrationSegment {
  readonly id: string;
  readonly text: string;
  readonly timeRange: TimeRange;
}

export type SegmentKind = 'pause' | 'slowmo';

export interface Segment {
  readonly id: string;
  readonly kind: SegmentKind;
  readonly timeRange: TimeRange;
  readonly factor: number;
}

export interface KeyframeBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly channels?: 1 | 3 | 4;
}

export interface FeatureEmitInput {
  readonly config: ReproConfig;
  readonly events: readonly EventRecord[];
  readonly frames: readonly FrameRecord[];
  readonly viewport: Viewport;
}

export interface FeatureEmitResult {
  readonly annotations: readonly AnnotationBox[];
  readonly chapters: readonly Chapter[];
  readonly narrationSegments: readonly NarrationSegment[];
  readonly segments: readonly Segment[];
  readonly redactionRects: readonly Rect[];
}

export interface BuildPlanInput extends FeatureEmitInput {
  readonly keyframe?: KeyframeBuffer;
  readonly redactionRects?: readonly Rect[];
}

export interface ReproPlan {
  readonly schemaVersion: 1;
  readonly viewport: Viewport;
  readonly annotations: readonly AnnotationBox[];
  readonly chapters: readonly Chapter[];
  readonly narrationSegments?: readonly NarrationSegment[];
  readonly redactionRects: readonly Rect[];
  readonly segments: readonly Segment[];
  readonly metadata: {
    readonly durationMs: number;
    readonly generatedAtEpoch: number;
  };
}
