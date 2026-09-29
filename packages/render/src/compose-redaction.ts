import {
  buildOpaqueRedactionFilter,
  expandScrollBand,
} from './redaction-filters.js';
import { rrwebInvertedSafeDefaults } from './redaction/source-mask.js';

import type { Rect, ReproPlan } from '@jitterbox/repro-plan';
import type { RrwebMaskOptions } from './redaction/source-mask.js';

export interface ComposeRedactionInput {
  readonly inputLabel: string;
  readonly maskLabel: string;
  readonly outputLabel: string;
  readonly plan: ReproPlan;
  readonly workLabel?: string;
}

export interface RedactionComposition {
  readonly filter: string;
  readonly hasRedactions: boolean;
  readonly rrwebMask: RrwebMaskOptions;
}

type RedactionRect = Rect & {
  readonly scrollBand?: boolean;
  readonly scrolling?: boolean;
  readonly scrollMargin?: number;
};

interface RedactionMetadata {
  readonly rrwebMask?: Parameters<typeof rrwebInvertedSafeDefaults>[0];
  readonly redaction?: {
    readonly scrollBands?: boolean;
    readonly scrollMargin?: number;
    readonly scrolling?: boolean;
  };
  readonly scrollBands?: boolean;
  readonly scrolling?: boolean;
}

const DEFAULT_SCROLL_MARGIN = 24;

export function composeRedactionFilter(
  input: ComposeRedactionInput,
): RedactionComposition {
  const rrwebMask = planRrwebMaskOptions(input.plan);
  const rects = expandedRedactionRects(input.plan);

  if (rects.length === 0) {
    return { filter: '', hasRedactions: false, rrwebMask };
  }

  return {
    filter: buildOpaqueRedactionFilter(
      rects,
      input.inputLabel,
      input.outputLabel,
      input.plan.viewport,
    ),
    hasRedactions: true,
    rrwebMask,
  };
}

export function planRrwebMaskOptions(plan: ReproPlan): RrwebMaskOptions {
  const metadata = plan.metadata as RedactionMetadata;
  return rrwebInvertedSafeDefaults(metadata.rrwebMask);
}

function expandedRedactionRects(plan: ReproPlan): readonly Rect[] {
  const metadata = plan.metadata as RedactionMetadata;
  const globalScrolling =
    metadata.scrolling === true ||
    metadata.scrollBands === true ||
    metadata.redaction?.scrolling === true ||
    metadata.redaction?.scrollBands === true;

  return plan.redactionRects.map((rect) => {
    const redaction = rect as RedactionRect;

    if (
      !globalScrolling &&
      redaction.scrolling !== true &&
      redaction.scrollBand !== true
    ) {
      return rect;
    }

    return expandScrollBand({
      margin:
        redaction.scrollMargin ??
        metadata.redaction?.scrollMargin ??
        DEFAULT_SCROLL_MARGIN,
      rect,
      viewportHeight: plan.viewport.height,
    });
  });
}
