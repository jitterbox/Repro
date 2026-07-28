import { describe, expect, it } from 'vitest';

import {
  JpegDimensionsError,
  assertJpegDimensions,
  parseJpegDimensions,
} from './jpeg-dims.js';

describe('parseJpegDimensions', () => {
  it('reads width and height from a SOF marker', () => {
    const jpeg = minimalJpeg(320, 240);

    expect(parseJpegDimensions(jpeg)).toEqual({
      height: 240,
      width: 320,
    });
  });

  it('throws when dimensions do not match', () => {
    const jpeg = minimalJpeg(640, 480);

    expect(() => {
      assertJpegDimensions(jpeg, { height: 720, width: 1280 });
    }).toThrow(JpegDimensionsError);
  });

  it('rejects non-JPEG data', () => {
    expect(() => parseJpegDimensions(new Uint8Array([0, 1, 2]))).toThrow(
      'Data is not a JPEG image',
    );
  });
});

function minimalJpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    byteAt(height, 1),
    byteAt(height, 0),
    byteAt(width, 1),
    byteAt(width, 0),
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

function byteAt(value: number, byteIndex: number): number {
  return (value >> (byteIndex * 8)) & 0xff;
}
