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
    const font = opentype.loadSync(fontPath);
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
