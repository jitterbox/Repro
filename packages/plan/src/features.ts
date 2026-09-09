import { overlayTheme } from '@repro/contracts';
import { motionMaskEnvelopes } from '@repro/core';
import type { MaskSample } from '@repro/core';

import { measureTextWidth } from './text.js';

import type {
  AnnotationBox,
  BeatDraft,
  Chapter,
  FeatureEmitInput,
  FeatureEmitResult,
  NarrationSegment,
  Rect,
  Segment,
} from './types.js';
import type { AnnotationComponent } from '@repro/contracts';
import type { EventRecord, JsonValue, TimeRange } from '@repro/core';

type PayloadObject = Readonly<Record<string, JsonValue>>;

export function emitFeatureAnnotations(
  input: FeatureEmitInput,
): FeatureEmitResult {
  const annotations: AnnotationBox[] = [];
  const chapters: Chapter[] = [];
  const narrationSegments: NarrationSegment[] = [];
  const segments: Segment[] = [];
  const beatDrafts: BeatDraft[] = [];
  const redactionRects: Rect[] = [];
  const measuredMasks: MaskSample[] = [];
  const flags = input.config.features;
  const stepEvents = input.events.filter((event) => isStepChapterEvent(event));
  const stepTotal = stepEvents.length;

  if (flags.steps === true && stepTotal > 0) {
    for (let index = 0; index < stepEvents.length; index += 1) {
      const event = requireValue(stepEvents[index]);
      const stepIndex = index + 1;
      chapters.push(...stepChapters(event, stepIndex, stepTotal));
      annotations.push(...stepBadgeAnnotations(event, stepIndex, stepTotal));
    }
    annotations.push(...progressRailAnnotation(stepEvents, input.viewport));
  }

  const cursorMoves: EventRecord[] = [];

  for (const event of input.events) {
    if (flags.cursor === true && isCursorMoveEvent(event)) {
      cursorMoves.push(event);
    }

    if (flags.clickViz === true) {
      annotations.push(...clickAnnotations(event));
    }

    if (flags.keystrokes === true) {
      annotations.push(...keystrokeAnnotations(event));
    }

    if (flags.consoleOverlay === true) {
      annotations.push(...consoleAnnotations(event, input.events));
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

    if (flags.stackingContexts === true) {
      annotations.push(...stackingAnnotations(event));
    }

    if (flags.voiceover === true) {
      chapters.push(...voiceoverChapters(event));
      narrationSegments.push(...narrationSegmentsFrom(event));
    }

    if (flags.pauses === true) {
      segments.push(...pauseSegments(event));
      beatDrafts.push(...pauseBeatDrafts(event));
      annotations.push(...pauseBadgeAnnotations(event));
    }

    if (flags.slowmo === true) {
      segments.push(...slowmoSegments(event));
      beatDrafts.push(...slowmoBeatDrafts(event));
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
      const selector = objectPayload(event).selector;
      measuredMasks.push(
        ...redactionRectsFrom(event).map((rect) => ({
          ...rect,
          group: `${event.pageId}/${typeof selector === 'string' ? selector : event.id}`,
        })),
      );
    }
  }

  redactionRects.push(...motionMaskEnvelopes(measuredMasks));
  if (flags.cursor === true) {
    annotations.push(...aggregateCursorPath(cursorMoves));
  }

  // Slate is a timeline beat + compositor PNG; do not emit a second slate card.
  annotations.push(...annotationHintsFromConfig(input));
  annotations.push(...outcomePairAnnotations(input));

  if (flags.redaction === true && redactionRects.length === 0) {
    redactionRects.push(...redactionRectsFromMasks(input));
  }

  return {
    annotations,
    beatDrafts,
    chapters,
    narrationSegments,
    redactionRects,
    segments,
  };
}

function isCursorMoveEvent(event: EventRecord): boolean {
  return (
    isPointerPhase(event, ['pointermove', 'mousemove']) ||
    matches(event, ['cursor'])
  );
}

/** Aggregate pointer moves into one cursor-path cue (no per-move plates). */
function aggregateCursorPath(
  moves: readonly EventRecord[],
): readonly AnnotationBox[] {
  if (moves.length === 0) {
    return [];
  }
  const first = requireValue(moves[0]);
  const last = requireValue(moves[moves.length - 1]);
  const points = moves.flatMap((event) => {
    const point = pointFromPayload(event);
    return point === null ? [] : [point];
  });
  const target =
    rectFromPayload(last) ??
    pointRectFromPayload(last) ??
    (points[0] === undefined
      ? null
      : {
          x: points[0].x - 8,
          y: points[0].y - 8,
          width: 16,
          height: 16,
        });
  const start = first.t_mono;
  const end = Math.max(last.t_mono + 400, start + 400);
  return [
    baseAnnotation({
      feature: 'cursor',
      id: `cursor-path-${first.id}`,
      label: 'Cursor path',
      priority: 10,
      target,
      timeRange: { start, end },
      x: target?.x ?? overlayTheme.safeZones.inset,
      y: target?.y ?? overlayTheme.safeZones.inset,
      width: 120,
      height: 28,
      component: 'cursor-path',
      renderer: 'ass',
      severity: 'info',
      kicker: 'PATH',
      plateLabel: `${String(points.length)} samples`,
    }),
  ];
}

function clickAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (
    !isPointerPhase(event, ['pointerdown', 'mousedown']) &&
    !matches(event, ['click'])
  ) {
    return [];
  }

  const payload = objectPayload(event);
  const button = numberValue(payload, 'button') ?? 0;
  const isRight = button === 2;
  const target = rectFromPayload(event) ?? pointRectFromPayload(event);
  const label = isRight ? 'Right click' : 'Click';
  return [
    annotation(event, 'clickViz', label, target, 90, 'ellipse', {
      component: 'click-ripple',
      renderer: 'ass',
      severity: 'info',
      holdMs: overlayTheme.motion.clickRipple.ms,
    }),
  ];
}

function keystrokeAnnotations(event: EventRecord): readonly AnnotationBox[] {
  const kind = event.kind.toLowerCase();
  if (
    !kind.includes('input:key') &&
    !kind.includes('keystroke') &&
    !kind.endsWith(':key') &&
    !(kind.includes('keydown') || kind.includes('keyup'))
  ) {
    return [];
  }

  const payload = objectPayload(event);
  const value = stringValue(payload, 'key') ?? stringValue(payload, 'value');
  const label = value === undefined ? 'Keystroke' : `Typed ${value}`;
  return [annotation(event, 'keystrokes', label, rectFromPayload(event), 80)];
}

function consoleAnnotations(
  event: EventRecord,
  allEvents: readonly EventRecord[],
): readonly AnnotationBox[] {
  // CDP exception events are a legal ReproEvent type and must not be dropped.
  if (!matches(event, ['console', 'exception', 'pageerror', 'error'])) {
    return [];
  }

  const payload = objectPayload(event);
  const level =
    stringValue(payload, 'level') ??
    (matches(event, ['exception', 'pageerror', 'error']) ? 'error' : 'log');
  const text =
    stringValue(payload, 'message') ??
    stringValue(payload, 'text') ??
    'Console event';
  const label = `${level}: ${text}`;
  const target =
    rectFromPayload(event) ?? nearestPointerTarget(event, allEvents);
  const severity: AnnotationBox['severity'] =
    level === 'error' || level === 'assert' ? 'critical' : 'medium';
  const holdMs = Math.max(
    overlayTheme.holdsMs.consoleToast.min,
    overlayTheme.holdsMs.consoleToast.typical,
  );
  const toast = annotation(
    event,
    'consoleOverlay',
    label,
    target,
    70,
    undefined,
    {
      component: 'console-toast',
      renderer: 'compositor',
      severity,
      holdMs,
      kicker: level.toUpperCase(),
    },
  );

  if (target === null) {
    return [toast];
  }

  return [
    toast,
    annotation(event, 'consoleOverlay', 'Trigger', target, 50, 'rect', {
      component: 'target-ring',
      renderer: 'ass',
      severity,
      holdMs,
      lineStyle: 'solid',
    }),
  ];
}

function nearestPointerTarget(
  event: EventRecord,
  allEvents: readonly EventRecord[],
): Rect | null {
  let best: EventRecord | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of allEvents) {
    if (
      !isPointerPhase(candidate, ['pointerdown', 'mousedown', 'click']) &&
      !matches(candidate, ['click'])
    ) {
      continue;
    }
    const delta = Math.abs(candidate.t_mono - event.t_mono);
    if (delta < bestDelta && delta < 2_000) {
      best = candidate;
      bestDelta = delta;
    }
  }
  if (best === undefined) {
    return null;
  }
  return rectFromPayload(best) ?? pointRectFromPayload(best);
}

function stackingAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (
    !matches(event, ['stacking', 'z-index', 'zindex', 'editorial.stacking'])
  ) {
    return [];
  }

  const payload = objectPayload(event);
  const z = numberValue(payload, 'zIndex') ?? numberValue(payload, 'z');
  const label =
    z === undefined
      ? eventLabel(event, 'Stacking context')
      : `z-index ${String(z)}`;
  return [
    annotation(
      event,
      'stackingContexts',
      label,
      rectFromPayload(event),
      72,
      'rect',
      {
        component: 'stacking-labels',
        renderer: 'ass',
        severity: 'medium',
        kicker: 'STACK',
        ...(z === undefined ? {} : { measurement: `z=${String(z)}` }),
      },
    ),
  ];
}

function outcomePairAnnotations(
  input: FeatureEmitInput,
): readonly AnnotationBox[] {
  if (input.config.mode !== 'repro' && input.config.mode !== 'compare') {
    return [];
  }

  const expected =
    metadataString(input.config.metadata, 'expected') ??
    metadataString(input.config.metadata, 'System.Title') ??
    'Expected behavior';
  const actual =
    metadataString(input.config.metadata, 'actual') ??
    metadataString(input.config.metadata, 'observed') ??
    'Observed failure';
  const last = input.events[input.events.length - 1];
  const start = last?.t_mono ?? captureEnd(input);
  const holdMs = overlayTheme.holdsMs.outcome.typical;
  return [
    baseAnnotation({
      feature: 'outcome',
      id: 'outcome-pair',
      label: actual,
      priority: 98,
      target: null,
      timeRange: { start, end: start + holdMs },
      x: 24,
      y: input.viewport.height - overlayTheme.safeZones.bottomBand - 80,
      width: Math.min(420, input.viewport.width - 48),
      component: 'outcome-pair',
      renderer: 'compositor',
      severity: 'critical',
      kicker: 'OUTCOME',
      plateLabel: actual,
      measurement: expected,
    }),
  ];
}

function captureEnd(input: FeatureEmitInput): number {
  return Math.max(0, ...input.events.map((event) => event.t_mono), 1);
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
  if (
    !matches(event, [
      'aria-hidden',
      'hidden',
      'editorial.hidden',
      'hidden-element',
    ])
  ) {
    return [];
  }

  const label = eventLabel(event, 'Hidden element');
  return [
    annotation(
      event,
      'hiddenElements',
      label,
      rectFromPayload(event),
      65,
      'rect',
      {
        component: 'hidden-ghost',
        renderer: 'ass',
        severity: 'medium',
        lineStyle: 'dashed',
        kicker: 'HIDDEN',
      },
    ),
  ];
}

function hitTargetAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (
    !matches(event, [
      'hit-target',
      'hittarget',
      'elements-from-point',
      'elementsfrompoint',
      'editorial.hit-target',
    ])
  ) {
    return [];
  }

  const label = eventLabel(event, 'Hit target');
  const actual = rectFromPayload(event);
  const width = actual?.width ?? 8;
  const height = actual?.height ?? 8;
  return [
    annotation(event, 'hitTargets', label, actual, 88, 'rect', {
      component: 'hit-target-guide',
      renderer: 'ass',
      severity: 'critical',
      lineStyle: 'dashed',
      kicker: 'HIT',
      measurement: `${String(Math.round(width))}×${String(Math.round(height))} < 24×24`,
    }),
  ];
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
      {
        component: 'layout-shift-pair',
        renderer: 'ass',
        kind: 'measurement',
        lineStyle: 'dashed',
        severity: score !== undefined && score >= 0.1 ? 'medium' : 'low',
        kicker: 'CLS',
        ...(score === undefined
          ? {}
          : { measurement: `score ${score.toFixed(3)}` }),
      },
    );
    return { ...box, id: `${box.id}-${String(index + 1)}` };
  });
}

function annotationHintsFromConfig(
  input: FeatureEmitInput,
): readonly AnnotationBox[] {
  const hints = input.config.metadata.annotationHints;
  if (!Array.isArray(hints) || hints.length === 0) {
    return [];
  }

  const boxes: AnnotationBox[] = [];
  for (const [index, raw] of hints.entries()) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const hint = raw as PayloadObject;
    const label = stringValue(hint, 'label') ?? 'Highlight';
    const shapeRaw = stringValue(hint, 'shape');
    const shape =
      shapeRaw === 'ellipse' || shapeRaw === 'underline' || shapeRaw === 'rect'
        ? shapeRaw
        : 'rect';
    const x = numberValue(hint, 'x');
    const y = numberValue(hint, 'y');
    const width = numberValue(hint, 'width') ?? numberValue(hint, 'w');
    const height = numberValue(hint, 'height') ?? numberValue(hint, 'h');
    if (
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined
    ) {
      continue;
    }
    const target = { x, y, width, height };
    const holdMs = overlayTheme.holdsMs.callout.typical;
    const timeRange = {
      start: Math.max(0, input.events[0]?.t_mono ?? 0),
      end: Math.max(holdMs, (input.events[0]?.t_mono ?? 0) + holdMs),
    };
    boxes.push(
      baseAnnotation({
        feature: 'steps',
        id: `hint-plate-${String(index)}`,
        label,
        priority: 88,
        target,
        timeRange,
        x: target.x + target.width + 12,
        y: Math.max(24, target.y - 8),
        width: Math.min(
          280,
          measureTextWidth({
            fontSize: overlayTheme.type.calloutLabel.size,
            text: label,
          }) + 32,
        ),
        component: 'plate',
        renderer: 'ass',
        severity: 'info',
        shape,
        lineStyle: 'solid',
        kicker: 'DELTA',
        plateLabel: label,
      }),
    );
  }
  return boxes;
}

function isStepChapterEvent(event: EventRecord): boolean {
  return event.kind === 'step.chapter' || matches(event, ['step.chapter']);
}

function stepChapters(
  event: EventRecord,
  stepIndex: number,
  stepTotal: number,
): readonly Chapter[] {
  const title = eventLabel(event, 'Step');
  return [
    {
      id: `chapter-${event.id}`,
      timeRange: eventRange(event, overlayTheme.holdsMs.chapter.typical),
      title: `${String(stepIndex)}/${String(stepTotal)} ${title}`,
    },
  ];
}

function stepBadgeAnnotations(
  event: EventRecord,
  stepIndex: number,
  stepTotal: number,
): readonly AnnotationBox[] {
  const label = `STEP ${String(stepIndex)} / ${String(stepTotal)}`;
  const holdMs = overlayTheme.holdsMs.chapter.typical;
  return [
    annotation(event, 'steps', label, null, 40, undefined, {
      component: 'step-badge',
      renderer: 'ass',
      severity: 'info',
      holdMs,
      kicker: 'STEP',
      plateLabel: label,
    }),
  ];
}

function progressRailAnnotation(
  stepEvents: readonly EventRecord[],
  viewport: { readonly width: number; readonly height: number },
): readonly AnnotationBox[] {
  const first = stepEvents[0];
  const last = stepEvents[stepEvents.length - 1];
  if (first === undefined || last === undefined) {
    return [];
  }
  const start = first.t_mono;
  const end = Math.max(
    last.t_mono + overlayTheme.holdsMs.chapter.typical,
    start + 1,
  );
  return [
    baseAnnotation({
      feature: 'progress',
      id: 'progress-rail',
      label: 'Progress',
      priority: 5,
      target: null,
      timeRange: { start, end },
      x: 0,
      y: viewport.height - 4,
      width: viewport.width,
      component: 'progress-rail',
      renderer: 'ass',
      severity: 'info',
    }),
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

function pauseSegments(event: EventRecord): readonly Segment[] {
  if (!matches(event, ['pause', 'editorial.pause'])) {
    return [];
  }

  return [segment(event, 'pause', 1)];
}

function pauseBeatDrafts(event: EventRecord): readonly BeatDraft[] {
  if (!matches(event, ['pause', 'editorial.pause'])) {
    return [];
  }

  const range = eventRange(event, 1_000);
  return [
    {
      id: `pause-${event.id}`,
      kind: 'hold',
      captureAtMs: range.start,
      minOutDurationMs: Math.max(1_000, range.end - range.start),
      badge: 'PAUSED',
    },
  ];
}

function slowmoSegments(event: EventRecord): readonly Segment[] {
  if (!matches(event, ['slowmo', 'editorial.slowmo'])) {
    return [];
  }

  return [segment(event, 'slowmo', numberFromPayload(event, 'factor') ?? 4)];
}

function slowmoBeatDrafts(event: EventRecord): readonly BeatDraft[] {
  if (!matches(event, ['slowmo', 'editorial.slowmo'])) {
    return [];
  }

  const range = eventRange(event, 1_000);
  const factor = numberFromPayload(event, 'factor') ?? 2;
  return [
    {
      id: `slowmo-${event.id}`,
      kind: 'slowmo',
      captureStartMs: range.start,
      captureEndMs: range.end,
      rate: 1 / Math.max(1, factor),
      badge: 'SLOWMO',
    },
  ];
}

function pauseBadgeAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['pause', 'editorial.pause'])) {
    return [];
  }
  const holdMs = Math.max(
    1_000,
    numberFromPayload(event, 'holdMs') ?? overlayTheme.holdsMs.pause.typical,
  );
  return [
    annotation(
      event,
      'pauses',
      `PAUSED ${String(holdMs)}ms`,
      null,
      76,
      undefined,
      {
        component: 'pause-badge',
        renderer: 'ass',
        severity: 'info',
        holdMs,
        kicker: 'PAUSE',
        plateLabel: `PAUSED ${String(holdMs)}ms`,
      },
    ),
  ];
}

function speedBadgeAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['slowmo', 'editorial.slowmo'])) {
    return [];
  }

  const factor = numberFromPayload(event, 'factor') ?? 4;
  const rate = 1 / Math.max(1, factor);
  const label = `${rate.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '')}×`;
  return [
    annotation(event, 'slowmo', label, null, 75, undefined, {
      component: 'speed-chip',
      renderer: 'ass',
      severity: 'info',
      holdMs: overlayTheme.holdsMs.slowmo.typical,
      kicker: 'SPEED',
      plateLabel: label,
    }),
  ];
}

function zoomAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['zoom', 'roi', 'editorial.zoom'])) {
    return [];
  }

  return [
    annotation(
      event,
      'zoom',
      'Zoom target',
      rectFromPayload(event),
      85,
      undefined,
      {
        component: 'roi-magnifier',
        renderer: 'compositor',
        severity: 'info',
        kicker: 'ROI',
        measurement: '2.5×',
      },
    ),
  ];
}

function freezeAnnotations(event: EventRecord): readonly AnnotationBox[] {
  if (!matches(event, ['freeze', 'editorial.freeze'])) {
    return [];
  }

  const blockMs =
    numberFromPayload(event, 'durationMs') ??
    numberFromPayload(event, 'blockedMs') ??
    1_200;
  return [
    annotation(
      event,
      'freezeDetect',
      `UI freeze ${String(blockMs)}ms`,
      null,
      100,
      undefined,
      {
        component: 'freeze-banner',
        renderer: 'ass',
        severity: 'medium',
        kicker: 'FREEZE',
        plateLabel: `UI freeze ${String(blockMs)}ms`,
      },
    ),
  ];
}

function vitalsAnnotations(event: EventRecord): readonly AnnotationBox[] {
  // Probe emits probe.vital:CLS / LCP / INP (singular).
  if (
    !matches(event, ['vital', 'vitals', 'performance']) &&
    !event.kind.toLowerCase().includes('probe.vital')
  ) {
    return [];
  }

  return [
    annotation(
      event,
      'vitalsHud',
      eventLabel(event, 'Vitals'),
      null,
      30,
      undefined,
      {
        component: 'vitals-hud',
        renderer: 'compositor',
        severity: 'info',
        kicker: 'VITALS',
      },
    ),
  ];
}

function redactionRectsFrom(event: EventRecord): readonly Rect[] {
  if (!matches(event, ['redaction', 'mask'])) {
    return [];
  }

  const rect = rectFromPayload(event);
  return rect === null ? [] : [rect];
}

/** Derive mask boxes from interactions on config.redaction.masks selectors. */
function redactionRectsFromMasks(input: FeatureEmitInput): readonly Rect[] {
  const masks = input.config.redaction?.masks ?? [];
  if (masks.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const rects: Rect[] = [];
  for (const event of input.events) {
    const payload = objectPayload(event);
    if (!payloadHitsMask(payload, masks)) {
      continue;
    }
    const x = numberPayload(payload, 'x');
    const y = numberPayload(payload, 'y');
    if (x === undefined || y === undefined) {
      continue;
    }
    const key = `${String(Math.round(x))}:${String(Math.round(y))}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rects.push({
      height: 32,
      width: 240,
      x: Math.max(0, x - 40),
      y: Math.max(0, y - 16),
    });
  }
  return rects;
}

function payloadHitsMask(
  payload: PayloadObject,
  masks: readonly string[],
): boolean {
  const selector = typeof payload.selector === 'string' ? payload.selector : '';
  const path = Array.isArray(payload.path) ? payload.path.map(String) : [];
  return masks.some((mask) => {
    if (selector.includes(mask)) {
      return true;
    }
    return path.some((entry) => entry.includes(mask));
  });
}

function numberPayload(
  payload: PayloadObject,
  key: string,
): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
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

interface AnnotationOptions {
  readonly component?: AnnotationComponent;
  readonly renderer?: 'ass' | 'compositor';
  readonly severity?: AnnotationBox['severity'];
  readonly holdMs?: number;
  readonly kicker?: string;
  readonly plateLabel?: string;
  readonly measurement?: string;
  readonly lineStyle?: AnnotationBox['lineStyle'];
  readonly kind?: AnnotationBox['kind'];
}

function annotation(
  event: EventRecord,
  feature: AnnotationBox['feature'],
  label: string,
  target: Rect | null,
  priority: number,
  shape?: AnnotationBox['shape'],
  options: AnnotationOptions = {},
): AnnotationBox {
  const holdMs =
    options.holdMs ??
    Math.max(
      overlayTheme.holdsMs.callout.min,
      label.length * overlayTheme.holdsMs.callout.perChar,
    );
  const fontSize = overlayTheme.type.calloutLabel.size;
  const width = Math.max(120, measureTextWidth({ fontSize, text: label }) + 32);
  const height = options.measurement === undefined ? 44 : 62;

  return baseAnnotation({
    feature,
    id: `${feature}-${event.id}`,
    label,
    priority,
    shape,
    target,
    timeRange: eventRange(event, holdMs),
    x: target === null ? overlayTheme.safeZones.inset : target.x,
    y:
      target === null
        ? overlayTheme.safeZones.inset
        : Math.max(0, target.y - height - 8),
    width,
    height,
    ...options,
    plateLabel: options.plateLabel ?? label,
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
  readonly height?: number;
  readonly x: number;
  readonly y: number;
  readonly shape?: AnnotationBox['shape'];
  readonly component?: AnnotationComponent;
  readonly renderer?: 'ass' | 'compositor';
  readonly severity?: AnnotationBox['severity'];
  readonly kicker?: string;
  readonly plateLabel?: string;
  readonly measurement?: string;
  readonly lineStyle?: AnnotationBox['lineStyle'];
  readonly kind?: AnnotationBox['kind'];
}): AnnotationBox {
  const component = input.component ?? defaultComponent(input.feature);
  const severity = input.severity ?? 'info';
  const height = input.height ?? 44;
  const base: AnnotationBox = {
    bounds: {
      height,
      width: input.width,
      x: input.x,
      y: input.y,
    },
    collisionPolicy: 'avoid',
    component,
    confidence: 1,
    feature: input.feature,
    id: input.id,
    kind: input.kind ?? 'info',
    label: input.label,
    placement: 'auto',
    plate: {
      ...(input.kicker === undefined ? {} : { kicker: input.kicker }),
      label: input.plateLabel ?? input.label,
      ...(input.measurement === undefined
        ? {}
        : { measurement: input.measurement }),
      maxChars: overlayTheme.type.calloutLabel.maxChars,
    },
    priority: input.priority,
    renderer: input.renderer ?? defaultRenderer(component),
    severity,
    timeRange: input.timeRange,
    ...(input.lineStyle === undefined ? {} : { lineStyle: input.lineStyle }),
    ...(input.shape === undefined ? {} : { shape: input.shape }),
    ...(input.target === null
      ? {}
      : {
          target: input.target,
          anchor: {
            bbox: {
              x: input.target.x,
              y: input.target.y,
              w: input.target.width,
              h: input.target.height,
            },
            pad: 6,
            track: 'static' as const,
          },
        }),
  };

  return base;
}

function defaultComponent(
  feature: AnnotationBox['feature'],
): AnnotationComponent {
  switch (feature) {
    case 'clickViz':
      return 'click-ripple';
    case 'cursor':
      return 'cursor-path';
    case 'keystrokes':
      return 'keystroke-pill';
    case 'consoleOverlay':
      return 'console-toast';
    case 'steps':
    case 'progress':
      return 'step-badge';
    case 'pauses':
      return 'pause-badge';
    case 'slowmo':
      return 'speed-chip';
    case 'freezeDetect':
      return 'freeze-banner';
    case 'zoom':
      return 'roi-magnifier';
    case 'vitalsHud':
      return 'vitals-hud';
    case 'hiddenElements':
      return 'hidden-ghost';
    case 'hitTargets':
      return 'hit-target-guide';
    case 'layoutShiftViz':
      return 'layout-shift-pair';
    case 'stackingContexts':
      return 'stacking-labels';
    case 'specCard':
      return 'slate';
    case 'outcome':
      return 'outcome-pair';
    case 'redaction':
      return 'redaction';
    default:
      return 'plate';
  }
}

function defaultRenderer(component: AnnotationComponent): 'ass' | 'compositor' {
  switch (component) {
    case 'slate':
    case 'console-toast':
    case 'roi-magnifier':
    case 'vitals-hud':
    case 'outcome-pair':
      return 'compositor';
    default:
      return 'ass';
  }
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
  const nested = asObject(payload.bbox) ?? asObject(payload.rect);
  const source = nested ?? payload;
  const x = numberValue(source, 'x');
  const y = numberValue(source, 'y');
  const width = numberValue(source, 'width') ?? numberValue(source, 'w');
  const height = numberValue(source, 'height') ?? numberValue(source, 'h');

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

/** Pointer events often carry only a point — invent a small ring target. */
function pointRectFromPayload(event: EventRecord): Rect | null {
  const point = pointFromPayload(event);
  if (point === null) {
    return null;
  }
  const size = 36;
  return {
    height: size,
    width: size,
    x: Math.max(0, point.x - size / 2),
    y: Math.max(0, point.y - size / 2),
  };
}

function pointFromPayload(
  event: EventRecord,
): { readonly x: number; readonly y: number } | null {
  const payload = objectPayload(event);
  const x = numberValue(payload, 'x');
  const y = numberValue(payload, 'y');
  if (x === undefined || y === undefined) {
    return null;
  }
  return { x, y };
}

function isPointerPhase(
  event: EventRecord,
  phases: readonly string[],
): boolean {
  const kind = event.kind.toLowerCase();
  if (!kind.includes('pointer') && !kind.includes('mouse')) {
    return false;
  }
  const phase = stringValue(objectPayload(event), 'phase')?.toLowerCase();
  if (phase === undefined) {
    return phases.some((needle) => kind.includes(needle));
  }
  return phases.some((needle) => phase.includes(needle));
}

function asObject(value: JsonValue | undefined): PayloadObject | null {
  if (value === null || value === undefined || Array.isArray(value)) {
    return null;
  }
  if (typeof value !== 'object') {
    return null;
  }
  return value as PayloadObject;
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

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
