import {
  buildPixelizeRedactionFilter,
  buildRectMaskFilter,
  expandScrollBand,
} from './redaction-filters.js';

import type { Rect, ReproPlan } from '@repro/plan';

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
}

type RedactionRect = Rect & {
  readonly scrollBand?: boolean;
  readonly scrolling?: boolean;
  readonly scrollMargin?: number;
};

interface RedactionMetadata {
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
  const rects = expandedRedactionRects(input.plan);

  if (rects.length === 0) {
    return { filter: '', hasRedactions: false };
  }

  return {
    filter: [
      buildRectMaskFilter(rects, input.maskLabel, input.plan.viewport),
      buildPixelizeRedactionFilter({
        maskLabel: input.maskLabel,
        outputLabel: input.outputLabel,
        sourceLabel: input.inputLabel,
        ...(input.workLabel === undefined
          ? {}
          : { workLabel: input.workLabel }),
      }),
    ].join(';'),
    hasRedactions: true,
  };
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
