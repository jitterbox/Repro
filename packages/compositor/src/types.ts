export type ViewportSpec = {
  width: number;
  height: number;
  deviceScaleFactor?: number;
};

export type SlateMode = 'repro' | 'demo' | 'compare';

export type SlateProps = {
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
};

export type ConsoleLevel = 'error' | 'warn' | 'info' | 'log';

export type ConsoleToastProps = {
  level: ConsoleLevel;
  message: string;
  timestamp?: string;
};

export type BoundingRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RoiMagnifierProps = {
  sourceRect: BoundingRect;
  magnification: number;
  pipRect?: BoundingRect;
  label?: string;
};

export type VitalsHudProps = {
  cls?: number;
  lcp?: number;
  inp?: number;
  slot?: 'tl' | 'tr' | 'bl' | 'br';
};

export type OutcomePairProps = {
  expected: string;
  actual: string;
};

export type ComparePaneChrome = {
  label: string;
  build?: string;
  runId?: string;
};

export type CompareChromeProps = {
  bugId: string;
  layout: string;
  paneA: ComparePaneChrome;
  paneB: ComparePaneChrome;
  stepIndex?: number;
  stepCount?: number;
  deltaCaption?: string;
  legend?: string;
};

export type FreezeBannerProps = {
  label?: string;
};

export type DeltaCaptionProps = {
  caption: string;
  deltaClass?:
    | 'geometry'
    | 'color'
    | 'typography'
    | 'content'
    | 'visibility'
    | 'flow';
};

export type CardSpec =
  | { kind: 'slate'; props: SlateProps; id: string }
  | { kind: 'console-toast'; props: ConsoleToastProps; id: string }
  | { kind: 'roi-magnifier'; props: RoiMagnifierProps; id: string }
  | { kind: 'vitals-hud'; props: VitalsHudProps; id: string }
  | { kind: 'outcome-pair'; props: OutcomePairProps; id: string }
  | { kind: 'compare-chrome'; props: CompareChromeProps; id: string }
  | { kind: 'freeze-banner'; props: FreezeBannerProps; id: string }
  | { kind: 'delta-caption'; props: DeltaCaptionProps; id: string };

export type RenderResult = {
  id: string;
  path: string;
  width: number;
  height: number;
};
