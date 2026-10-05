import { runProcess } from '@jitterbox/repro-core';
import { copyFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildPrivacyBlurFilter } from './redaction-filters.js';

export async function probeMediaDurationMs(
  path: string,
  ffprobePath = 'ffprobe',
): Promise<number | undefined> {
  try {
    const output = await runProcess(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ]);
    const seconds = Number.parseFloat(output.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Blur measured privacy regions in the source image. */
export async function sanitizeSourceImage(input: {
  image: string;
  output: string;
  viewport: { width: number; height: number };
  masks: readonly { x: number; y: number; width: number; height: number }[];
}): Promise<void> {
  const image =
    input.masks.length === 0
      ? input.viewport
      : await probeImageSize(input.image);
  const filter = buildPrivacyBlurFilter({
    rects: input.masks,
    sourceLabel: '[0:v]',
    outputLabel: '[sanitized]',
    viewport: input.viewport,
    image,
  });
  if (
    input.masks.length === 0 &&
    extname(input.image).toLowerCase() === '.png' &&
    extname(input.output).toLowerCase() === '.png'
  ) {
    // Captured PNGs already contain the exact evidence pixels. No masks means
    // there is no pixel transformation to perform or encoder process to start.
    await copyFile(input.image, input.output);
    return;
  }
  await runProcess('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    input.image,
    '-filter_complex',
    filter,
    '-map',
    '[sanitized]',
    '-frames:v',
    '1',
    input.output,
  ]);
}

async function probeImageSize(
  image: string,
): Promise<{ width: number; height: number }> {
  const output = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    image,
  ]);
  const parts = output.trim().split('x');
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    throw new Error('Redaction requires a finite positive image');
  return { width, height };
}
