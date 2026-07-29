import type {
  Annotation,
  EventRecord,
  FeatureFlags,
  FrameRecord,
  ReproConfig,
  TimeRange,
  Viewport,
} from '@repro/core';
import type { AnnotationComponent } from '@repro/contracts';

import type { Beat, BeatBadge, Timeline } from './timeline.js';

export type { TimeRange };
export type { Beat, BeatBadge, Timeline };

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

export interface AnnotationAnchor {
  readonly selector?: string;
  readonly pageId?: string;
  readonly bbox?: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly track?: 'static' | 'sticky' | 'path';
  readonly pad?: number;
  readonly evidenceRef?: string;
}

export interface AnnotationPlate {
  readonly kicker?: string;
  readonly label?: string;
  readonly measurement?: string;
  readonly maxChars?: number;
}

export interface AnnotationBox extends Annotation {
  readonly id: string;
  readonly feature: keyof FeatureFlags | 'chapter' | 'progress' | 'outcome';
  readonly component?: AnnotationComponent;
  readonly renderer?: 'ass' | 'compositor';
  readonly beatId?: string;
  readonly outTimeRange?: TimeRange;
  readonly anchor?: AnnotationAnchor;
  readonly plate?: AnnotationPlate;
  readonly bounds: Rect;
  readonly leaderLine?: LeaderLine;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly timeRange: TimeRange;
  readonly outTimeRange?: TimeRange;
}

export interface NarrationSegment {
  readonly id: string;
  readonly text: string;
  readonly timeRange: TimeRange;
  readonly outTimeRange?: TimeRange;
}

/** @deprecated Use BeatDraft / Timeline beats. Kept for migration. */
export type SegmentKind = 'pause' | 'slowmo';

/** @deprecated Use BeatDraft / Timeline beats. */
export interface Segment {
  readonly id: string;
  readonly kind: SegmentKind;
  readonly timeRange: TimeRange;
  readonly factor: number;
}

export interface BeatDraft {
  readonly id: string;
  readonly kind: 'play' | 'hold' | 'insert' | 'trim' | 'pause' | 'slowmo';
  readonly captureStartMs?: number;
  readonly captureEndMs?: number;
  readonly captureAtMs?: number;
  readonly rate?: number;
  readonly minOutDurationMs?: number;
  readonly badge?: BeatBadge;
  readonly assetRef?: string;
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
  /** @deprecated Prefer beatDrafts. */
  readonly segments: readonly Segment[];
  readonly beatDrafts: readonly BeatDraft[];
  readonly redactionRects: readonly Rect[];
}

export interface BuildPlanInput extends FeatureEmitInput {
  readonly keyframe?: KeyframeBuffer;
  readonly redactionRects?: readonly Rect[];
  readonly includeSlate?: boolean;
  readonly bugId?: string;
  /**
   * Decoded media length. When set, capture timeline is clamped so holds
   * land on real frames (event clocks often outlive sparse screencasts).
   */
  readonly mediaDurationMs?: number;
}

export interface ReproPlan {
  readonly schemaVersion: 1;
  readonly viewport: Viewport;
  readonly annotations: readonly AnnotationBox[];
  readonly chapters: readonly Chapter[];
  readonly narrationSegments?: readonly NarrationSegment[];
  readonly redactionRects: readonly Rect[];
  /** @deprecated Prefer timeline.beats. */
  readonly segments: readonly Segment[];
  readonly timeline: Timeline;
  readonly metadata: {
    readonly durationMs: number;
    readonly generatedAtEpoch: number;
    readonly bugId?: string;
  };
}
