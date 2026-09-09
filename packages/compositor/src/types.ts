export interface ViewportSpec {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export type SlateMode = 'repro' | 'demo' | 'compare';

export interface SlateProps {
  schemaVersion: string;
  mode: SlateMode;
  bugId: string;
  title: string;
  browser: string;
  os: string;
  viewport: ViewportSpec;
  appLabel: string;
  profile?: 'faithful' | 'controlled';
  profileChip?: string;
  locale?: string;
  timezone?: string;
  build?: string;
  capturedAt?: string;
  stepCount?: number;
  durationMs?: number;
  outcome?: 'expected-pass' | 'expected-fail' | 'unknown';
  comparePanes?: {
    a?: { runId?: string; build?: string; label?: string };
    b?: { runId?: string; build?: string; label?: string };
  };
  holdMs?: number;
  dissolveMs?: number;
}

export type ConsoleLevel = 'error' | 'warn' | 'info' | 'log';

export interface ConsoleToastProps {
  level: ConsoleLevel;
  message: string;
  timestamp?: string;
}

export interface BoundingRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoiMagnifierProps {
  sourceRect: BoundingRect;
  magnification: number;
  pipRect?: BoundingRect;
  label?: string;
}

export interface VitalsHudProps {
  cls?: number;
  lcp?: number;
  inp?: number;
  slot?: 'tl' | 'tr' | 'bl' | 'br';
  summary?: string;
}

export interface OutcomePairProps {
  expected: string;
  actual: string;
}

export interface ComparePaneChrome {
  label: string;
  build?: string;
  runId?: string;
}

export interface CompareChromeProps {
  bugId: string;
  layout: string;
  paneA: ComparePaneChrome;
  paneB: ComparePaneChrome;
  stepIndex?: number;
  stepCount?: number;
  deltaCaption?: string;
  legend?: string;
}

export interface FreezeBannerProps {
  label?: string;
}

export interface DeltaCaptionProps {
  caption: string;
  deltaClass?:
    'geometry' | 'color' | 'typography' | 'content' | 'visibility' | 'flow';
}

type CardContent =
  | { kind: 'slate'; props: SlateProps; id: string }
  | { kind: 'console-toast'; props: ConsoleToastProps; id: string }
  | { kind: 'roi-magnifier'; props: RoiMagnifierProps; id: string }
  | { kind: 'vitals-hud'; props: VitalsHudProps; id: string }
  | { kind: 'outcome-pair'; props: OutcomePairProps; id: string }
  | { kind: 'compare-chrome'; props: CompareChromeProps; id: string }
  | { kind: 'freeze-banner'; props: FreezeBannerProps; id: string }
  | { kind: 'delta-caption'; props: DeltaCaptionProps; id: string };

export type CardSpec = CardContent & {
  placement?: { x: number; y: number; width: number; height: number };
  viewport?: ViewportSpec;
};

export interface RenderResult {
  id: string;
  path: string;
  width: number;
  height: number;
}
