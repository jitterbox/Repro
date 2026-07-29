import { overlayTheme } from '@repro/contracts';

const { colors, burnInFont, safeZones, type: typeScale } = overlayTheme;

function cssVar(name: string, hex: string): string {
  return `  --${name}: ${hex};`;
}

export const themeCss = `:root {
${cssVar('repro-add', colors['repro-add'].hex)}
${cssVar('repro-remove', colors['repro-remove'].hex)}
${cssVar('repro-change', colors['repro-change'].hex)}
${cssVar('repro-info', colors['repro-info'].hex)}
${cssVar('repro-critical', colors['repro-critical'].hex)}
${cssVar('repro-warn', colors['repro-warn'].hex)}
${cssVar('repro-label-fg', colors['repro-label-fg'].hex)}
${cssVar('repro-label-bg', colors['repro-label-bg'].hex)}
${cssVar('repro-slate-bg', colors['repro-slate-bg'].hex)}
${cssVar('repro-before', colors['repro-before'].hex)}
${cssVar('repro-after', colors['repro-after'].hex)}
${cssVar('repro-meta', colors['repro-meta'].hex)}
${cssVar('repro-scrim', colors['repro-scrim'].hex)}
${cssVar('repro-plate-hairline', colors['repro-plate-hairline'].hex)}
  --repro-font: ${burnInFont.family}, ${burnInFont.fallback.join(', ')};
  --repro-font-mono: ${burnInFont.mono}, ${burnInFont.fallback.join(', ')};
  --repro-inset: ${safeZones.inset}px;
  --repro-bottom-band: ${safeZones.bottomBand}px;
  --repro-slate-title-size: ${typeScale.slateTitle.size}px;
  --repro-slate-meta-size: ${typeScale.slateMeta.size}px;
  --repro-badge-size: ${typeScale.badge.size}px;
  --repro-console-size: ${typeScale.console.size}px;
}`;

export function color(name: keyof typeof colors): string {
  return colors[name].hex;
}
