export interface JpegDimensions {
  readonly height: number;
  readonly width: number;
}

export class JpegDimensionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JpegDimensionsError';
  }
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

const MARKERS_WITHOUT_LENGTH = new Set([
  0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9,
]);

export function parseJpegDimensions(data: Uint8Array): JpegDimensions {
  assertJpegHeader(data);

  let offset = 2;
  while (offset < data.length) {
    offset = nextMarkerOffset(data, offset);
    const marker = byteAt(data, offset + 1);
    offset += 2;

    if (MARKERS_WITHOUT_LENGTH.has(marker)) {
      continue;
    }

    const segmentLength = readUint16(data, offset);
    assertSegmentLength(data, offset, segmentLength);

    if (SOF_MARKERS.has(marker)) {
      return parseSofSegment(data, offset);
    }

    offset += segmentLength;
  }

  throw new JpegDimensionsError('JPEG SOF marker was not found');
}

export function assertJpegDimensions(
  data: Uint8Array,
  expected: JpegDimensions,
): JpegDimensions {
  const actual = parseJpegDimensions(data);

  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new JpegDimensionsError(
      `JPEG dimensions ${String(actual.width)}x${String(actual.height)} ` +
        `do not match ${String(expected.width)}x${String(expected.height)}`,
    );
  }

  return actual;
}

function assertJpegHeader(data: Uint8Array): void {
  if (data.length < 4 || byteAt(data, 0) !== 0xff) {
    throw new JpegDimensionsError('Data is not a JPEG image');
  }

  if (byteAt(data, 1) !== 0xd8) {
    throw new JpegDimensionsError('Data is not a JPEG image');
  }
}

function nextMarkerOffset(data: Uint8Array, startOffset: number): number {
  let offset = startOffset;

  while (offset < data.length && byteAt(data, offset) !== 0xff) {
    offset += 1;
  }

  while (offset < data.length && byteAt(data, offset + 1) === 0xff) {
    offset += 1;
  }

  if (offset + 1 >= data.length) {
    throw new JpegDimensionsError('JPEG marker is truncated');
  }

  return offset;
}

function parseSofSegment(data: Uint8Array, offset: number): JpegDimensions {
  return {
    height: readUint16(data, offset + 3),
    width: readUint16(data, offset + 5),
  };
}

function assertSegmentLength(
  data: Uint8Array,
  offset: number,
  segmentLength: number,
): void {
  if (segmentLength < 2) {
    throw new JpegDimensionsError('JPEG segment has an invalid length');
  }

  if (offset + segmentLength > data.length) {
    throw new JpegDimensionsError('JPEG segment is truncated');
  }
}

function readUint16(data: Uint8Array, offset: number): number {
  return byteAt(data, offset) * 256 + byteAt(data, offset + 1);
}

function byteAt(data: Uint8Array, offset: number): number {
  const value = data[offset];

  if (value === undefined) {
    throw new JpegDimensionsError('JPEG data is truncated');
  }

  return value;
}
