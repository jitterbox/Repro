import { fitOverlayText } from './text-fit.js';
import {
  assStyleTable,
  burnInFont,
  getOverlayTheme,
  ringStyleForSeverity,
} from './theme.js';

import type { Severity } from './theme.js';
import type { AnnotationBox, Chapter, Rect, ReproPlan } from '@repro/plan';

export interface GenerateAssInput {
  readonly plan: ReproPlan;
  readonly title?: string;
  readonly staticFrame?: boolean;
}

export function generateAss(input: GenerateAssInput): string {
  const theme = getOverlayTheme();
  const events = [
    ...input.plan.annotations.flatMap((annotation) =>
      annotationEvents(annotation, theme),
    ),
    ...input.plan.chapters
      .filter(
        (chapter) =>
          !input.plan.annotations.some(
            (a) =>
              a.component === 'step-badge' &&
              a.id === `steps-${chapter.id.replace(/^chapter-/, '')}`,
          ),
      )
      .map((chapter) =>
        chapterEvent(
          chapter,
          input.plan.viewport.width,
          input.plan.viewport.height,
        ),
      ),
  ];

  return [
    '[Script Info]',
    `Title: ${input.title ?? 'Repro Overlay'}`,
    'ScriptType: v4.00+',
    `PlayResX: ${String(input.plan.viewport.width)}`,
    `PlayResY: ${String(input.plan.viewport.height)}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    styleFormat(),
    ...assStyleTable(),
    '',
    '[Events]',
    eventFormat(),
    ...events.map((event) =>
      input.staticFrame ? event.replace(/\\fad\(\d+,\d+\)/g, '') : event,
    ),
    '',
  ].join('\n');
}

/** Persistent metadata chrome: measured wrapped lines, no truncation or fade. */
function versionPlateEvents(annotation: AnnotationBox): readonly string[] {
  const { x, y, width, height } = annotation.bounds;
  const range = outputRange(annotation);
  return [
    dialogue(
      8,
      range,
      'Panel',
      `{\\pos(${x},${y})\\p1}${rectPath({ x: 0, y: 0, width, height })}`,
    ),
    dialogue(
      9,
      range,
      'Kicker',
      `{\\pos(${x + 12},${y + 8})}APP VERSION / BUILD`,
    ),
    ...annotation.label
      .split('\n')
      .map((line, index) =>
        dialogue(
          9,
          range,
          'Plate',
          `{\\pos(${x + 12},${y + 28 + index * 24})\\fs18}${escapeAss(line)}`,
        ),
      ),
  ];
}

function annotationEvents(
  annotation: AnnotationBox,
  theme: ReturnType<typeof getOverlayTheme>,
): readonly string[] {
  if (annotation.id === 'app-version') return versionPlateEvents(annotation);
  const component = annotation.component ?? inferComponent(annotation);
  if (annotation.renderer === 'compositor') {
    return [];
  }

  switch (component) {
    case 'target-ring':
      return ringEvents(annotation);
    case 'leader':
      return leaderLineEvents(annotation);
    case 'plate':
    case 'callout':
      return plateEvents(annotation, theme);
    case 'step-badge':
    case 'pause-badge':
    case 'speed-chip':
    case 'freeze-banner':
      return badgeEvents(annotation, theme);
    case 'click-ripple':
      return clickRippleEvents(annotation);
    case 'cursor-path':
      return annotation.cursorSegment
        ? [
            dialogue(
              5,
              outputRange(annotation),
              'Leader',
              `{\\pos(0,0)${fadeTags(theme)}\\p1}m ${annotation.cursorSegment.from.x} ${annotation.cursorSegment.from.y} l ${annotation.cursorSegment.to.x} ${annotation.cursorSegment.to.y}`,
            ),
          ]
        : [];
    case 'keystroke-pill':
      return badgeEvents(annotation, theme);
    case 'layout-shift-pair':
    case 'hit-target-guide':
    case 'hidden-ghost':
    case 'stacking-labels':
      return plateEvents(annotation, theme);
    case 'progress-rail':
      return [];
    case 'chapter':
      return [];
    default:
      return shapeAndLabelEvents(annotation, theme);
  }
}

function plateEvents(
  annotation: AnnotationBox,
  theme: ReturnType<typeof getOverlayTheme>,
): readonly string[] {
  const range = outputRange(annotation);
  const fade = fadeTags(theme);
  const severity = annotation.severity as Severity;
  const barColor = ringStyleForSeverity(severity);
  const x = Math.round(annotation.bounds.x);
  const y = Math.round(annotation.bounds.y);
  const w = Math.round(annotation.bounds.width);
  const h = Math.round(annotation.bounds.height);
  const platePath = rectPath({ height: h, width: w, x: 0, y: 0 });
  const barPath = rectPath({ height: h, width: 4, x: 0, y: 0 });
  const kicker = annotation.plate?.kicker;
  const label = annotation.plate?.label ?? annotation.label;
  const measurement = annotation.plate?.measurement;
  const maxChars =
    annotation.plate?.maxChars ?? theme.type.calloutLabel.maxChars;
  const clipped = fitOverlayText(
    label,
    Math.max(0, w - 24),
    theme.type.calloutLabel.size,
    maxChars,
  );

  const events = [
    dialogue(
      1,
      range,
      'Panel',
      `{\\pos(${String(x)},${String(y)})${fade}\\p1}${platePath}`,
    ),
    dialogue(
      2,
      range,
      barColor,
      `{\\pos(${String(x)},${String(y)})${fade}\\p1}${barPath}`,
    ),
  ];

  let textY = y + 8;
  if (kicker !== undefined && kicker.length > 0) {
    events.push(
      dialogue(
        3,
        range,
        'Kicker',
        `{\\pos(${String(x + 12)},${String(textY)})${fade}}` +
          escapeAss(
            fitOverlayText(
              kicker.toUpperCase(),
              w - 24,
              theme.type.calloutKicker.size,
            ),
          ),
      ),
    );
    textY += 14;
  }

  events.push(
    dialogue(
      3,
      range,
      'Plate',
      `{\\pos(${String(x + 12)},${String(textY)})${fade}}` + escapeAss(clipped),
    ),
  );

  if (measurement !== undefined && measurement.length > 0) {
    events.push(
      dialogue(
        3,
        range,
        'Meta',
        `{\\pos(${String(x + 12)},${String(textY + 18)})${fade}}` +
          escapeAss(
            fitOverlayText(measurement, w - 24, theme.type.slateMeta.size),
          ),
      ),
    );
  }

  if (annotation.leaderLine !== undefined) {
    events.push(...leaderLineEvents(annotation));
  }

  if (annotation.anchor?.bbox !== undefined) {
    events.push(...ringEvents(annotation));
  }

  return events;
}

function ringEvents(annotation: AnnotationBox): readonly string[] {
  const bbox = annotation.anchor?.bbox;
  const target = bboxToRect(bbox) ?? targetRect(annotation);
  if (target === null) {
    return [];
  }

  const pad = annotation.anchor?.pad ?? 6;
  const ring = expand(target, pad);
  const style = ringStyleForSeverity(annotation.severity);
  const path = strokedRectPath(ring, annotation.lineStyle ?? 'solid');
  const fade = fadeTags(getOverlayTheme());
  return [
    dialogue(
      0,
      outputRange(annotation),
      style,
      `{\\pos(0,0)${fade}\\p1}${path}`,
    ),
  ];
}

function badgeEvents(
  annotation: AnnotationBox,
  theme: ReturnType<typeof getOverlayTheme>,
): readonly string[] {
  const fade = fadeTags(theme);
  const x = Math.round(annotation.bounds.x);
  const y = Math.round(annotation.bounds.y);
  const label = fitOverlayText(
    annotation.plate?.label ?? annotation.label,
    annotation.bounds.width - 16,
    annotation.fontSize ?? theme.type.badge.size,
  );
  if (annotation.id === 'app-version') return versionPlateEvents(annotation);
  const component = annotation.component ?? inferComponent(annotation);
  const style = component === 'speed-chip' ? 'Meta' : 'Badge';
  return [
    dialogue(
      3,
      outputRange(annotation),
      'Panel',
      `{\\pos(${x},${y})${fade}\\p1}${rectPath({ x: 0, y: 0, width: annotation.bounds.width, height: annotation.bounds.height })}`,
    ),
    dialogue(
      4,
      outputRange(annotation),
      style,
      `{\\pos(${String(x + 8)},${String(y + 4)})${annotation.fontSize ? `\\fs${annotation.fontSize}` : ''}${fade}}${escapeAss(label)}`,
    ),
  ];
}

function clickRippleEvents(annotation: AnnotationBox): readonly string[] {
  const target = targetRect(annotation);
  if (target === null) {
    return [];
  }

  const cx = Math.round(target.x + target.width / 2);
  const cy = Math.round(target.y + target.height / 2);
  const isRight =
    annotation.label.toLowerCase().includes('right') ||
    (annotation.feature === 'clickViz' && annotation.id.includes('right'));
  const style = isRight ? 'ClickRight' : 'ClickLeft';
  const theme = getOverlayTheme();
  const ms = theme.motion.clickRipple.ms;
  const fade = `\\fad(${String(ms / 2)},${String(ms / 2)})`;
  const r = 18;
  const path = ellipsePath(r, r);
  return [
    dialogue(
      5,
      outputRange(annotation),
      style,
      `{\\pos(${String(cx)},${String(cy)})${fade}\\p1}${path}`,
    ),
  ];
}

function shapeAndLabelEvents(
  annotation: AnnotationBox,
  theme: ReturnType<typeof getOverlayTheme>,
): readonly string[] {
  const fade = fadeTags(theme);
  const range = outputRange(annotation);
  const events: string[] = [];
  const target = targetRect(annotation);

  if (target !== null) {
    const style = ringStyleForSeverity(annotation.severity);
    const path =
      annotation.shape === 'ellipse'
        ? ellipsePath(target.width / 2, target.height / 2)
        : strokedRectPath(target, annotation.lineStyle ?? 'solid');
    const pos =
      annotation.shape === 'ellipse'
        ? `\\pos(${String(Math.round(target.x + target.width / 2))},` +
          `${String(Math.round(target.y + target.height / 2))})`
        : '\\pos(0,0)';
    events.push(dialogue(1, range, style, `{${pos}${fade}\\p1}${path}`));
  }

  const x = Math.round(annotation.bounds.x + 12);
  const y = Math.round(annotation.bounds.y + 10);
  events.push(
    dialogue(
      2,
      range,
      'Plate',
      `{\\pos(${String(x)},${String(y)})${fade}}${escapeAss(fitOverlayText(annotation.label, annotation.bounds.width - 24, theme.type.calloutLabel.size))}`,
    ),
  );

  if (annotation.leaderLine !== undefined) {
    events.push(...leaderLineEvents(annotation));
  }

  return events;
}

function leaderLineEvents(annotation: AnnotationBox): readonly string[] {
  if (annotation.leaderLine === undefined) {
    return [];
  }

  const from = annotation.leaderLine.from;
  const to = annotation.leaderLine.to;
  const fx = Math.round(from.x);
  const fy = Math.round(from.y);
  const tx = Math.round(to.x);
  const ty = Math.round(to.y);
  const dx = tx - fx;
  const dy = ty - fy;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const head = 10;
  const ax = tx - ux * head + -uy * (head * 0.45);
  const ay = ty - uy * head + ux * (head * 0.45);
  const bx = tx - ux * head + uy * (head * 0.45);
  const by = ty - uy * head + -ux * (head * 0.45);
  const path =
    `m ${String(fx)} ${String(fy)} ` +
    `l ${String(tx)} ${String(ty)} ` +
    `m ${String(Math.round(ax))} ${String(Math.round(ay))} ` +
    `l ${String(tx)} ${String(ty)} ` +
    `l ${String(Math.round(bx))} ${String(Math.round(by))}`;
  const fade = fadeTags(getOverlayTheme());
  return [
    dialogue(
      0,
      outputRange(annotation),
      'Leader',
      `{\\pos(0,0)${fade}\\p1}${path}`,
    ),
  ];
}

function chapterEvent(chapter: Chapter, width: number, height: number): string {
  const theme = getOverlayTheme();
  const fade = fadeTags(theme);
  const text = `{\\an2\\pos(${Math.round(width / 2)},${height - 40})${fade}}${escapeAss(fitOverlayText(chapter.title, width - 48, 22))}`;
  return dialogue(
    3,
    chapter.outTimeRange ?? chapter.timeRange,
    'Chapter',
    text,
  );
}

function inferComponent(annotation: AnnotationBox): string {
  if (annotation.feature === 'clickViz') {
    return 'click-ripple';
  }
  if (annotation.feature === 'keystrokes') {
    return 'keystroke-pill';
  }
  if (annotation.feature === 'steps' || annotation.feature === 'progress') {
    return 'step-badge';
  }
  if (annotation.feature === 'pauses') {
    return 'pause-badge';
  }
  if (annotation.feature === 'slowmo') {
    return 'speed-chip';
  }
  if (annotation.feature === 'freezeDetect') {
    return 'freeze-banner';
  }
  return 'plate';
}

function fadeTags(theme: ReturnType<typeof getOverlayTheme>): string {
  const inn = theme.motion.plateIn.ms;
  const out = theme.motion.plateOut.ms;
  return `\\fad(${String(inn)},${String(out)})`;
}

function styleFormat(): string {
  return [
    'Format: Name',
    'Fontname',
    'Fontsize',
    'PrimaryColour',
    'SecondaryColour',
    'OutlineColour',
    'BackColour',
    'Bold',
    'Italic',
    'Underline',
    'StrikeOut',
    'ScaleX',
    'ScaleY',
    'Spacing',
    'Angle',
    'BorderStyle',
    'Outline',
    'Shadow',
    'Alignment',
    'MarginL',
    'MarginR',
    'MarginV',
    'Encoding',
  ].join(', ');
}

function eventFormat(): string {
  return [
    'Format: Layer',
    'Start',
    'End',
    'Style',
    'Name',
    'MarginL',
    'MarginR',
    'MarginV',
    'Effect',
    'Text',
  ].join(', ');
}

function dialogue(
  layer: number,
  range: { readonly start: number; readonly end: number },
  styleName: string,
  text: string,
): string {
  // ASS requires "Dialogue: " (space) then comma-separated fields.
  const fields = [
    String(layer),
    assTime(range.start),
    assTime(range.end),
    styleName,
    '',
    '0',
    '0',
    '0',
    '',
    text,
  ].join(',');
  return `Dialogue: ${fields}`;
}

function outputRange(annotation: AnnotationBox): {
  readonly start: number;
  readonly end: number;
} {
  return annotation.outTimeRange ?? annotation.timeRange;
}

function targetRect(annotation: AnnotationBox): Rect | null {
  if (annotation.anchor?.bbox !== undefined) {
    return bboxToRect(annotation.anchor.bbox);
  }
  if (
    annotation.target !== undefined &&
    typeof annotation.target === 'object'
  ) {
    return {
      height: annotation.target.height ?? 0,
      width: annotation.target.width ?? 0,
      x: annotation.target.x ?? 0,
      y: annotation.target.y ?? 0,
    };
  }
  return null;
}

function bboxToRect(
  bbox:
    | {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
      }
    | undefined,
): Rect | null {
  if (bbox === undefined) {
    return null;
  }
  return { height: bbox.h, width: bbox.w, x: bbox.x, y: bbox.y };
}

function expand(rect: Rect, pad: number): Rect {
  return {
    height: rect.height + pad * 2,
    width: rect.width + pad * 2,
    x: rect.x - pad,
    y: rect.y - pad,
  };
}

function rectPath(rect: Rect): string {
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  return (
    `m 0 0 l ${String(width)} 0 l ${String(width)} ` +
    `${String(height)} l 0 ${String(height)}`
  );
}

function strokedRectPath(
  rect: Rect,
  lineStyle: 'solid' | 'dashed' | 'dotted',
): string {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);

  // Open edge segments avoid filled closed polygons that hide the hollow ring.
  if (lineStyle === 'solid') {
    return [
      `m ${String(x)} ${String(y)} l ${String(x + w)} ${String(y)}`,
      `m ${String(x + w)} ${String(y)} l ${String(x + w)} ${String(y + h)}`,
      `m ${String(x + w)} ${String(y + h)} l ${String(x)} ${String(y + h)}`,
      `m ${String(x)} ${String(y + h)} l ${String(x)} ${String(y)}`,
    ].join(' ');
  }

  const dash = lineStyle === 'dashed' ? 10 : 3;
  const gap = lineStyle === 'dashed' ? 6 : 3;
  return dashedRect(x, y, w, h, dash, gap);
}

function dashedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  dash: number,
  gap: number,
): string {
  const parts: string[] = [];
  const edges: [number, number, number, number][] = [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
  ];
  for (const [x0, y0, x1, y1] of edges) {
    parts.push(...dashSegment(x0, y0, x1, y1, dash, gap));
  }
  return parts.join(' ');
}

function dashSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dash: number,
  gap: number,
): readonly string[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return [];
  }
  const ux = dx / length;
  const uy = dy / length;
  const parts: string[] = [];
  let dist = 0;
  let draw = true;
  while (dist < length) {
    const step = Math.min(draw ? dash : gap, length - dist);
    const sx = x0 + ux * dist;
    const sy = y0 + uy * dist;
    const ex = x0 + ux * (dist + step);
    const ey = y0 + uy * (dist + step);
    if (draw) {
      parts.push(
        `m ${String(Math.round(sx))} ${String(Math.round(sy))} ` +
          `l ${String(Math.round(ex))} ${String(Math.round(ey))}`,
      );
    }
    dist += step;
    draw = !draw;
  }
  return parts;
}

function ellipsePath(rx: number, ry: number): string {
  const rX = Math.max(1, Math.round(rx));
  const rY = Math.max(1, Math.round(ry));
  // Approximate ellipse with bezier-like polygon for libass \p1
  return (
    `m ${String(-rX)} 0 b ${String(-rX)} ${String(-rY)} ` +
    `${String(rX)} ${String(-rY)} ${String(rX)} 0 b ${String(rX)} ` +
    `${String(rY)} ${String(-rX)} ${String(rY)} ${String(-rX)} 0`
  );
}

function assTime(ms: number): string {
  const centiseconds = Math.max(0, Math.round(ms / 10));
  const cs = centiseconds % 100;
  const totalSeconds = Math.floor(centiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${String(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(cs)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function escapeAss(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
}

void burnInFont;
