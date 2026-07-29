import type { GeometryDelta } from './geometry-diff.js';
import type { SyncAnchor, SyncMap } from './sync.js';

export type CompareLayout =
  | 'side-by-side'
  | 'onion'
  | 'wipe'
  | 'cropped-roi'
  | 'difference'
  | 'edge'
  | 'blink';

export interface ComparePane {
  readonly runId: string;
  readonly role: 'before' | 'after';
  readonly label: string;
  readonly build?: string;
  readonly viewport?: Record<string, unknown>;
  readonly color?: 'before' | 'after';
}

export interface CompareCompositionDelta {
  readonly selector: string;
  readonly class:
    | 'geometry'
    | 'color'
    | 'typography'
    | 'content'
    | 'visibility'
    | 'flow';
  readonly dx?: number;
  readonly dy?: number;
  readonly dw?: number;
  readonly dh?: number;
  readonly before?: string;
  readonly after?: string;
  readonly caption?: string;
  readonly ringA?: 'remove' | 'change' | 'before';
  readonly ringB?: 'add' | 'change' | 'after';
}

export interface CompareComposition {
  readonly schemaVersion: string;
  readonly bugId?: string;
  readonly layout: CompareLayout;
  readonly layoutReason?: string;
  readonly output: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly filename?: string;
  };
  readonly panes: {
    readonly a: ComparePane;
    readonly b: ComparePane;
  };
  readonly sync: {
    readonly strategy: 'anchored-dtw' | 'anchors-only' | 'dtw-only';
    readonly anchors?: readonly SyncAnchor[];
    readonly band?: { readonly kind: 'sakoe-chiba'; readonly radiusMs?: number };
    readonly signature?: string;
    readonly maxStretch?: number;
    readonly knots: readonly (readonly [number, number, number, number])[];
    readonly lowConfidenceSpans?: SyncMap['lowConfidenceSpans'];
  };
  readonly onion?: {
    readonly beforeOpacity?: number;
    readonly ghostRing?: boolean;
  };
  readonly wipe?: {
    readonly axis?: 'vertical' | 'horizontal';
    readonly animate?: boolean;
    readonly restAt?: number;
    readonly restForMs?: number;
  };
  readonly croppedRoi?: {
    readonly rect?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly magnification?: number;
  };
  readonly blink?: {
    readonly hz?: number;
    readonly optIn: true;
  };
  readonly deltas?: readonly CompareCompositionDelta[];
  readonly chrome?: {
    readonly sharedRail?: boolean;
    readonly driftTicks?: boolean;
    readonly legend?: string;
    readonly stepCounter?: boolean;
  };
  readonly a11y?: {
    readonly blinkUsed?: boolean;
    readonly maxFlashHz?: number;
  };
}

const SUB_PIXEL_THRESHOLD = 8;

export function selectLayout(
  deltas: readonly GeometryDelta[],
): { readonly layout: CompareLayout; readonly reason: string } {
  if (deltas.length === 0) {
    return { layout: 'side-by-side', reason: 'content/flow change' };
  }

  if (
    deltas.some(
      (delta) =>
        delta.kind === 'appeared' || delta.kind === 'disappeared',
    )
  ) {
    return { layout: 'side-by-side', reason: 'content/flow change' };
  }

  if (deltas.some((delta) => delta.kind === 'restyled')) {
    return { layout: 'wipe', reason: 'color/typography change' };
  }

  if (
    deltas.some(
      (delta) =>
        (delta.kind === 'moved' || delta.kind === 'resized') &&
        maxDeltaMagnitude(delta) < SUB_PIXEL_THRESHOLD,
    )
  ) {
    return { layout: 'cropped-roi', reason: 'sub-8px geometry delta' };
  }

  if (deltas.some((delta) => delta.kind === 'moved' || delta.kind === 'resized')) {
    return { layout: 'onion', reason: 'geometry shift' };
  }

  return { layout: 'side-by-side', reason: 'content/flow change' };
}

export function buildCompareComposition(input: {
  readonly bugId?: string;
  readonly deltas: readonly GeometryDelta[];
  readonly sync: SyncMap;
  readonly panes: {
    readonly a: ComparePane;
    readonly b: ComparePane;
  };
  readonly output: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly filename?: string;
  };
  readonly layoutOverride?: CompareLayout;
  readonly croppedRoi?: CompareComposition['croppedRoi'];
}): CompareComposition {
  const selected = selectLayout(input.deltas);
  const layout = input.layoutOverride ?? selected.layout;
  const compositionDeltas = input.deltas.map(toCompositionDelta);
  const croppedRoi =
    layout === 'cropped-roi'
      ? (input.croppedRoi ?? croppedRoiFromDeltas(input.deltas))
      : undefined;

  return {
    ...(input.bugId === undefined ? {} : { bugId: input.bugId }),
    a11y: {
      blinkUsed: layout === 'blink',
      maxFlashHz: 2,
    },
    chrome: {
      driftTicks: true,
      sharedRail: true,
      stepCounter: true,
    },
    deltas: compositionDeltas,
    layout,
    layoutReason: selected.reason,
    output: input.output,
    panes: input.panes,
    sync: {
      anchors: input.sync.anchors,
      band: { kind: 'sakoe-chiba', radiusMs: 250 },
      knots: input.sync.knots,
      lowConfidenceSpans: input.sync.lowConfidenceSpans,
      maxStretch: 2.5,
      signature: 'luma-32x18',
      strategy: input.sync.strategy,
    },
    ...(layout === 'onion'
      ? { onion: { beforeOpacity: 0.45, ghostRing: true } }
      : {}),
    ...(layout === 'wipe'
      ? { wipe: { animate: true, axis: 'vertical', restAt: 0.5, restForMs: 1000 } }
      : {}),
    ...(croppedRoi === undefined ? {} : { croppedRoi }),
    ...(layout === 'blink'
      ? { blink: { hz: 2, optIn: true as const } }
      : {}),
    schemaVersion: '1.0.0',
  };
}

function maxDeltaMagnitude(delta: GeometryDelta): number {
  return Math.max(
    Math.abs(delta.dx),
    Math.abs(delta.dy),
    Math.abs(delta.dw),
    Math.abs(delta.dh),
  );
}

function croppedRoiFromDeltas(
  deltas: readonly GeometryDelta[],
): CompareComposition['croppedRoi'] {
  const delta = deltas[0];
  const bounds = delta?.after?.bounds ?? delta?.before?.bounds;

  if (bounds === undefined) {
    return { magnification: 2.5 };
  }

  const padding = 16;

  return {
    magnification: 2.5,
    rect: {
      h: bounds.h + padding * 2,
      w: bounds.w + padding * 2,
      x: Math.max(0, bounds.x - padding),
      y: Math.max(0, bounds.y - padding),
    },
  };
}

function toCompositionDelta(delta: GeometryDelta): CompareCompositionDelta {
  const selector =
    delta.after?.testId !== undefined
      ? `[data-testid='${delta.after.testId}']`
      : delta.before?.testId !== undefined
        ? `[data-testid='${delta.before.testId}']`
        : delta.key;

  const ringA = ringAFor(delta);
  const ringB = ringBFor(delta);

  return {
    caption: delta.caption,
    class: deltaClass(delta),
    dh: delta.dh,
    dw: delta.dw,
    dx: delta.dx,
    dy: delta.dy,
    selector,
    ringA,
    ringB,
    ...(delta.after?.text === undefined ? {} : { after: delta.after.text }),
    ...(delta.before?.text === undefined ? {} : { before: delta.before.text }),
  };
}

function deltaClass(delta: GeometryDelta): CompareCompositionDelta['class'] {
  if (delta.kind === 'restyled') {
    const styles = delta.after?.styles ?? delta.before?.styles ?? {};
    const keys = Object.keys(styles).join(' ').toLowerCase();

    if (keys.includes('font') || keys.includes('size') || keys.includes('weight')) {
      return 'typography';
    }

    return 'color';
  }

  if (delta.kind === 'appeared' || delta.kind === 'disappeared') {
    return delta.kind === 'appeared' ? 'content' : 'visibility';
  }

  return 'geometry';
}

function ringAFor(
  delta: GeometryDelta,
): NonNullable<CompareCompositionDelta['ringA']> {
  if (delta.kind === 'disappeared') {
    return 'remove';
  }

  return delta.kind === 'restyled' ? 'change' : 'before';
}

function ringBFor(
  delta: GeometryDelta,
): NonNullable<CompareCompositionDelta['ringB']> {
  if (delta.kind === 'appeared') {
    return 'add';
  }

  return delta.kind === 'restyled' ? 'change' : 'after';
}
