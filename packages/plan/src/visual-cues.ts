import type { AnnotationComponent } from '@repro/contracts';

import type { AnnotationBox } from './types.js';

export interface VisualCueDocument {
  readonly schemaVersion: '1.0.0';
  readonly id: string;
  readonly component: AnnotationComponent;
  readonly severity: AnnotationBox['severity'];
  readonly outTimeRange: { readonly start: number; readonly end: number };
  readonly renderer: 'ass' | 'compositor';
  readonly layer: number;
  readonly accessibilityText?: string;
  readonly evidenceRef?: string;
  readonly step?: {
    readonly index: number;
    readonly total: number;
    readonly title: string;
  };
  readonly console?: {
    readonly level: 'error' | 'warn' | 'info' | 'log';
    readonly message: string;
  };
  readonly layoutShift?: {
    readonly before: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly after: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly dx?: number;
    readonly dy?: number;
    readonly dw?: number;
    readonly dh?: number;
  };
  readonly outcome?: {
    readonly expected: string;
    readonly actual: string;
  };
  readonly roi?: {
    readonly source: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly magnification: number;
  };
  readonly delta?: {
    readonly class:
      | 'geometry'
      | 'color'
      | 'typography'
      | 'content'
      | 'visibility'
      | 'flow';
    readonly caption: string;
  };
  readonly plate?: {
    readonly kicker?: string;
    readonly label?: string;
    readonly measurement?: string;
  };
  readonly anchor?: {
    readonly bbox?: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    };
    readonly selector?: string;
  };
}

const LAYER_BY_COMPONENT: Partial<Record<AnnotationComponent, number>> = {
  redaction: 2,
  'target-ring': 4,
  leader: 5,
  plate: 6,
  callout: 6,
  'console-toast': 7,
  'freeze-banner': 7,
  'vitals-hud': 7,
  'step-badge': 8,
  'progress-rail': 8,
  chapter: 8,
  'outcome-pair': 9,
  slate: 10,
};

/** Convert planned annotations into typed visual cue documents. */
export function annotationsToVisualCues(
  annotations: readonly AnnotationBox[],
): readonly VisualCueDocument[] {
  return annotations.flatMap((annotation) => {
    const cue = toVisualCue(annotation);
    return cue === undefined ? [] : [cue];
  });
}

function toVisualCue(annotation: AnnotationBox): VisualCueDocument | undefined {
  const component = annotation.component;
  if (component === undefined) {
    return undefined;
  }

  const range = annotation.outTimeRange ?? annotation.timeRange;
  const selector = selectorFromTarget(annotation.target);
  const anchor =
    annotation.anchor === undefined
      ? undefined
      : {
          ...(annotation.anchor.bbox === undefined
            ? {}
            : { bbox: annotation.anchor.bbox }),
          ...(selector === undefined ? {} : { selector }),
        };
  const plate = compactPlate(annotation.plate);
  const base: VisualCueDocument = {
    schemaVersion: '1.0.0',
    id: annotation.id,
    component,
    severity: annotation.severity,
    outTimeRange: { start: range.start, end: range.end },
    renderer: annotation.renderer ?? 'ass',
    layer: LAYER_BY_COMPONENT[component] ?? 6,
    accessibilityText: annotation.label,
    ...(plate === undefined ? {} : { plate }),
    ...(anchor === undefined ? {} : { anchor }),
  };

  if (component === 'step-badge') {
    const step = parseStep(annotation.plate?.label ?? annotation.label);
    if (step === undefined) {
      return undefined;
    }
    return { ...base, step };
  }

  if (component === 'console-toast') {
    return {
      ...base,
      console: {
        level: consoleLevel(annotation.label),
        message: annotation.plate?.label ?? annotation.label,
      },
    };
  }

  if (component === 'outcome-pair') {
    const expected = annotation.plate?.measurement;
    const actual = annotation.plate?.label ?? annotation.label;
    if (expected === undefined || expected.length === 0) {
      return undefined;
    }
    return { ...base, outcome: { expected, actual } };
  }

  if (component === 'roi-magnifier' && annotation.anchor?.bbox !== undefined) {
    const bbox = annotation.anchor.bbox;
    return {
      ...base,
      roi: {
        magnification: 2.5,
        source: {
          x: bbox.x,
          y: bbox.y,
          width: bbox.w,
          height: bbox.h,
        },
      },
    };
  }

  if (component === 'delta-caption') {
    return {
      ...base,
      delta: {
        class: 'geometry',
        caption: annotation.plate?.label ?? annotation.label,
      },
    };
  }

  if (component === 'layout-shift-pair') {
    const layoutShift = layoutShiftFromAnnotation(annotation);
    if (layoutShift === undefined) {
      return undefined;
    }
    return { ...base, layoutShift };
  }

  return base;
}

function compactPlate(
  plate: AnnotationBox['plate'],
): VisualCueDocument['plate'] | undefined {
  if (plate === undefined) {
    return undefined;
  }
  const next = {
    ...(plate.kicker === undefined ? {} : { kicker: plate.kicker }),
    ...(plate.label === undefined ? {} : { label: plate.label }),
    ...(plate.measurement === undefined
      ? {}
      : { measurement: plate.measurement }),
  };
  return Object.keys(next).length === 0 ? undefined : next;
}

function layoutShiftFromAnnotation(
  annotation: AnnotationBox,
): VisualCueDocument['layoutShift'] | undefined {
  const bbox = annotation.anchor?.bbox;
  if (bbox === undefined) {
    return undefined;
  }
  const before = {
    x: bbox.x,
    y: bbox.y,
    width: bbox.w,
    height: bbox.h,
  };
  const after = {
    x: annotation.bounds.x,
    y: annotation.bounds.y,
    width: annotation.bounds.width,
    height: annotation.bounds.height,
  };
  return {
    before,
    after,
    dx: after.x - before.x,
    dy: after.y - before.y,
    dw: after.width - before.width,
    dh: after.height - before.height,
  };
}

function parseStep(
  label: string,
): { index: number; total: number; title: string } | undefined {
  const match = /^STEP\s+(\d+)\s*\/\s*(\d+)(?:\s+(.+))?$/iu.exec(label.trim());
  if (match === null) {
    return undefined;
  }
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(index) || !Number.isFinite(total)) {
    return undefined;
  }
  return {
    index,
    total,
    title: match[3]?.trim() || label,
  };
}

function consoleLevel(label: string): 'error' | 'warn' | 'info' | 'log' {
  const lower = label.toLowerCase();
  if (lower.includes('error') || lower.includes('exception')) {
    return 'error';
  }
  if (lower.includes('warn')) {
    return 'warn';
  }
  if (lower.includes('info')) {
    return 'info';
  }
  return 'log';
}

function selectorFromTarget(
  target: AnnotationBox['target'],
): string | undefined {
  if (target === undefined || typeof target === 'string') {
    return undefined;
  }
  return typeof target.selector === 'string' && target.selector.length > 0
    ? target.selector
    : undefined;
}
