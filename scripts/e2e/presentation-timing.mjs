/** Synthetic edit decisions over real captured pixels; this is not a bug scenario. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderPlan } from '../../packages/render/dist/index.js';
const execute = promisify(execFile);

export async function verifyPresentationTiming(
  sourceVideo,
  sourceFrames,
  output,
) {
  await mkdir(output, { recursive: true });
  const fps = 30;
  const colors = ['red', 'blue', 'green'];
  const sources = colors.map((color) => {
    const start = sourceFrames.indexOf(color);
    assert.ok(start >= 0, `Missing real ${color} source pixels`);
    return ((start + 2) * 1000) / fps;
  });
  const beats = [];
  const expected = [];
  const segments = [];
  let endMs = 0;
  // Fractional durations expose accumulated per-segment rounding; many holds
  // expose loop's original frame being added to the requested repeat count.
  for (let index = 0; index < 24; index++) {
    const startMs = endMs;
    const durationMs =
      index < 12
        ? [137.5, 181.25, 243.75][index % 3]
        : [33.4, 23.3, 10][index % 3];
    endMs += durationMs;
    const first = Math.round((startMs * fps) / 1000);
    const last = Math.round((endMs * fps) / 1000);
    const color = colors[index % 3];
    const captureAtMs = sources[index % 3] + 3.5;
    const kind = index % 2 === 0 ? 'hold' : 'play';
    const rate = index % 3 === 1 ? 1 : 0.5;
    beats.push({
      id: `segment-${index}`,
      kind,
      source: 'capture',
      rate,
      captureAtMs,
      captureStartMs: captureAtMs,
      captureEndMs: captureAtMs + durationMs * rate,
      outStartMs: startMs,
      outDurationMs: durationMs,
    });
    for (let frame = first; frame < last; frame++) expected.push(color);
    segments.push({ id: index, kind, color, first, last });
  }
  const result = await renderPlan({
    video: sourceVideo,
    outDir: output,
    plan: {
      schemaVersion: 1,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      annotations: [],
      chapters: [],
      segments: [],
      redactionRects: [],
      metadata: { durationMs: endMs, generatedAtEpoch: 1 },
      timeline: {
        schemaVersion: '1.0.0',
        fps,
        beats,
        timeMap: { kind: 'piecewise-linear', knots: [] },
        warnings: [],
      },
    },
  });
  const { stdout: pixels } = await execute(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      result.outputPath,
      '-vf',
      'crop=16:16:32:32,scale=1:1',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
  );
  const actual = [];
  for (let index = 0; index < pixels.length; index += 3) {
    const channels = [...pixels.subarray(index, index + 3)];
    const peak = Math.max(...channels);
    actual.push(
      peak > 180 && channels.filter((value) => value < 60).length === 2
        ? ['red', 'green', 'blue'][channels.indexOf(peak)]
        : 'other',
    );
  }
  await writeFile(
    join(output, 'decoded-frames.json'),
    JSON.stringify({ expected, actual, segments }, null, 2),
  );
  assert.deepEqual(
    actual,
    expected,
    'Presentation pixels must match every published segment boundary',
  );
  const report = {
    passed: true,
    kind: 'synthetic-edit-real-source-pixels',
    output: result.outputPath,
    totalFrames: actual.length,
    segments,
  };
  await writeFile(
    join(output, 'acceptance.json'),
    JSON.stringify(report, null, 2),
  );
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const source = JSON.parse(await readFile(process.argv[2], 'utf8'));
  console.log(
    JSON.stringify(
      await verifyPresentationTiming(
        join(source.directory, 'capture.mp4'),
        source.frames,
        resolve(process.argv[3]),
      ),
      null,
      2,
    ),
  );
}
