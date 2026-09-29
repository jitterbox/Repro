import { execFileSync } from 'node:child_process';
import { overlayTheme } from '@repro/contracts';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';

export interface MeasureTextInput {
  readonly text: string;
  readonly fontSize: number;
  readonly fontPath?: string;
}

const averageGlyphWidth = 0.55;
const fontCache = new Map<string, opentype.Font | null>();

export function measureTextWidth(input: MeasureTextInput): number {
  if (input.text.length === 0 || input.fontSize <= 0) {
    return 0;
  }

  const font = getFont(input.fontPath);
  if (font === null) {
    return fallbackWidth(input.text, input.fontSize);
  }

  try {
    return font.getAdvanceWidth(input.text, input.fontSize);
  } catch {
    return fallbackWidth(input.text, input.fontSize);
  }
}

function getFont(fontPath: string | undefined): opentype.Font | null {
  if (fontPath === undefined || fontPath.length === 0) {
    return null;
  }

  const cached = fontCache.get(fontPath);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const bytes = readFileSync(fontPath);
    const font = opentype.parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    fontCache.set(fontPath, font);
    return font;
  } catch {
    fontCache.set(fontPath, null);
    return null;
  }
}

function fallbackWidth(text: string, fontSize: number): number {
  return text.length * fontSize * averageGlyphWidth;
}

let overlayFontPath: string | undefined;
let overlayFontResolved = false;
/** Shared conservative width for planning and libass text fitting. */
export function measureOverlayTextWidth(
  text: string,
  fontSize: number,
): number {
  if (!overlayFontResolved) {
    overlayFontResolved = true;
    try {
      const windowsFont = join(
        process.env.WINDIR ?? 'C:/Windows',
        'Fonts',
        'arialbd.ttf',
      );
      overlayFontPath =
        process.platform === 'win32'
          ? existsSync(windowsFont)
            ? windowsFont
            : undefined
          : execFileSync(
              'fc-match',
              ['-f', '%{file}', `${overlayTheme.burnInFont.family}:style=Bold`],
              { encoding: 'utf8' },
            ).trim() || undefined;
    } catch {
      /* Keep a conservative width without fontconfig. */
    }
  }
  const normalized = text.replace(/\s+/gu, ' ').trim();
  return overlayFontPath
    ? measureTextWidth({
        text: normalized,
        fontSize,
        fontPath: overlayFontPath,
      }) * 1.08
    : Array.from(normalized).length * fontSize * 1.2;
}
