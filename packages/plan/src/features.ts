import { measureTextWidth } from './text.js';

import type {
  AnnotationBox,
  Chapter,
  FeatureEmitInput,
  FeatureEmitResult,
  NarrationSegment,
  Rect,
  Segment,
} from './types.js';
import type { EventRecord, JsonValue, TimeRange } from '@repro/core';

type PayloadObject = Readonly<Record<string, JsonValue>>;

export function emitFeatureAnnotations(
  input: FeatureEmitInput,
): FeatureEmitResult {
  const annotations: AnnotationBox[] = [];
  const chapters: Chapter[] = [];
  const narrationSegments: NarrationSegment[] = [];
  const segments: Segment[] = [];
  const redactionRects: Rect[] = [];
  const flags = input.config.features;

  for (const event of input.events) {
    if (flags.cursor === true) {
      annotations.push(...cursorAnnotations(event));
    }

    if (flags.clickViz === true) {
      annotations.push(...clickAnnotations(event));
    }

    if (flags.keystrokes === true) {
      annotations.push(...keystrokeAnnotations(event));
    }

    if (flags.consoleOverlay === true) {
      annotations.push(...consoleAnnotations(event));
    }

    if (flags.a11yOverlay === true) {
      annotations.push(...a11yAnnotations(event));
    }

    if (flags.hiddenElements === true) {
      annotations.push(...hiddenElementAnnotations(event));
    }

    if (flags.hitTargets === true) {
      annotations.push(...hitTargetAnnotations(event));
    }

    if (flags.layoutShiftViz === true) {
      annotations.push(...layoutShiftAnnotations(event));
    }

    if (flags.steps === true) {
      chapters.push(...stepChapters(event));
      annotations.push(...progressAnnotations(event));
    }

    if (flags.voiceover === true) {
      chapters.push(...voiceoverChapters(event));
      narrationSegments.push(...narrationSegmentsFrom(event));
    }

    if (flags.pauses === true) {
      segments.push(...pauseSegments(event));
    }

    if (flags.slowmo === true) {
      segments.push(...slowmoSegments(event));
      annotations.push(...speedBadgeAnnotations(event));
    }

    if (flags.zoom === true) {
      annotations.push(...zoomAnnotations(event));
    }

    if (flags.freezeDetect === true) {
      annotations.push(...freezeAnnotations(event));
    }

    if (flags.vitalsHud === true) {
      annotations.push(...vitalsAnnotations(event));
    }

    if (flags.redaction === true) {
      redactionRects.push(...redactionRectsFrom(event));
    }
  }

  annotations.push(...specCardAnnotations(input));
  return { annotations, chapters, narrationSegments, redactionRects, segments };
}

function cursorAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['cursor', 'mousemove', 'pointermove'])) {
    return [];
  }

  const target = rectFromPayload(event);
  return [annotation(event, 'cursor', 'Cursor', target, 10)];
}

function clickAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['click', 'pointerdown', 'mousedown'])) {
    return [];
  }

  const target = rectFromPayload(event);
  return [annotation(event, 'clickViz', 'Click', target, 90, 'ellipse')];
}

function keystrokeAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['key', 'input', 'type'])) {
    return [];
  }

  const payload = objectPayload(event);
  const value = stringValue(payload, 'key') ?? stringValue(payload, 'value');
  const label = value === undefined ? 'Keystroke' : `Typed ${value}`;
  return [annotation(event, 'keystrokes', label, rectFromPayload(event), 80)];
}

function consoleAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['console'])) {
    return [];
  }

  const payload = objectPayload(event);
  const level = stringValue(payload, 'level') ?? 'log';
  const text = stringValue(payload, 'message') ?? 'Console event';
  const label = `${level}: ${text}`;
  const target = rectFromPayload(event);
  const overlay = annotation(event, 'consoleOverlay', label, target, 70);

  if (target === null) {
    return [overlay];
  }

  return [
    overlay,
    annotation(
      event,
      'consoleOverlay',
      'Trigger highlight',
      target,
      50,
      'rect',
    ),
  ];
}

function a11yAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['a11y', 'axe', 'accessibility'])) {
    return [];
  }

  const payload = objectPayload(event);
  const label =
    stringValue(payload, 'rule') ??
    stringValue(payload, 'message') ??
    eventLabel(event, 'Accessibility issue');
  const overlay = annotation(
    event,
    'a11yOverlay',
    label,
    rectFromPayload(event),
    95,
  );
  return [{ ...overlay, kind: 'warning', severity: a11ySeverity(payload) }];
}

function hiddenElementAnnotations(
  event: EventRecord,
): readonly AnnotationBox[] {
  if (!matches(event, ['aria-hidden', 'hidden'])) {
    return [];
  }

  const label = eventLabel(event, 'Hidden element');
  return [
    annotation(event, 'hiddenElements', label, rectFromPayload(event), 65),
  ];
}

function hitTargetAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (
    !matches(event, [
      'hit-target',
      'hittarget',
      'elements-from-point',
      'elementsfrompoint',
    ])
  ) {
    return [];
  }

  const label = eventLabel(event, 'Hit target');
  return [annotation(event, 'hitTargets', label, rectFromPayload(event), 88)];
}

function layoutShiftAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['layout-shift', 'layoutshift', 'cls'])) {
    return [];
  }

  const score =
    numberFromPayload(event, 'value') ?? numberFromPayload(event, 'score');
  const label =
    score === undefined ? 'Layout shift' : `Layout shift ${score.toFixed(3)}`;

  return layoutShiftRects(event).map((rect, index) => {
    const box = annotation(
      event,
      'layoutShiftViz',
      label,
      zoomFriendlyRect(rect),
      92,
      'rect',
    );
    return {
      ...box,
      id: `${box.id}-${String(index + 1)}`,
      kind: 'measurement',
      lineStyle: 'dashed',
      severity: score !== undefined && score >= 0.1 ? 'medium' : 'low',
    };
  });
}

function specCardAnnotations(
  input: FeatureEmitInput,
): readonly AnnotationBox[] {
  if (input.config.features.specCard !== true) {
    return [];
  }

  const title = metadataString(input.config.metadata, 'specTitle') ?? 'Spec';
  const event = input.events[0];
  const timeRange = eventRange(event, 4_000);
  const width = Math.min(input.viewport.width * 0.45, 360);

  return [
    baseAnnotation({
      feature: 'specCard',
      id: 'spec-card',
      label: title,
      priority: 95,
      target: null,
      timeRange,
      x: 24,
      y: 24,
      width,
    }),
  ];
}

function stepChapters(event: EventRecord): readonly Chapter[] {
  if (!matches(event, ['step', 'chapter'])) {
    return [];
  }

  return [
    {
      id: `chapter-${event.id}`,
      timeRange: eventRange(event, 3_000),
      title: eventLabel(event, 'Step'),
    },
  ];
}

function voiceoverChapters(event: EventRecord): readonly Chapter[] {
  if (!matches(event, ['narration', 'voiceover', 'voice-over'])) {
    return [];
  }

  const payload = objectPayload(event);
  const title =
    stringValue(payload, 'text') ??
    stringValue(payload, 'script') ??
    eventLabel(event, 'Narration');

  return [
    {
      id: `voiceover-chapter-${event.id}`,
      timeRange: eventRange(event, 3_000),
      title,
    },
  ];
}

function narrationSegmentsFrom(
  event: EventRecord,
): readonly NarrationSegment[] {
  if (!matches(event, ['narration', 'voiceover', 'voice-over'])) {
    return [];
  }

  const payload = objectPayload(event);
  const text =
    stringValue(payload, 'text') ??
    stringValue(payload, 'script') ??
    eventLabel(event, 'Narration');

  return [
    {
      id: `narration-${event.id}`,
      text,
      timeRange: eventRange(event, 3_000),
    },
  ];
}

function progressAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['step', 'chapter', 'progress'])) {
    return [];
  }

  return [
    annotation(event, 'progress', eventLabel(event, 'Progress'), null, 40),
  ];
}

function pauseSegments(event: EventRecord): readonly Segment[] {
  if (!matches(event, ['pause'])) {
    return [];
  }

  return [segment(event, 'pause', 1)];
}

function slowmoSegments(event: EventRecord): readonly Segment[] {
  if (!matches(event, ['slowmo'])) {
    return [];
  }

  return [segment(event, 'slowmo', numberFromPayload(event, 'factor') ?? 2)];
}

function speedBadgeAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['slowmo'])) {
    return [];
  }

  const factor = numberFromPayload(event, 'factor') ?? 2;
  return [annotation(event, 'slowmo', `${String(factor)}x slow`, null, 75)];
}

function zoomAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['zoom', 'roi'])) {
    return [];
  }

  return [annotation(event, 'zoom', 'Zoom target', rectFromPayload(event), 85)];
}

function freezeAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['freeze'])) {
    return [];
  }

  return [annotation(event, 'freezeDetect', 'Possible freeze', null, 100)];
}

function vitalsAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['vitals', 'performance'])) {
    return [];
  }

  return [
    annotation(event, 'vitalsHud', eventLabel(event, 'Vitals'), null, 30),
  ];
}

function redactionRectsFrom(event: EventRecord): readonly Rect[] {
  if (!matches(event, ['redaction', 'mask'])) {
    return [];
  }

  const rect = rectFromPayload(event);
  return rect === null ? [] : [rect];
}

function layoutShiftRects(event: EventRecord): readonly Rect[] {
  const payload = objectPayload(event);
  const direct = rectFromPayload(event);
  const nested = [
    rectFromValue(payload.rect),
    rectFromValue(payload.previousRect),
    rectFromValue(payload.currentRect),
    ...rectsFromValue(payload.sources),
  ].filter((rect): rect is Rect => rect !== null);
  const rects = [...(direct === null ? [] : [direct]), ...nested];
  return rects.length > 0 ? rects : [fallbackLayoutShiftRect(event)];
}

function rectsFromValue(value: JsonValue | undefined): readonly Rect[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item: JsonValue) => {
    const rect = rectFromValue(item);
    return rect === null ? [] : [rect];
  });
}

function rectFromValue(value: JsonValue | undefined): Rect | null {
  if (value === undefined || value === null || Array.isArray(value)) {
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const payload = value as PayloadObject;
  const x = numberValue(payload, 'x');
  const y = numberValue(payload, 'y');
  const width = numberValue(payload, 'width');
  const height = numberValue(payload, 'height');

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }

  return { height, width, x, y };
}

function fallbackLayoutShiftRect(event: EventRecord): Rect {
  const x = numberFromPayload(event, 'x') ?? 24;
  const y = numberFromPayload(event, 'y') ?? 24;
  return { height: 48, width: 160, x, y };
}

function zoomFriendlyRect(rect: Rect): Rect {
  const minSize = 24;
  const extraX = Math.max(0, minSize - rect.width) / 2;
  const extraY = Math.max(0, minSize - rect.height) / 2;

  return {
    height: Math.max(minSize, rect.height),
    width: Math.max(minSize, rect.width),
    x: Math.max(0, rect.x - extraX),
    y: Math.max(0, rect.y - extraY),
  };
}

function a11ySeverity(payload: PayloadObject): AnnotationBox['severity'] {
  const impact = stringValue(payload, 'impact')?.toLowerCase();

  if (
    impact === 'critical' ||
    impact === 'high' ||
    impact === 'medium' ||
    impact === 'low'
  ) {
    return impact;
  }

  return 'medium';
}

function annotation(
  event: EventRecord,
  feature: AnnotationBox['feature'],
  label: string,
  target: Rect | null,
  priority: number,
  shape?: AnnotationBox['shape'],
): AnnotationBox {
  return baseAnnotation({
    feature,
    id: `${feature}-${event.id}`,
    label,
    priority,
    shape,
    target,
    timeRange: eventRange(event, 1_800),
    x: target === null ? 24 : target.x,
    y: target === null ? 24 : target.y,
    width: Math.max(120, measureTextWidth({ fontSize: 16, text: label }) + 32),
  });
}

function baseAnnotation(input: {
  readonly feature: AnnotationBox['feature'];
  readonly id: string;
  readonly label: string;
  readonly priority: number;
  readonly target: Rect | null;
  readonly timeRange: TimeRange;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly shape?: AnnotationBox['shape'];
}): AnnotationBox {
  const base = {
    bounds: {
      height: 40,
      width: input.width,
      x: input.x,
      y: input.y,
    },
    collisionPolicy: 'avoid',
    confidence: 1,
    feature: input.feature,
    id: input.id,
    kind: 'info',
    label: input.label,
    placement: 'auto',
    priority: input.priority,
    severity: 'info',
    timeRange: input.timeRange,
  } satisfies AnnotationBox;

  return addOptionalAnnotationFields(base, input.target, input.shape);
}

function addOptionalAnnotationFields(
  base: AnnotationBox,
  target: Rect | null,
  shape: AnnotationBox['shape'] | undefined,
): AnnotationBox {
  const withTarget = target === null ? base : { ...base, target };
  return shape === undefined ? withTarget : { ...withTarget, shape };
}

function segment(
  event: EventRecord,
  kind: Segment['kind'],
  factor: number,
): Segment {
  return {
    factor,
    id: `${kind}-${event.id}`,
    kind,
    timeRange: eventRange(event, 1_000),
  };
}

function eventRange(
  event: EventRecord | undefined,
  fallbackMs: number,
): TimeRange {
  if (event === undefined) {
    return { end: fallbackMs, start: 0 };
  }

  const duration = numberFromPayload(event, 'durationMs') ?? fallbackMs;
  const end = numberFromPayload(event, 'endMs') ?? event.t_mono + duration;
  return { end, start: event.t_mono };
}

function rectFromPayload(event: EventRecord): Rect | null {
  const payload = objectPayload(event);
  const x = numberValue(payload, 'x');
  const y = numberValue(payload, 'y');
  const width = numberValue(payload, 'width');
  const height = numberValue(payload, 'height');

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }

  return { height, width, x, y };
}

function objectPayload(event: EventRecord): PayloadObject {
  if (event.payload === null || Array.isArray(event.payload)) {
    return {};
  }

  if (typeof event.payload !== 'object') {
    return {};
  }

  return event.payload as PayloadObject;
}

function matches(event: EventRecord, needles: readonly string[]): boolean {
  const kind = event.kind.toLowerCase();
  return needles.some((needle) => kind.includes(needle));
}

function eventLabel(event: EventRecord, fallback: string): string {
  const payload = objectPayload(event);
  return (
    stringValue(payload, 'title') ??
    stringValue(payload, 'label') ??
    stringValue(payload, 'message') ??
    fallback
  );
}

function numberFromPayload(
  event: EventRecord,
  key: string,
): number | undefined {
  return numberValue(objectPayload(event), key);
}

function numberValue(payload: PayloadObject, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function stringValue(payload: PayloadObject, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function metadataString(
  payload: Readonly<Record<string, JsonValue>>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
