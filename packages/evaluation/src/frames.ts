import { sharedAnalysis, sharedFrame, imageIdentity } from './analysis.js';
import { runProcess } from '@jitterbox/repro-core';
import { tmpdir } from 'node:os';
import { readdir, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';

export async function probeDurationMs(videoPath: string): Promise<number> {
  const stdout = await runProcess('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) {
    throw new Error(`ffprobe could not read duration for ${videoPath}`);
  }
  return Math.round(seconds * 1000);
}

export async function extractFrameAt(
  videoPath: string,
  timeMs: number,
  outPath: string,
): Promise<string> {
  const timeSec = (timeMs / 1000).toFixed(3);
  return sharedFrame(
    JSON.stringify([
      'frame',
      await imageIdentity(videoPath),
      timeSec,
      extname(outPath),
    ]),
    outPath,
    async () => {
      await runProcess('ffmpeg', [
        '-y',
        '-ss',
        timeSec,
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outPath,
      ]);
    },
  );
}

export async function extractContactSheet(
  videoPath: string,
  outDir: string,
  fps = 2,
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const pattern = join(outDir, 'frame-%04d.jpg');
  await runProcess('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-vf',
    `fps=${fps}`,
    '-q:v',
    '3',
    pattern,
  ]);

  const files = await readdir(outDir);
  return files
    .filter((file) => file.startsWith('frame-') && file.endsWith('.jpg'))
    .sort()
    .map((file) => join(outDir, file));
}

/** Mean luma 0-255 for a single image via ffmpeg gray raw decode. */
export async function meanLuminance(imagePath: string): Promise<number> {
  const stats = await lumaStats(imagePath);
  return stats.mean;
}

export interface LumaStats {
  readonly mean: number;
  readonly p10: number;
  readonly p90: number;
  readonly samples: number;
}

/** Decode gray pixels and return mean plus percentile luminances. */
export async function lumaStats(imagePath: string): Promise<LumaStats> {
  return sharedAnalysis(`luma:${await imageIdentity(imagePath)}`, () =>
    decodeLumaStats(imagePath),
  );
}

async function decodeLumaStats(imagePath: string): Promise<LumaStats> {
  const directory = await mkdtemp(join(tmpdir(), 'repro-luma-'));
  let buffer: Buffer;
  try {
    const raw = join(directory, 'pixels.raw');
    await runProcess('ffmpeg', [
      '-v',
      'error',
      '-i',
      imagePath,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      raw,
    ]);
    buffer = await readFile(raw);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  if (buffer.length === 0) {
    return { mean: 0, p10: 0, p90: 0, samples: 0 };
  }

  let sum = 0;
  const values = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    const value = buffer[index] ?? 0;
    values[index] = value;
    sum += value;
  }
  const sorted = Uint8Array.from(values).sort();
  const p10Index = Math.floor((sorted.length - 1) * 0.1);
  const p90Index = Math.floor((sorted.length - 1) * 0.9);
  return {
    mean: sum / buffer.length,
    p10: sorted[p10Index] ?? 0,
    p90: sorted[p90Index] ?? 0,
    samples: buffer.length,
  };
}

export async function extractCroppedFrameAt(input: {
  readonly videoPath: string;
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly outPath: string;
}): Promise<string> {
  const timeSec = (input.timeMs / 1000).toFixed(3);
  const w = Math.max(1, Math.round(input.width));
  const h = Math.max(1, Math.round(input.height));
  const x = Math.max(0, Math.round(input.x));
  const y = Math.max(0, Math.round(input.y));
  return sharedFrame(
    JSON.stringify([
      'crop',
      await imageIdentity(input.videoPath),
      timeSec,
      w,
      h,
      x,
      y,
      extname(input.outPath),
    ]),
    input.outPath,
    async () => {
      await runProcess('ffmpeg', [
        '-y',
        '-ss',
        timeSec,
        '-i',
        input.videoPath,
        '-vf',
        `crop=${String(w)}:${String(h)}:${String(x)}:${String(y)}`,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        input.outPath,
      ]);
    },
  );
}

export async function probeVideoSize(
  videoPath: string,
): Promise<{ readonly width: number; readonly height: number }> {
  const stdout = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    videoPath,
  ]);
  const [widthText, heightText] = stdout.trim().split('x');
  const width = Number.parseInt(widthText ?? '', 10);
  const height = Number.parseInt(heightText ?? '', 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`ffprobe could not read size for ${videoPath}`);
  }
  return { width, height };
}
