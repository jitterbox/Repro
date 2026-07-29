import { alignSteps } from './align.js';
import { buildCompareComposition } from './composition.js';
import { diffGeometry } from './geometry-diff.js';
import {
  blinkLayout,
  croppedRoiLayout,
  differenceLayout,
  edgeOverlayLayout,
  onionLayout,
  sideBySideLayout,
  wipeLayout,
} from './layouts.js';
import { buildSyncMap } from './sync.js';

import type { StepAlignment, TimelineStep } from './align.js';
import type { CompareComposition, CompareLayout, ComparePane } from './composition.js';
import type { ElementSnapshot, GeometryDelta } from './geometry-diff.js';
import type { SyncAnchor, SyncMap } from './sync.js';

export interface CompareInput {
  readonly baselineSteps: readonly TimelineStep[];
  readonly candidateSteps: readonly TimelineStep[];
  readonly baselineGeometry: readonly ElementSnapshot[];
  readonly candidateGeometry: readonly ElementSnapshot[];
  readonly bugId?: string;
  readonly panes?: {
    readonly a: ComparePane;
    readonly b: ComparePane;
  };
  readonly output?: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly filename?: string;
  };
  readonly syncAnchors?: readonly SyncAnchor[];
  readonly signatureA?: readonly Float32Array[];
  readonly signatureB?: readonly Float32Array[];
  readonly timesA?: readonly number[];
  readonly timesB?: readonly number[];
  readonly layoutOverride?: CompareLayout;
}

export interface CompareResult {
  readonly alignments: readonly StepAlignment[];
  readonly geometryDeltas: readonly GeometryDelta[];
  readonly layouts: CompareLayouts;
  readonly composition?: CompareComposition;
  readonly sync?: SyncMap;
}

export interface CompareLayouts {
  readonly sideBySide: string;
  readonly onion: string;
  readonly wipe: string;
  readonly blink: string;
  readonly difference: string;
  readonly edgeOverlay: string;
  readonly croppedRoi?: string;
}

const DEFAULT_OUTPUT = {
  fps: 30,
  height: 720,
  width: 1280,
} as const;

export function compareRepros(input: CompareInput): CompareResult {
  const alignments = alignSteps(input.baselineSteps, input.candidateSteps);
  const geometryDeltas = diffGeometry({
    after: input.candidateGeometry,
    before: input.baselineGeometry,
  });
  const sync = buildSyncFromInput(input, alignments);
  const composition = buildCompositionDocument(input, geometryDeltas, sync);
  const layouts = buildLayouts(geometryDeltas, composition);

  return {
    alignments,
    composition,
    geometryDeltas,
    layouts,
    sync,
  };
}

function buildSyncFromInput(
  input: CompareInput,
  alignments: readonly StepAlignment[],
): SyncMap {
  const anchors =
    input.syncAnchors ??
    alignments
      .filter((alignment) => alignment.kind === 'matched')
      .map((alignment) => ({
        aMs: alignment.stepA?.startMs ?? alignment.canonicalStartMs,
        bMs: alignment.stepB?.startMs ?? alignment.canonicalStartMs,
        outMs: alignment.canonicalStartMs,
        stepId: alignment.stepA?.id ?? alignment.stepB?.id ?? 'step',
      }));

  if (
    input.signatureA !== undefined &&
    input.signatureB !== undefined &&
    input.timesA !== undefined &&
    input.timesB !== undefined
  ) {
    return buildSyncMap({
      anchors,
      signatureA: input.signatureA,
      signatureB: input.signatureB,
      timesA: input.timesA,
      timesB: input.timesB,
    });
  }

  return {
    anchors,
    knots: anchors.map((anchor) => [
      anchor.aMs,
      anchor.bMs,
      anchor.outMs ?? anchor.aMs,
      1,
    ] as const),
    lowConfidenceSpans: [],
    strategy: 'anchored-dtw',
  };
}

function buildCompositionDocument(
  input: CompareInput,
  geometryDeltas: readonly GeometryDelta[],
  sync: SyncMap,
): CompareComposition {
  return buildCompareComposition({
    ...(input.bugId === undefined ? {} : { bugId: input.bugId }),
    deltas: geometryDeltas,
    ...(input.layoutOverride === undefined
      ? {}
      : { layoutOverride: input.layoutOverride }),
    output: input.output ?? DEFAULT_OUTPUT,
    panes: input.panes ?? defaultPanes(),
    sync,
  });
}

function buildLayouts(
  geometryDeltas: readonly GeometryDelta[],
  composition: CompareComposition,
): CompareLayouts {
  const streamInput = { left: '[0:v]', right: '[1:v]' };
  const wipeProgress = composition.wipe?.restAt ?? 0.5;
  const layouts: CompareLayouts = {
    blink: blinkLayout(streamInput),
    difference: differenceLayout(streamInput),
    edgeOverlay: edgeOverlayLayout(streamInput),
    onion: onionLayout(streamInput),
    sideBySide: sideBySideLayout(streamInput),
    wipe: wipeLayout({ ...streamInput, progress: wipeProgress }),
  };

  const rect = composition.croppedRoi?.rect;

  if (rect !== undefined) {
    return {
      ...layouts,
      croppedRoi: croppedRoiLayout({
        ...streamInput,
        ...(composition.croppedRoi?.magnification === undefined
          ? {}
          : { magnification: composition.croppedRoi.magnification }),
        rect,
      }),
    };
  }

  if (composition.layout === 'cropped-roi' && geometryDeltas.length > 0) {
    const bounds =
      geometryDeltas[0]?.after?.bounds ??
      geometryDeltas[0]?.before?.bounds;

    if (bounds !== undefined) {
      return {
        ...layouts,
        croppedRoi: croppedRoiLayout({
          ...streamInput,
          rect: {
            h: bounds.h + 32,
            w: bounds.w + 32,
            x: Math.max(0, bounds.x - 16),
            y: Math.max(0, bounds.y - 16),
          },
        }),
      };
    }
  }

  return layouts;
}

function defaultPanes(): { readonly a: ComparePane; readonly b: ComparePane } {
  return {
    a: {
      color: 'before',
      label: 'BEFORE',
      role: 'before',
      runId: 'run-a',
    },
    b: {
      color: 'after',
      label: 'AFTER',
      role: 'after',
      runId: 'run-b',
    },
  };
}
