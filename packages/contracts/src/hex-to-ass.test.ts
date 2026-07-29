import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hexToAss, overlayTheme } from './generated/overlay-theme.js';

const tokensPath = join(
  import.meta.dirname,
  '../tokens/overlay-theme.tokens.json',
);

describe('hexToAss', () => {
  it('matches every committed ass field from its hex', () => {
    const raw = JSON.parse(readFileSync(tokensPath, 'utf8')) as {
      colors: Record<string, { hex: string; ass: string }>;
    };

    for (const [name, entry] of Object.entries(raw.colors)) {
      expect(hexToAss(entry.hex), name).toBe(entry.ass);
      expect(overlayTheme.colors[name as keyof typeof overlayTheme.colors].ass)
        .toBe(entry.ass);
    }
  });

  it('inverts alpha for label-bg', () => {
    expect(hexToAss('#202020E6')).toBe('&H19202020');
  });
});
