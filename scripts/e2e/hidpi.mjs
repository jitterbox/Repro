/** Actual high-DPI browser capture through the public CLI, then pixel inspection. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const execute = promisify(execFile);
const { PNG } = createRequire(resolve('packages/evaluation/package.json'))(
  'pngjs',
);
const output = resolve(
  process.env.REPRO_HIDPI_OUT ?? '.repro/hidpi-acceptance',
);
await mkdir(output, { recursive: true });
const privateTarget = process.env.REPRO_HIDPI_PRIVATE === '1';
const specification = JSON.parse(
  await readFile('packages/playwright/examples/after.json', 'utf8'),
);
if (privateTarget) specification.privacy.selectors = ['#checkout'];
const evidence = join(output, 'evidence.json');
await writeFile(evidence, JSON.stringify(specification, null, 2));
const config = join(output, 'repro.config.json');
await writeFile(
  config,
  JSON.stringify({
    mode: 'repro',
    surfaceCapture: 'page',
    profile: 'controlled',
    viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
    features: { steps: true },
  }),
);
async function repro(...args) {
  const { stdout } = await execute(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), ...args],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}
const captured = await repro(
  'run',
  'packages/playwright/examples/scenario.spec.ts',
  '--playwright-config',
  'packages/playwright/examples/hidpi.config.ts',
  '--evidence',
  evidence,
  '--url',
  'http://127.0.0.1:3198?fixed=1&dx=0.25',
  '--config',
  config,
  '--out-dir',
  output,
);
assert.equal(captured.ok, true, JSON.stringify(captured));
const directory = captured.runs[0].directory;
const selection = await repro(
  'frame',
  directory,
  '--checkpoint',
  'result',
  '--target',
  'target',
);
const context = PNG.sync.read(await readFile(selection.context));
const crop = PNG.sync.read(await readFile(selection.crop));
assert.equal(context.width, 2560);
assert.equal(context.height, 1440);
assert.equal(selection.requestedCrop.x, 56.25);
assert.equal(selection.pixelScale, 2);
assert.deepEqual(selection.pixelTransform, {
  x: 112,
  y: 112,
  width: 457,
  height: 216,
});
assert.deepEqual(
  { width: crop.width, height: crop.height },
  { width: 457, height: 216 },
);
// Every derived crop pixel must match its reported transform in the context.
for (let y = 0; y < crop.height; y++) {
  const start =
    ((y + selection.pixelTransform.y) * context.width +
      selection.pixelTransform.x) *
    4;
  assert.deepEqual(
    crop.data.subarray(y * crop.width * 4, (y + 1) * crop.width * 4),
    context.data.subarray(start, start + crop.width * 4),
  );
}
await repro('render', directory);
const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
const asset = (kind) =>
  join(directory, run.artifacts.find((a) => a.kind === kind).path);
const scene = JSON.parse(await readFile(asset('presentation-scene'), 'utf8'));
const hold = scene.segments.find(
  (entry) =>
    entry.checkpoint ===
    run.observations.find(
      (o) => o.checkpoint === 'result' && o.kind === 'screenshot',
    ).id,
);
const origin = scene.sourceOrigin;
const frame = join(output, 'checkpoint-hold.png');
await execute('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-ss',
  String((hold.outStartMs + hold.outDurationMs / 2) / 1000),
  '-i',
  asset('presentation-video'),
  '-frames:v',
  '1',
  frame,
]);
const pixels = PNG.sync.read(await readFile(frame));
assert.equal(pixels.width, scene.output.width);
assert.equal(pixels.height, scene.output.height);
const index = ((76 + origin.y) * pixels.width + 140 + origin.x) * 4;
assert.ok(
  pixels.data[index + 2] > pixels.data[index] + 40,
  'High-DPI checkpoint outline is misaligned in the normalized video',
);
// Input-relative opaque masks must also cover full-resolution, fractional edges.
if (privateTarget) {
  const mapping = JSON.parse(
    await readFile(asset('presentation-frame-map'), 'utf8'),
  );
  const source = mapping.find((entry) => entry.segmentId === hold.id);
  const still = PNG.sync.read(
    await readFile(
      join(
        directory,
        run.artifacts.find((a) => a.kind === 'presentation-frame-map').path,
        '..',
        source.asset,
      ),
    ),
  );
  const bounds = run.observations.find(
    (o) => o.kind === 'bounds' && o.target === 'target',
  ).bounds;
  for (
    let y = Math.floor(bounds.y * 2);
    y < Math.ceil((bounds.y + bounds.height) * 2);
    y++
  ) {
    for (
      let x = Math.floor(bounds.x * 2);
      x < Math.ceil((bounds.x + bounds.width) * 2);
      x++
    ) {
      const offset = (y * still.width + x) * 4;
      assert.ok(
        [0, 1, 2].every((channel) => still.data[offset + channel] === 0),
        `Exposed high-DPI mask pixel at ${x},${y}`,
      );
    }
  }
}
// Video retains the intended source position; private interiors are opaque.
const button = ((110 + origin.y) * pixels.width + 100 + origin.x) * 4;
assert.ok(
  privateTarget
    ? [0, 1, 2].every((channel) => pixels.data[button + channel] < 5)
    : pixels.data[button] > 200 &&
        Math.abs(pixels.data[button] - pixels.data[button + 2]) < 10,
);
const report = { passed: true, directory, selection, frame, privateTarget };
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
