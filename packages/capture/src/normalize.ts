import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { h264Profile, runProcess, probeMedia } from '@jitterbox/repro-core';
export interface TimedFrame {
  path: string;
  pageId: string;
  timeMs: number;
}
export interface Cut {
  pageId: string;
  timeMs: number;
}

export function editorialFrames(
  frames: TimedFrame[],
  cuts: Cut[],
  endMs: number,
) {
  const ordered = frames.slice().sort((a, b) => a.timeMs - b.timeMs);
  if (!ordered.length) throw new Error('Missing capture frames');
  const switches = cuts.slice().sort((a, b) => a.timeMs - b.timeMs);
  const first = requireValue(ordered[0]);
  const activeAt = (time: number) =>
    switches.filter((c) => c.timeMs <= time).at(-1)?.pageId ?? first.pageId;
  const times = [
    ...new Set([
      first.timeMs,
      ...ordered.map((f) => f.timeMs),
      ...switches.map((c) => c.timeMs),
    ]),
  ]
    .sort((a, b) => a - b)
    .filter((t) => t < endMs);
  return times.flatMap((timeMs, index) => {
    const page = activeAt(timeMs);
    const frame = ordered
      .filter((f) => f.pageId === page && f.timeMs <= timeMs)
      .at(-1);
    if (!frame)
      throw new Error(`No frame for editorial cut to ${page} at ${timeMs}ms`);
    return [
      { ...frame, timeMs, durationMs: (times[index + 1] ?? endMs) - timeMs },
    ];
  });
}

export async function normalizeCapture(
  directory: string,
  cuts: Cut[],
  endMs: number,
  signal?: AbortSignal,
) {
  const root = join(directory, 'frames');
  const frames: TimedFrame[] = [];
  for (const pageId of await readdir(root)) {
    const table = JSON.parse(
      await readFile(join(root, pageId, 'timestamps.json'), 'utf8'),
    ) as { path: string; timeMs?: number }[];
    for (const frame of table) {
      if (frame.timeMs === undefined)
        throw new Error('Legacy frame timing must be migrated by recapturing');
      frames.push({ path: frame.path, timeMs: frame.timeMs, pageId });
    }
  }
  const selected = editorialFrames(frames, cuts, endMs);
  const quote = (path: string) => resolve(path).replaceAll("'", "'\\''");
  const concat =
    selected
      .map((f) => `file '${quote(f.path)}'\nduration ${f.durationMs / 1000}`)
      .join('\n') + `\nfile '${quote(requireValue(selected.at(-1)).path)}'\n`;
  const input = join(directory, 'frames.ffconcat');
  const video = join(directory, 'capture.mp4');
  await writeFile(input, concat);
  const dimensions = (await probeMedia(requireValue(selected[0]).path))
    .streams[0];
  const odd = Boolean(
    (dimensions?.width ?? 0) % 2 || (dimensions?.height ?? 0) % 2,
  );
  const pixelFormat = odd ? 'yuv444p' : 'yuv420p';
  await runProcess(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      input,
      '-vf',
      `fps=30,scale=in_range=full:out_range=tv,format=${pixelFormat}`,
      '-t',
      String((endMs - requireValue(selected[0]).timeMs) / 1000),
      ...h264Profile,
      '-pix_fmt',
      pixelFormat,
      '-profile:v',
      odd ? 'high444' : 'high',
      video,
    ],
    signal ? { signal } : {},
  );
  await writeFile(
    join(directory, 'frames.json'),
    JSON.stringify(frames, null, 2),
  );
  return { video, frames, startMs: requireValue(selected[0]).timeMs, endMs };
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
