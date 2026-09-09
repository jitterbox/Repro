/** Real browser pixels captured through the public CLI; deliberate waits are the measured subject. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyPresentationTiming } from './presentation-timing.mjs';
const execute = promisify(execFile);
const output = resolve(
  process.env.REPRO_TIMING_OUT ?? '.repro/timing-acceptance',
);
await mkdir(output, { recursive: true });
const example = resolve('packages/playwright/examples');
const tracing = process.env.REPRO_TIMING_TRACE === '1';
const configPath = join(output, 'repro.config.json');
await writeFile(
  configPath,
  JSON.stringify({
    mode: 'repro',
    profile: 'controlled',
    surfaceCapture: 'page',
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    features: { steps: true },
    capture: { trace: tracing },
  }),
);
const { stdout } = await execute(
  process.execPath,
  [
    resolve('packages/cli/dist/bin.js'),
    'run',
    join(example, 'timing.spec.ts'),
    '--playwright-config',
    join(example, 'timing.config.ts'),
    '--evidence',
    join(example, 'timing.json'),
    '--config',
    configPath,
    '--out-dir',
    output,
  ],
  { maxBuffer: 8 * 1024 * 1024 },
);
const result = JSON.parse(stdout);
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.runs.length, 1);
const directory = result.runs[0].directory;
const manifest = JSON.parse(
  await readFile(join(directory, 'run.json'), 'utf8'),
);
assert.deepEqual(manifest.environment.reproTracing, {
  started: tracing,
  screenshots: false,
  snapshots: tracing,
});
if (tracing)
  assert.ok((await readFile(join(directory, 'trace.zip'))).byteLength > 0);
// Decode a clean patch of every actual output frame; no metadata-only timing test.
const { stdout: pixels } = await execute(
  'ffmpeg',
  [
    '-v',
    'error',
    '-i',
    join(directory, 'capture.mp4'),
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
const frames = [];
for (let index = 0; index < pixels.length; index += 3) {
  const channels = [...pixels.subarray(index, index + 3)];
  const peak = Math.max(...channels);
  frames.push(
    peak > 180 && channels.filter((value) => value < 60).length === 2
      ? ['red', 'green', 'blue'][channels.indexOf(peak)]
      : 'other',
  );
}
function verifyTiming(frames) {
  const offset = manifest.environment.recordingStartMs;
  assert.ok(Number.isFinite(offset), 'Recording must expose its source offset');
  const frameMs = 1000 / 30;
  const measurements = [];
  for (const [stepId, color] of [
    ['blue', 'blue'],
    ['pulse', 'green'],
    ['end', 'red'],
  ]) {
    const step = manifest.steps.find((value) => value.id === stepId);
    assert.ok(step);
    const afterFrame = Math.max(
      0,
      Math.floor((step.startMs - offset) / frameMs) - 2,
    );
    const index = frames.findIndex(
      (value, frame) => frame >= afterFrame && value === color,
    );
    assert.ok(index >= 0, `${color} interval is missing`);
    const actualMs = offset + index * frameMs;
    const errorMs = actualMs - step.startMs;
    measurements.push({
      step: stepId,
      expectedMs: step.startMs,
      actualMs,
      errorMs,
    });
    assert.ok(
      Math.abs(errorMs) <= frameMs * 2,
      `${stepId} is misaligned by ${errorMs} ms`,
    );
  }
  const blueFrames = frames.filter((color) => color === 'blue').length;
  const greenFrames = frames.filter((color) => color === 'green').length;
  // Timer requests are minimum waits. Compare with observed execution time,
  // including Playwright/tracing overhead, rather than the requested timeout.
  const blueDurationMs =
    manifest.steps.find((step) => step.id === 'pulse').startMs -
    manifest.steps.find((step) => step.id === 'blue').startMs;
  const greenDurationMs =
    manifest.steps.find((step) => step.id === 'end').startMs -
    manifest.steps.find((step) => step.id === 'pulse').startMs;
  assert.ok(
    Math.abs(blueFrames * frameMs - blueDurationMs) <= frameMs * 2 + 1e-6,
    'Stationary blue hold was shortened or extended',
  );
  assert.ok(
    Math.abs(greenFrames * frameMs - greenDurationMs) <= frameMs * 2 + 1e-6,
    'Brief green interval was shortened or extended',
  );
  assert.equal(frames.at(-1), 'red');
  assert.ok(
    Math.abs(offset + frames.length * frameMs - manifest.durationMs) <=
      frameMs * 2,
    'Recording ending was dropped',
  );

  return {
    measurements,
    blueFrames,
    greenFrames,
    blueDurationMs,
    greenDurationMs,
  };
}
await writeFile(
  join(output, 'decoded-frames.json'),
  JSON.stringify({ directory, frames }, null, 2),
);
const verified = verifyTiming(frames);
const negativeControls = [
  [
    'stationary-interval-compressed',
    frames.filter((color, index) => color !== 'blue' || index % 2 === 0),
  ],
  [
    'brief-interval-missing',
    frames.map((color) => (color === 'green' ? 'blue' : color)),
  ],
  ['ending-truncated', frames.slice(0, -30)],
];
for (const [name, damaged] of negativeControls)
  assert.throws(
    () => verifyTiming(damaged),
    undefined,
    `${name} was not rejected`,
  );
const report = {
  passed: true,
  directory,
  tracing,
  ...verified,
  negativeControls: negativeControls.map(([name]) => ({
    name,
    rejected: true,
  })),
  totalFrames: frames.length,
  presentation: await verifyPresentationTiming(
    join(directory, 'capture.mp4'),
    frames,
    join(output, 'presentation'),
  ),
};
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
