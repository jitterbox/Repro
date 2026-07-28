import { alignSteps } from './align.js';
import { diffGeometry } from './geometry-diff.js';
import {
  blinkLayout,
  differenceLayout,
  edgeOverlayLayout,
  onionLayout,
  sideBySideLayout,
  wipeLayout,
} from './layouts.js';

import type { StepAlignment, TimelineStep } from './align.js';
import type { ElementSnapshot, GeometryDelta } from './geometry-diff.js';

export interface CompareInput {
  readonly baselineSteps: readonly TimelineStep[];
  readonly candidateSteps: readonly TimelineStep[];
  readonly baselineGeometry: readonly ElementSnapshot[];
  readonly candidateGeometry: readonly ElementSnapshot[];
}

export interface CompareResult {
  readonly alignments: readonly StepAlignment[];
  readonly geometryDeltas: readonly GeometryDelta[];
  readonly layouts: CompareLayouts;
}

export interface CompareLayouts {
  readonly sideBySide: string;
  readonly onion: string;
  readonly wipe: string;
  readonly blink: string;
  readonly difference: string;
  readonly edgeOverlay: string;
}

export function compareRepros(input: CompareInput): CompareResult {
  return {
    alignments: alignSteps(input.baselineSteps, input.candidateSteps),
    geometryDeltas: diffGeometry({
      after: input.candidateGeometry,
      before: input.baselineGeometry,
    }),
    layouts: {
      blink: blinkLayout({ left: '[0:v]', right: '[1:v]' }),
      difference: differenceLayout({ left: '[0:v]', right: '[1:v]' }),
      edgeOverlay: edgeOverlayLayout({ left: '[0:v]', right: '[1:v]' }),
      onion: onionLayout({ left: '[0:v]', right: '[1:v]' }),
      sideBySide: sideBySideLayout({ left: '[0:v]', right: '[1:v]' }),
      wipe: wipeLayout({ left: '[0:v]', progress: 0.5, right: '[1:v]' }),
    },
  };
}
