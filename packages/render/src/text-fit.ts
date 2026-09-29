import { measureOverlayTextWidth } from '@jitterbox/repro-plan';
/** Same installed font as libass; conservative fallback when fontconfig is unavailable. */
export function fitOverlayText(
  text: string,
  width: number,
  fontSize: number,
  maxChars = Infinity,
): string {
  const glyphs = Array.from(text.replace(/\s+/gu, ' ').trim());
  const measure = (value: string) => measureOverlayTextWidth(value, fontSize);
  if (glyphs.length <= maxChars && measure(glyphs.join('')) <= width)
    return glyphs.join('');
  let count = Math.min(glyphs.length, Math.max(0, maxChars - 1));
  while (count > 0 && measure(glyphs.slice(0, count).join('') + '…') > width)
    count--;
  return measure('…') <= width ? glyphs.slice(0, count).join('') + '…' : '';
}
