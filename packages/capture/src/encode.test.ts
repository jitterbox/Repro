import { describe, expect, it } from 'vitest';

import { videoFilter } from './encode.js';

describe('videoFilter', () => {
  it('tags JPEG full-range input for zscale BT.709 encode', () => {
    expect(videoFilter(true)).toContain('matrixin=170m');
    expect(videoFilter(true)).toContain('rangein=full');
    expect(videoFilter(true)).toContain('range=limited');
    expect(videoFilter(true)).toContain('format=yuv420p');
  });

  it('falls back to scale range conversion without zscale', () => {
    expect(videoFilter(false)).toBe(
      'scale=in_range=full:out_range=tv,format=yuv420p',
    );
  });
});
