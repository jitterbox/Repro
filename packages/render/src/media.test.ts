import { expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveMediaCommand } from '@jitterbox/repro-core';
import { sanitizeSourceImage } from './media.js';

it('preserves unmasked PNG bytes without starting an encoder, and still validates the viewport', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'repro-source-copy-'));
  const image = join(dir, 'source.png'),
    output = join(dir, 'copy.png');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=',
    'base64',
  );
  try {
    await writeFile(image, png);
    await sanitizeSourceImage({
      image,
      output,
      viewport: { width: 1, height: 1 },
      masks: [],
    });
    expect(await readFile(output)).toEqual(png);
    await expect(
      sanitizeSourceImage({
        image,
        output,
        viewport: { width: NaN, height: 1 },
        masks: [],
      }),
    ).rejects.toThrow('finite positive viewport');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('masks fractional high-DPI source bounds opaquely without altering other pixels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'repro-source-mask-'));
  try {
    const source = join(dir, 'source.ppm'),
      output = join(dir, 'sanitized.png');
    await writeFile(
      source,
      Buffer.concat([
        Buffer.from('P6\n20 20\n255\n'),
        Buffer.alloc(20 * 20 * 3, 255),
      ]),
    );
    await sanitizeSourceImage({
      image: source,
      output,
      viewport: { width: 10, height: 10 },
      masks: [{ x: 2.25, y: 3.25, width: 2.5, height: 2.5 }],
    });
    const { stdout } = await promisify(execFile)(
      resolveMediaCommand('ffmpeg'),
      ['-v', 'error', '-i', output, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { encoding: 'buffer' },
    );
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) {
        const masked = x >= 4 && x < 10 && y >= 6 && y < 12;
        expect([
          ...stdout.subarray((y * 20 + x) * 3, (y * 20 + x) * 3 + 3),
        ]).toEqual(Array(3).fill(masked ? 0 : 255));
      }
    await expect(
      sanitizeSourceImage({
        image: source,
        output,
        viewport: { width: 10, height: 10 },
        masks: [{ x: NaN, y: 0, width: 2, height: 2 }],
      }),
    ).rejects.toThrow('Redaction bounds');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
