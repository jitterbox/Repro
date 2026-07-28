import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

export interface SparsePngFrame {
  readonly path: string;
  readonly timeMs: number;
}

export interface SparsePngLayerInput {
  readonly outDir: string;
  readonly width: number;
  readonly height: number;
  readonly timesMs: readonly number[];
  readonly prefix?: string;
}

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export async function writeSparseTransparentPngFrames(
  input: SparsePngLayerInput,
): Promise<readonly SparsePngFrame[]> {
  await mkdir(input.outDir, { recursive: true });

  return Promise.all(
    input.timesMs.map(async (timeMs, index) => {
      const name = `${input.prefix ?? 'overlay'}-${String(index)}.png`;
      const path = join(input.outDir, name);
      await writeTransparentPng(path, input.width, input.height);
      return { path, timeMs };
    }),
  );
}

export async function writeTransparentPng(
  path: string,
  width: number,
  height: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, transparentPng(width, height));
}

export function transparentPng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    pngSignature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(emptyRgbaRows(width, height))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function emptyRgbaRows(width: number, height: number): Buffer {
  const stride = width * 4 + 1;
  return Buffer.alloc(stride * height);
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] ?? 0);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = new Uint32Array(
  Array.from({ length: 256 }, (_unused, index) => tableEntry(index)),
);

function tableEntry(index: number): number {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
}
