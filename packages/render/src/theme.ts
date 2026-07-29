import {
  hexToAss,
  overlayTheme,
  severityAss,
  severityColor,
} from '@repro/contracts';

import type { OverlayTheme } from '@repro/contracts';

export type Severity =
  | 'info'
  | 'low'
  | 'medium'
  | 'warn'
  | 'high'
  | 'critical';

export function getOverlayTheme(): OverlayTheme {
  return overlayTheme;
}

export function burnInFont(): string {
  return overlayTheme.burnInFont.family;
}

export function burnInMonoFont(): string {
  return overlayTheme.burnInFont.mono;
}

export function colorAss(name: keyof OverlayTheme['colors']): string {
  return overlayTheme.colors[name].ass;
}

export function colorHex(name: keyof OverlayTheme['colors']): string {
  return overlayTheme.colors[name].hex;
}

export { hexToAss, severityAss, severityColor };

export function holdFor(
  component:
    | 'slate'
    | 'chapter'
    | 'callout'
    | 'consoleToast'
    | 'pause'
    | 'slowmo'
    | 'outcome'
    | 'compareBeat',
  text = '',
): number {
  const hold = overlayTheme.holdsMs[component];
  let ms: number = hold.typical;
  if ('perChar' in hold && typeof hold.perChar === 'number') {
    ms = Math.max(hold.min, text.length * hold.perChar);
  }
  if ('perWord' in hold && typeof hold.perWord === 'number') {
    const words = text.trim().split(/\s+/u).filter(Boolean).length;
    ms = Math.max(hold.min, words * hold.perWord);
  }
  return Math.max(hold.min, ms);
}

/** Build the ASS [V4+ Styles] table from the theme. */
export function assStyleTable(): readonly string[] {
  const font = burnInFont();
  const mono = burnInMonoFont();
  const labelFg = colorAss('repro-label-fg');
  const labelBg = colorAss('repro-label-bg');
  const info = colorAss('repro-info');
  const warn = colorAss('repro-warn');
  const critical = colorAss('repro-critical');
  const add = colorAss('repro-add');
  const remove = colorAss('repro-remove');
  const change = colorAss('repro-change');
  const clickLeft = colorAss('repro-click-left');
  const clickRight = colorAss('repro-click-right');
  const meta = colorAss('repro-meta');
  const before = colorAss('repro-before');
  const after = colorAss('repro-after');
  const halo = colorAss('repro-ring-halo');
  const progress = colorAss('repro-progress');

  return [
    boxStyle('Plate', font, overlayTheme.type.calloutLabel.size, labelFg, labelBg, 7),
    boxStyle('Kicker', font, overlayTheme.type.calloutKicker.size, labelFg, labelBg, 7, 1),
    boxStyle('Badge', font, overlayTheme.type.badge.size, labelFg, labelBg, 7, 1),
    boxStyle('Chapter', font, 22, labelFg, colorAss('repro-slate-bg'), 2),
    boxStyle('Console', mono, overlayTheme.type.console.size, labelFg, labelBg, 2),
    boxStyle('Meta', font, overlayTheme.type.slateMeta.size, meta, labelBg, 7),
    strokeStyle('RingInfo', info, halo),
    strokeStyle('RingWarn', warn, halo),
    strokeStyle('RingCritical', critical, halo),
    strokeStyle('RingAdd', add, halo),
    strokeStyle('RingRemove', remove, halo),
    strokeStyle('RingChange', change, halo),
    strokeStyle('RingBefore', before, halo),
    strokeStyle('RingAfter', after, halo),
    strokeStyle('ClickLeft', clickLeft, halo),
    strokeStyle('ClickRight', clickRight, halo),
    strokeStyle('Leader', info, halo),
    boxStyle('Progress', font, 1, progress, '&H00000000', 7),
    boxStyle('Box', font, 1, info, labelBg, 7),
  ];
}

export function ringStyleForSeverity(severity: Severity): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'RingCritical';
    case 'warn':
    case 'medium':
      return 'RingWarn';
    default:
      return 'RingInfo';
  }
}

function boxStyle(
  name: string,
  font: string,
  fontSize: number,
  primary: string,
  back: string,
  alignment: number,
  bold = 0,
): string {
  return styleFields({
    alignment,
    back,
    bold,
    borderStyle: 4,
    font,
    fontSize,
    name,
    outline: 1,
    outlineColour: '&H80000000',
    primary,
  });
}

/** Outline strokes for rings/leaders — BorderStyle 1 so \p1 paths are visible. */
function strokeStyle(name: string, accent: string, halo: string): string {
  return styleFields({
    alignment: 7,
    back: halo,
    bold: 0,
    borderStyle: 1,
    font: burnInFont(),
    fontSize: 1,
    name,
    outline: 2,
    outlineColour: accent,
    primary: '&HFF000000',
  });
}

function styleFields(input: {
  readonly name: string;
  readonly font: string;
  readonly fontSize: number;
  readonly primary: string;
  readonly outlineColour: string;
  readonly back: string;
  readonly bold: number;
  readonly borderStyle: number;
  readonly outline: number;
  readonly alignment: number;
}): string {
  const fields = [
    input.name,
    input.font,
    String(input.fontSize),
    input.primary,
    input.primary,
    input.outlineColour,
    input.back,
    String(input.bold),
    '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    String(input.borderStyle),
    String(input.outline),
    '0',
    String(input.alignment),
    '20',
    '20',
    '20',
    '1',
  ].join(',');
  return `Style: ${fields}`;
}
