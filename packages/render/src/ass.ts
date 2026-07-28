import type { AnnotationBox, Chapter, Rect, ReproPlan } from '@repro/plan';

export interface GenerateAssInput {
  readonly plan: ReproPlan;
  readonly title?: string;
}

export function generateAss(input: GenerateAssInput): string {
  const events = [
    ...input.plan.annotations.flatMap(annotationEvents),
    ...input.plan.chapters.map(chapterEvent),
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
    style('Label', 18, '&H00FFFFFF', '&H80202020', 7),
    style('Chapter', 22, '&H00FFFFFF', '&H90101010', 2),
    style('Box', 1, '&H0000FFFF', '&H4000FFFF', 7),
    '',
    '[Events]',
    eventFormat(),
    ...events,
    '',
  ].join('\n');
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

function annotationEvents(annotation: AnnotationBox): readonly string[] {
  return [
    boxEvent(annotation),
    textEvent(annotation),
    ...leaderLineEvents(annotation),
  ];
}

function textEvent(annotation: AnnotationBox): string {
  const x = Math.round(annotation.bounds.x + 12);
  const y = Math.round(annotation.bounds.y + 10);
  const text = `{\\pos(${String(x)},${String(y)})}` +
    escapeAss(annotation.label);

  return dialogue(2, annotation.timeRange, 'Label', text);
}

function boxEvent(annotation: AnnotationBox): string {
  const path = rectPath(annotation.bounds);
  const x = Math.round(annotation.bounds.x);
  const y = Math.round(annotation.bounds.y);
  const text = `{\\pos(${String(x)},${String(y)})\\p1}${path}`;

  return dialogue(1, annotation.timeRange, 'Box', text);
}

function leaderLineEvents(annotation: AnnotationBox): readonly string[] {
  if (annotation.leaderLine === undefined) {
    return [];
  }

  const from = annotation.leaderLine.from;
  const to = annotation.leaderLine.to;
  const path = `m ${String(Math.round(from.x))} ` +
    `${String(Math.round(from.y))} l ${String(Math.round(to.x))} ` +
    String(Math.round(to.y));
  const text = `{\\p1}${path}`;

  return [dialogue(0, annotation.timeRange, 'Box', text)];
}

function chapterEvent(chapter: Chapter): string {
  const text = `{\\an2\\pos(640,680)}${escapeAss(chapter.title)}`;
  return dialogue(3, chapter.timeRange, 'Chapter', text);
}

function style(
  name: string,
  fontSize: number,
  primary: string,
  back: string,
  alignment: number,
): string {
  return [
    'Style:',
    name,
    'Arial',
    String(fontSize),
    primary,
    primary,
    '&H80000000',
    back,
    '0',
    '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    '4',
    '1',
    '0',
    String(alignment),
    '20',
    '20',
    '20',
    '1',
  ].join(',');
}

function dialogue(
  layer: number,
  range: { readonly start: number; readonly end: number },
  styleName: string,
  text: string,
): string {
  return [
    'Dialogue:',
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
}

function rectPath(rect: Rect): string {
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  return `m 0 0 l ${String(width)} 0 l ${String(width)} ` +
    `${String(height)} l 0 ${String(height)}`;
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
  return text.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}');
}
