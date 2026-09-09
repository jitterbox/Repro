/** Real Chromium acceptance through public CLI entry points, without fixture helpers. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { enforceOcrAudit } from '../../packages/render/dist/index.js';
import { verifyIdentityProof } from './identity-proof.mjs';
import { verifyDiagnosticReview } from './diagnostic-review.mjs';
import { verifyPortableViewer } from './portable-viewer.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const execute = promisify(execFile);
const root = resolve(
  process.env.REPRO_ACCEPTANCE_OUT ?? '.repro/public-acceptance',
);
await mkdir(root, { recursive: true });
const cli = resolve('packages/cli/dist/bin.js');
const example = resolve('packages/playwright/examples');
const measurements = [];
const { PNG } = createRequire(resolve('packages/evaluation/package.json'))(
  'pngjs',
);
async function repro(...args) {
  const start = performance.now();
  const { stdout } = await execute(process.execPath, [cli, ...args], {
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  measurements.push({
    command: args[0],
    durationMs: performance.now() - start,
  });
  return JSON.parse(stdout);
}
async function capture(role, dx = 0) {
  const result = await repro(
    'run',
    join(example, 'scenario.spec.ts'),
    '--playwright-config',
    join(example, 'playwright.config.ts'),
    '--evidence',
    join(example, role + '.json'),
    '--url',
    `http://127.0.0.1:3198${role === 'after' ? `?fixed=1&dx=${dx}` : ''}`,
    '--out-dir',
    join(root, `${role}-${dx}`),
  );
  assert.equal(result.ok, true, JSON.stringify(result.executionError));
  assert.equal(result.runs.length, 1);
  assert.equal(
    result.runs[0].run.scenarioOutcome,
    role === 'before' ? 'bug-reproduced' : 'fix-verified',
  );
  assert.ok(
    result.runs[0].run.stages.reviewPreparation.durationMs < 5000,
    'First-review preparation exceeded five seconds',
  );
  return result.runs[0];
}
console.log('Capturing designated failure and success');
const before = await capture('before');
const after = await capture('after');
const probeTiming = [];
for (const captured of [before, after]) {
  const run = JSON.parse(
    await readFile(join(captured.directory, 'run.json'), 'utf8'),
  );
  const trigger = run.steps.find((step) => step.id === 'trigger');
  const events = (
    await readFile(join(captured.directory, 'events.jsonl'), 'utf8')
  )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const pointer = events.find(
    (event) =>
      event.kind === 'probe.pointer:path' &&
      event.payload.phase === 'pointerdown',
  );
  assert.ok(pointer, 'Pointer recipient observation is missing');
  assert.equal(pointer.payload.captureClock.method, 'page-sampled');
  assert.ok(pointer.payload.captureClock.uncertaintyMs < 1000 / 30);
  assert.ok(
    pointer.t_mono >= trigger.startMs - 1000 / 15 &&
      pointer.t_mono <= trigger.endMs + 1000 / 15,
    'Probe event is not aligned with its execution step',
  );
  const sample = run.observations.find(
    (observation) => observation.kind === 'hit-test',
  );
  assert.equal(sample.data.diagnosticFrame.aligned, true);
  assert.ok(sample.artifact);
  assert.equal(sample.data.eventCorrelation.status, 'observed');
  const dispatch = sample.data.eventCorrelation.events.find(
    (event) => event.eventId === pointer.id,
  );
  assert.ok(dispatch, 'Actual dispatch must retain its source event reference');
  assert.equal(
    dispatch.recipient,
    run.variant.role === 'before' ? '#obstruction' : '#checkout',
  );
  assert.deepEqual(dispatch.point, {
    x: pointer.payload.x,
    y: pointer.payload.y,
  });
  probeTiming.push({
    role: run.variant.role,
    timeMs: pointer.t_mono,
    triggerStartMs: trigger.startMs,
    triggerEndMs: trigger.endMs,
    calibration: pointer.payload.captureClock,
    dispatch,
  });
}
const comparison = await repro(
  'compare',
  before.directory,
  after.directory,
  '--out',
  join(root, 'comparison.json'),
);
assert.equal(comparison.ok, true);
const frame = await repro(
  'frame',
  after.directory,
  '--checkpoint',
  'result',
  '--target',
  'target',
);
assert.equal(frame.cropTransform.width, 228);
assert.ok((await readFile(frame.context)).byteLength > 0);
for (const dx of [1, 4, 12]) {
  console.log(
    `Measuring ${dx} CSS-pixel displacement from captured browser bounds`,
  );
  const shifted = await capture('after', dx);
  const result = await repro(
    'compare',
    before.directory,
    shifted.directory,
    '--out',
    join(root, `comparison-${dx}.json`),
  );
  assert.ok(result.geometryDeltas.some((delta) => delta.dx === dx));
}
console.log('Rendering presentation and verifying unchanged render reuse');
await repro('render', before.directory);
await repro('render', after.directory);
const repeat = await repro('render', before.directory);
assert.equal(repeat.cacheHit, true);
console.log('Revising presentation without changing captured evidence');
const originalManifest = JSON.parse(
  await readFile(join(after.directory, 'run.json'), 'utf8'),
);
const capturedArtifacts = originalManifest.artifacts.filter(
  (asset) =>
    !asset.kind.startsWith('presentation-') && asset.kind !== 'captions',
);
const revised = JSON.parse(await readFile(join(example, 'after.json'), 'utf8'));
revised.title = 'Checkout proof revised';
revised.steps[0].title = 'Open the checkout scenario';
const revisedPath = join(root, 'revised-evidence.json');
await writeFile(revisedPath, JSON.stringify(revised));
const edited = await repro(
  'render',
  after.directory,
  '--evidence',
  revisedPath,
);
assert.equal(edited.cacheHit, false);
const revisedManifest = JSON.parse(
  await readFile(join(after.directory, 'run.json'), 'utf8'),
);
assert.deepEqual(
  revisedManifest.artifacts.filter(
    (asset) =>
      !asset.kind.startsWith('presentation-') && asset.kind !== 'captions',
  ),
  capturedArtifacts,
);
assert.ok(
  (
    await readFile(
      join(
        after.directory,
        revisedManifest.artifacts.find((asset) => asset.kind === 'captions')
          .path,
      ),
      'utf8',
    )
  ).includes('Checkout proof revised'),
);
console.log('Verifying actual checkpoint pixels, titles, step and outcome');
const stillPath = join(
  after.directory,
  revisedManifest.artifacts.find((asset) => asset.kind === 'presentation-image')
    .path,
);
const still = PNG.sync.read(await readFile(stillPath));
const context = PNG.sync.read(await readFile(frame.context));
assert.equal(still.width, context.width);
assert.equal(still.height, context.height);
// The control's interior must retain the exact checkpoint pixels; outlines are outside it.
for (let y = 90; y < 130; y++)
  for (let x = 100; x < 240; x++) {
    const offset = (y * context.width + x) * 4;
    assert.deepEqual(
      still.data.subarray(offset, offset + 4),
      context.data.subarray(offset, offset + 4),
    );
  }
const outline = (74 * still.width + 74) * 4;
assert.ok(
  still.data[outline + 2] > still.data[outline] + 40,
  'Measured outline is missing from checkpoint pixels',
);
const { stdout: visibleText } = await execute('tesseract', [
  stillPath,
  'stdout',
  '--psm',
  '3',
]);
assert.match(visibleText, /Checkout proof revised/);
assert.match(visibleText, /After/);
assert.match(visibleText, /Fix verified/);
await assert.rejects(
  enforceOcrAudit({
    path: stillPath,
    redaction: { strict: true, masks: [] },
    requireAudit: true,
    patterns: ['Fix verified'],
  }),
  /OCR audit found text/,
);
assert.match(visibleText, /3\. Verify the Checkout heading/);
console.log(
  'Inspecting the exact checkpoint reading hold in decoded video pixels',
);
const holdMetadata = JSON.parse(
  await readFile(
    join(
      after.directory,
      revisedManifest.artifacts.find(
        (asset) => asset.kind === 'presentation-holds',
      ).path,
    ),
    'utf8',
  ),
);
const resultHold = holdMetadata.find((hold) => hold.checkpoint === 'result');
assert.ok(resultHold, 'Measured checkpoint has no reading hold');
const heldFrame = join(root, 'checkpoint-hold.png');
await execute('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-ss',
  String((resultHold.startMs + resultHold.endMs) / 2000),
  '-i',
  join(
    after.directory,
    revisedManifest.artifacts.find(
      (asset) => asset.kind === 'presentation-video',
    ).path,
  ),
  '-frames:v',
  '1',
  heldFrame,
]);
const heldPixels = PNG.sync.read(await readFile(heldFrame));
assert.equal(heldPixels.width, still.width);
assert.ok(
  heldPixels.data[outline + 2] > heldPixels.data[outline] + 40,
  'Measured outline is missing from the video reading hold',
);
const { stdout: holdText } = await execute('tesseract', [
  heldFrame,
  'stdout',
  '--psm',
  '3',
]);
assert.match(holdText, /Checkout proof revised/);
assert.match(holdText, /Fix verified/);
assert.match(holdText, /3\. Verify the Checkout heading/);
const editedRepeat = await repro(
  'render',
  after.directory,
  '--evidence',
  revisedPath,
);
assert.equal(editedRepeat.cacheHit, true);

const presentationDurations = [];
for (const captured of [before, after]) {
  const manifest = JSON.parse(
    await readFile(join(captured.directory, 'run.json'), 'utf8'),
  );
  const artifact = (kind) =>
    join(
      captured.directory,
      manifest.artifacts.find(
        (asset) => asset.kind === kind || asset.kind.startsWith(`${kind}:`),
      ).path,
    );
  const plan = JSON.parse(await readFile(artifact('presentation-key'), 'utf8'));
  const expectedMs = Math.max(
    ...plan.timeline.beats.map((beat) => beat.outStartMs + beat.outDurationMs),
  );
  const duration = async (path) =>
    Number(
      (
        await execute('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          path,
        ])
      ).stdout.trim(),
    ) * 1000;
  const actualMs = await duration(artifact('presentation-video'));
  assert.ok(
    Math.abs(actualMs - expectedMs) <= 1000 / 30 + 0.01,
    'Presentation end differs from its published timeline',
  );
  const originalMs = await duration(artifact('recording'));
  assert.equal(comparison.originalDurations[manifest.variant.role], originalMs);
  presentationDurations.push({
    role: manifest.variant.role,
    expectedMs,
    actualMs,
    originalMs,
  });
}
const identityControls = await verifyIdentityProof(
  before.directory,
  after.directory,
  join(root, 'identity-controls'),
);
const diagnosticReviews = [];
for (const captured of [before, after]) {
  const run = JSON.parse(
    await readFile(join(captured.directory, 'run.json'), 'utf8'),
  );
  const sample = run.observations.find((o) => o.kind === 'hit-test');
  const image = run.artifacts.find(
    (a) =>
      a.kind === 'presentation-image' &&
      a.path.endsWith(`diagnostic-${sample.id}.png`),
  );
  assert.ok(image, 'Measured diagnostic image was not rendered');
  const recognized = [];
  for (const psm of ['3', '11'])
    recognized.push(
      (
        await execute('tesseract', [
          join(captured.directory, image.path),
          'stdout',
          '--psm',
          psm,
        ])
      ).stdout,
    );
  assert.ok(
    recognized.join(' ').includes('Sampled recipient'),
    'Diagnostic outline label missing from actual pixels',
  );
  diagnosticReviews.push(
    await verifyDiagnosticReview(
      captured.directory,
      join(root, `diagnostic-${run.variant.role}`),
    ),
  );
}
console.log('Auditing output pixels and packaging proof');
const exported = await repro(
  'export',
  after.directory,
  '--baseline',
  before.directory,
  '--out-dir',
  join(root, 'bundle'),
);
assert.ok(exported.manifest.compare.syncMap.length >= 3);
assert.deepEqual(
  exported.manifest.assets
    .filter((asset) => asset.kind === 'mp4')
    .map((asset) => asset.role),
  ['before', 'after'],
);
for (const asset of exported.manifest.assets) {
  assert.ok(!asset.path.startsWith('/'));
  assert.ok(['mp4', 'vtt', 'png', 'json'].includes(asset.kind));
}
console.log(
  'Checking relocated viewer, captions, images and keyboard controls',
);
const portable = await verifyPortableViewer(
  join(root, 'bundle'),
  join(root, 'portable'),
);
await writeFile(
  join(root, 'acceptance.json'),
  JSON.stringify(
    {
      passed: true,
      before: before.directory,
      after: after.directory,
      comparison,
      frame,
      measurements,
      probeTiming,
      diagnosticReviews,
      identityControls,
      presentationDurations,
      exported,
      portable,
    },
    null,
    2,
  ),
);
console.log(`Acceptance passed: ${join(root, 'acceptance.json')}`);
