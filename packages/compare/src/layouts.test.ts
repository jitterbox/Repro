import { describe, expect, it } from 'vitest';

import {
  blinkLayout,
  croppedRoiLayout,
  differenceLayout,
  edgeOverlayLayout,
  onionLayout,
  sideBySideLayout,
  wipeLayout,
} from './layouts.js';

describe('compare layouts', () => {
  it('builds side-by-side xstack layout strings', () => {
    expect(sideBySideLayout({ left: '[0:v]', right: '[1:v]' })).toContain(
      'xstack=inputs=2',
    );
  });

  it('builds overlay and blend layout strings', () => {
    const input = { left: '[a]', right: '[b]' };

    expect(onionLayout(input)).toContain('blend=all_mode=average');
    expect(wipeLayout({ ...input, progress: 0.25 })).toContain(
      "overlay=x='W*0.25'",
    );
    expect(blinkLayout(input)).toContain('mod(N,15)');
    expect(differenceLayout(input)).toContain('format=gbrp');
    expect(differenceLayout(input)).toContain('blend=all_mode=difference,eq');
    expect(edgeOverlayLayout(input)).toContain('sobel');
    expect(edgeOverlayLayout(input)).toContain('all_mode=addition');
  });

  it('builds cropped-roi magnifier layout strings', () => {
    const filter = croppedRoiLayout({
      left: '[0:v]',
      rect: { h: 40, w: 80, x: 10, y: 20 },
      right: '[1:v]',
    });

    expect(filter).toContain('crop=80:40:10:20');
    expect(filter).toContain('xstack=inputs=2');
  });
});
