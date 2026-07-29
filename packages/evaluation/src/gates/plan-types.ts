export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

export interface Bbox {
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface PlanAnnotation {
  readonly id: string;
  readonly component: string;
  readonly timeRange?: TimeRange;
  readonly outTimeRange?: TimeRange;
  readonly label?: string;
  readonly plate?: { readonly label?: string; readonly kicker?: string };
  readonly anchor?: { readonly bbox?: Bbox };
  readonly bounds?: Bbox;
  readonly placement?: { readonly x?: number; readonly y?: number };
}

export interface RedactionRect {
  readonly pageId?: string;
  readonly bbox: Bbox;
  readonly startMono?: number;
  readonly endMono?: number;
  readonly ruleId?: string;
}

export interface PlanDocument {
  readonly schemaVersion?: string;
  readonly mode?: string;
  readonly annotations?: readonly PlanAnnotation[];
  readonly redactionRects?: readonly RedactionRect[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly config?: {
    readonly redaction?: { readonly strict?: boolean };
  };
}

export interface TimelineDocument {
  readonly schemaVersion?: string;
  readonly fps?: number;
  readonly targetDurationMs?: number;
  readonly beats?: readonly Readonly<Record<string, unknown>>[];
}

export interface CompareComposition {
  readonly schemaVersion?: string;
  readonly bugId?: string;
  readonly panes?: Readonly<Record<string, { readonly label?: string }>>;
  readonly deltas?: readonly Readonly<Record<string, unknown>>[];
}
