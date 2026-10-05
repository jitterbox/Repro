/** Public captures and actual decoded pixels; values below are deliberate privacy canaries. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const execute = promisify(execFile);
const { PNG } = createRequire(resolve('packages/evaluation/package.json'))(
  'pngjs',
);
const output = resolve(
  process.env.REPRO_PRIVACY_OUT ?? '.repro/moving-privacy',
);
await mkdir(output, { recursive: true });
async function invoke(...args) {
  try {
    const result = await execute(
      process.execPath,
      [resolve('packages/cli/dist/bin.js'), ...args],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return { code: 0, result: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      code: error.code,
      result: JSON.parse(error.stdout || error.stderr),
    };
  }
}
async function capture(evidence, name) {
  const captured = await invoke(
    'run',
    'packages/playwright/examples/privacy.spec.ts',
    '--playwright-config',
    'packages/playwright/examples/privacy.config.ts',
    '--evidence',
    evidence,
    '--out-dir',
    join(output, name),
  );
  assert.equal(captured.code, 0, JSON.stringify(captured));
  assert.equal(captured.result.ok, true);
  assert.equal(captured.result.runs.length, 1);
  return captured.result.runs[0].directory;
}
const directory =
  process.env.REPRO_PRIVACY_REUSE_RUN ??
  (await capture('packages/playwright/examples/privacy.json', 'protected'));
const rendered = await invoke('render', directory);
assert.equal(rendered.code, 0, JSON.stringify(rendered));
const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
const mapping = JSON.parse(
  await readFile(join(rendered.result.directory, 'frame-map.json'), 'utf8'),
);
const scene = JSON.parse(
  await readFile(join(rendered.result.directory, 'scene.json'), 'utf8'),
);
const events = (await readFile(join(directory, 'events.jsonl'), 'utf8'))
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const measurements = [];
for (const checkpoint of ['untouched', 'moved', 'scrolled', 'popup']) {
  const bound = run.observations.find(
    (o) => o.checkpoint === checkpoint && o.kind === 'bounds',
  );
  assert.equal(bound.status, 'passed');
  const box = bound.bounds;
  // Every position, including untouched content and a separate page, must have
  // been sampled without clicking or typing in the private field.
  assert.ok(
    events.some(
      (e) =>
        e.kind === 'probe.redaction.mask' &&
        e.pageId === bound.pageId &&
        ['x', 'y', 'width', 'height'].every(
          (key) => Math.abs(e.payload[key] - box[key]) < 0.01,
        ),
    ),
    `Missing measured mask for ${checkpoint}`,
  );
  const source = run.observations.find(
    (o) => o.checkpoint === checkpoint && o.kind === 'screenshot',
  );
  const asset = run.artifacts.find(
    (a) =>
      a.kind === 'presentation-image' &&
      basename(a.path) === `${checkpoint}.png`,
  );
  assert.ok(asset, `Missing rendered ${checkpoint}`);
  const raw = PNG.sync.read(await readFile(join(directory, source.artifact)));
  const hold = scene.segments.find((s) => s.checkpoint === source.id);
  const sourceFrame = mapping.find((f) => f.segmentId === hold.id);
  const protectedImage = PNG.sync.read(
    await readFile(join(rendered.result.directory, sourceFrame.asset)),
  );
  assert.equal(raw.width, protectedImage.width);
  assert.equal(raw.height, protectedImage.height);
  let changed = 0;
  let examined = 0;
  // Exclude the border/outline. Changes inside the text region must come from
  // redaction; a target highlight alone cannot pass this pixel measurement.
  for (let y = Math.ceil(box.y + 12); y < box.y + box.height - 12; y++) {
    for (let x = Math.ceil(box.x + 12); x < box.x + box.width - 12; x++) {
      const index = (y * raw.width + x) * 4;
      if ([0, 1, 2].some((channel) => raw.data[index + channel] < 48))
        assert.ok(
          [0, 1, 2].every(
            (channel) => protectedImage.data[index + channel] > 96,
          ),
          `Private text remained readable at ${checkpoint}: ${x},${y}`,
        );
      if (
        [0, 1, 2].some(
          (channel) =>
            Math.abs(
              raw.data[index + channel] - protectedImage.data[index + channel],
            ) > 20,
        )
      )
        changed++;
      examined++;
    }
  }
  assert.ok(
    changed / examined > 0.05,
    `Private text pixels were not redacted at ${checkpoint}`,
  );
  measurements.push({
    checkpoint,
    pageId: bound.pageId,
    box,
    changedFraction: changed / examined,
  });
}
assert.equal(new Set(measurements.map((m) => m.pageId)).size, 2);
assert.equal(new Set(measurements.map((m) => `${m.box.x},${m.box.y}`)).size, 4);
// Measure every presentation frame through continuous motion, before the final checkpoint outline.
const motion = events.filter(
  (e) =>
    e.kind === 'probe.redaction.mask' &&
    e.pageId === 'page-1' &&
    e.payload.x > 80 &&
    e.payload.x < 500 &&
    e.payload.y > 200 &&
    e.payload.y < 330,
);
assert.ok(motion.length >= 8, 'Continuous motion samples missing');
const presentation = run.artifacts.find((a) =>
  a.kind.startsWith('presentation-key:'),
);
assert.ok(presentation);
const plan = JSON.parse(
  await readFile(join(directory, presentation.path), 'utf8'),
);
assert.equal(plan.metadata.redactionMethod, 'blur-v1');
assert.ok(
  plan.redactionRects.length <= 2,
  'Selector motion should have bounded region count',
);
const motionFrames = mapping.filter(
  (frame) =>
    frame.sourceMs >= motion[0].t_mono &&
    frame.sourceMs <= motion.at(-1).t_mono &&
    scene.segments.find((s) => s.id === frame.segmentId)?.kind === 'play',
);
assert.ok(motionFrames.length >= 8, 'Recorded motion must remain in playback');
const firstFrame = motionFrames[0].frame;
const lastFrame = motionFrames.at(-1).frame;
assert.equal(motionFrames.length, lastFrame - firstFrame + 1);
assert.ok(lastFrame - firstFrame >= 8);
const video = run.artifacts.find((a) => a.kind === 'presentation-video');
assert.ok(video);
const movingPixels = await execute(
  'ffmpeg',
  [
    '-v',
    'error',
    '-i',
    join(directory, video.path),
    '-vf',
    `select='between(n,${firstFrame},${lastFrame})',crop=980:162:${100 + scene.sourceOrigin.x}:${216 + scene.sourceOrigin.y},format=rgb24`,
    '-fps_mode',
    'passthrough',
    '-f',
    'rawvideo',
    'pipe:1',
  ],
  { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
);
const frameBytes = 980 * 162 * 3;
assert.equal(
  movingPixels.stdout.length,
  (lastFrame - firstFrame + 1) * frameBytes,
);
let dark = 0;
for (const channel of movingPixels.stdout) if (channel < 32) dark++;
assert.ok(
  dark / movingPixels.stdout.length < 0.002,
  'Residual private strokes during continuous motion',
);
const continuousMotion = {
  samples: motion.length,
  frames: lastFrame - firstFrame + 1,
  firstFrame,
  lastFrame,
  regions: plan.redactionRects.length,
};
const exported = await invoke(
  'export',
  '--draft',
  directory,
  '--out-dir',
  join(output, 'bundle'),
);
assert.equal(exported.code, 0, JSON.stringify(exported));
for (const asset of exported.result.manifest.assets) {
  assert.ok(['mp4', 'png', 'vtt', 'json', 'devtools'].includes(asset.kind));
  assert.ok(
    !asset.path.includes('capture.mp4') &&
      !asset.path.includes('events.jsonl') &&
      !asset.path.includes('trace.zip'),
  );
  if (['vtt', 'json', 'devtools'].includes(asset.kind)) {
    assert.ok(
      !(await readFile(join(output, 'bundle', asset.path), 'utf8')).includes(
        'moving.canary@example.test',
      ),
    );
  }
}
// Negative control uses the same app and assertions with no selector mask.
// Strict OCR must reject the actual visible canary, not trust the sidecars.
const unmasked = JSON.parse(
  await readFile('packages/playwright/examples/privacy.json', 'utf8'),
);
unmasked.privacy.selectors = [];
const unmaskedSpec = join(output, 'unmasked.json');
await writeFile(unmaskedSpec, JSON.stringify(unmasked, null, 2));
const unmaskedDirectory = await capture(unmaskedSpec, 'negative');
const negativeRender = await invoke('render', unmaskedDirectory);
assert.equal(negativeRender.code, 0, JSON.stringify(negativeRender));
const rejected = await invoke(
  'export',
  '--draft',
  unmaskedDirectory,
  '--out-dir',
  join(output, 'rejected-bundle'),
);
assert.notEqual(
  rejected.code,
  0,
  'Unmasked private text unexpectedly exported',
);
assert.match(JSON.stringify(rejected.result), /OCR audit found text/);
const report = {
  passed: true,
  directory,
  measurements,
  continuousMotion,
  exported: exported.result,
  negativeControl: { directory: unmaskedDirectory, rejected },
};
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify(report, null, 2),
);
console.log(
  `Moving privacy acceptance passed: ${join(output, 'acceptance.json')}`,
);
