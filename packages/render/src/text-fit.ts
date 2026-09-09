import { execFileSync } from 'node:child_process';
import { measureTextWidth } from '@repro/plan';
import { burnInFont } from './theme.js';
let fontPath: string | undefined;
let resolved = false;
/** Same installed font as libass; conservative fallback when fontconfig is unavailable. */
export function fitOverlayText(
  text: string,
  width: number,
  fontSize: number,
  maxChars = Infinity,
): string {
  if (!resolved) {
    resolved = true;
    try {
      fontPath =
        execFileSync(
          'fc-match',
          ['-f', '%{file}', `${burnInFont()}:style=Bold`],
          { encoding: 'utf8' },
        ).trim() || undefined;
    } catch {
      /* clipping remains the hard boundary */
    }
  }
  const glyphs = Array.from(text.replace(/\s+/gu, ' ').trim());
  const measure = (value: string) =>
    fontPath
      ? measureTextWidth({ text: value, fontSize, fontPath }) * 1.08
      : Array.from(value).length * fontSize * 1.2;
  if (glyphs.length <= maxChars && measure(glyphs.join('')) <= width)
    return glyphs.join('');
  let count = Math.min(glyphs.length, Math.max(0, maxChars - 1));
  while (count > 0 && measure(glyphs.slice(0, count).join('') + '…') > width)
    count--;
  return measure('…') <= width ? glyphs.slice(0, count).join('') + '…' : '';
}
