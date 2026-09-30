import { runProcess } from '@jitterbox/repro-core';
import { copyFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildOpaqueRedactionFilter } from './redaction-filters.js';

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

/** Opaque source masking only. All presentation pixels belong to the compositor. */
export async function sanitizeSourceImage(input: {
  image: string;
  output: string;
  viewport: { width: number; height: number };
  masks: readonly { x: number; y: number; width: number; height: number }[];
}): Promise<void> {
  const filter = buildOpaqueRedactionFilter(
    input.masks,
    '[0:v]',
    '[sanitized]',
    input.viewport,
  );
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
