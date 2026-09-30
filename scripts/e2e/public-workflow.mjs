/** Real Chromium acceptance through public CLI entry points, without fixture helpers. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { enforceOcrAudit } from '../../packages/render/dist/index.js';
import { verifyIdentityProof } from './identity-proof.mjs';
import { verifyDiagnosticReview } from './diagnostic-review.mjs';
import { verifySceneSources } from './scene-source-checks.mjs';
import { verifyTerminalCheckpoint } from './terminal-checkpoint.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { devToolsReportSchema } from '../../packages/contracts/dist/index.js';
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
    '--verbose',
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
console.log('Rendering and checking the sole compositor');
const renderedBefore = await repro('render', before.directory);
const original = JSON.parse(
  await readFile(join(after.directory, 'run.json'), 'utf8'),
);
const captureArtifacts = (run) =>
  run.artifacts.filter(
    (a) =>
      !a.kind.startsWith('presentation-') &&
      a.kind !== 'captions' &&
      !a.kind.startsWith('scene-comparison'),
  );
const revised = JSON.parse(await readFile(join(example, 'after.json'), 'utf8'));
revised.title = 'Checkout proof revised';
revised.steps[0].title = 'Open the checkout scenario';
const revisedPath = join(root, 'revised-evidence.json');
await writeFile(revisedPath, JSON.stringify(revised));
const renderedAfter = await repro(
  'render',
  after.directory,
  '--evidence',
  revisedPath,
);
const current = JSON.parse(
  await readFile(join(after.directory, 'run.json'), 'utf8'),
);
assert.deepEqual(
  captureArtifacts(current),
  captureArtifacts(original),
  'Presentation changes must preserve every captured artifact',
);
assert.deepEqual(current.stages.capture, original.stages.capture);
const checkedBefore = await verifySceneSources(
  before.directory,
  renderedBefore,
);
const checkedAfter = await verifySceneSources(after.directory, renderedAfter);
const forged = structuredClone(checkedAfter.mapping);
forged.find((f) => f.sourceSha256).sourceSha256 = '0'.repeat(64);
await assert.rejects(
  verifySceneSources(after.directory, renderedAfter, forged),
  /Unknown source identity/,
);
const stillPath = join(renderedAfter.directory, 'result.png');
async function ocrRegion(image, rect, name) {
  const target = join(root, `${name}.png`);
  await execute('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    image,
    '-vf',
    `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y},scale=iw*2:ih*2`,
    '-frames:v',
    '1',
    target,
  ]);
  return (
    await execute('tesseract', [target, 'stdout', '--psm', '6'])
  ).stdout.replace(/\s+/g, ' ');
}
const titleText = await ocrRegion(
  stillPath,
  { x: 24, y: 30, width: 1200, height: 50 },
  'title-text',
);
assert.ok(titleText.includes('Checkout proof revised'), titleText);
const gutterText = await ocrRegion(
  stillPath,
  { x: 1328, y: 0, width: 336, height: 960 },
  'gutter-text',
);
for (const label of [
  'Verify the Checkout heading',
  'Intended Checkout control',
])
  assert.ok(gutterText.includes(label), gutterText);
const outcomeCue = checkedAfter.scene.cues.find((c) => c.kind === 'outcome');
const outcomeImage = join(
  renderedAfter.directory,
  'frames',
  `frame_${String(Math.ceil(((outcomeCue.startMs + 400) * 30) / 1000)).padStart(6, '0')}.png`,
);
const outcomeText = await ocrRegion(
  outcomeImage,
  { x: 1328, y: 0, width: 336, height: 960 },
  'outcome-text',
);
assert.ok(outcomeText.includes('Fix verified'), outcomeText);
await assert.rejects(
  enforceOcrAudit({
    path: outcomeImage,
    redaction: { strict: true, masks: [] },
    requireAudit: true,
    patterns: ['Fix verified'],
  }),
  /OCR audit found text/,
);
const context = PNG.sync.read(await readFile(frame.context));
const still = PNG.sync.read(await readFile(stillPath));
const origin = checkedAfter.scene.sourceOrigin;
assert.equal(still.width, checkedAfter.scene.output.width);
assert.equal(still.height, checkedAfter.scene.output.height);
// Keep a cursor-free interior tile of the actual control pixel-identical.
for (let y = 110; y < 130; y++)
  for (let x = 100; x < 130; x++) {
    const src = (y * context.width + x) * 4,
      dst = ((y + origin.y) * still.width + x + origin.x) * 4;
    assert.deepEqual(
      still.data.subarray(dst, dst + 4),
      context.data.subarray(src, src + 4),
    );
  }
const diagnosticReviews = [],
  presentationDurations = [];
for (const [captured, rendered] of [
  [before, renderedBefore],
  [after, renderedAfter],
]) {
  const role = captured === before ? 'before' : 'after';
  await verifyTerminalCheckpoint(
    captured.directory,
    join(root, `terminal-${role}`),
  );
  diagnosticReviews.push(
    await verifyDiagnosticReview(
      captured.directory,
      join(root, `diagnostic-${role}`),
    ),
  );
  const actualMs =
    Number(
      (
        await execute('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          rendered.outputPath,
        ])
      ).stdout.trim(),
    ) * 1000;
  assert.ok(
    Math.abs(actualMs - rendered.receipt.durationMs) <= 1000 / 30 + 0.01,
  );
  presentationDurations.push({
    role,
    actualMs,
    expectedMs: rendered.receipt.durationMs,
  });
}
// Repeat the same presentation: randomized seeking and source identity must agree.
const repeated = await repro(
  'render',
  after.directory,
  '--evidence',
  revisedPath,
);
assert.equal(repeated.receipt.sceneSha256, renderedAfter.receipt.sceneSha256);
assert.deepEqual(
  JSON.parse(
    await readFile(join(repeated.directory, 'frame-map.json'), 'utf8'),
  ),
  checkedAfter.mapping,
);
const paired = await repro(
  'render',
  after.directory,
  '--baseline',
  before.directory,
);
const pairMap = JSON.parse(await readFile(paired.frameMap, 'utf8'));
assert.equal(pairMap.length, paired.receipt.frameCount);
for (const f of pairMap) {
  assert.deepEqual(f.a.source, checkedBefore.mapping[f.a.outputFrame]);
  assert.deepEqual(f.b.source, checkedAfter.mapping[f.b.outputFrame]);
}
// These are explicit capability boundaries, never weakened privacy gates.
await assert.rejects(
  repro('export', after.directory, '--out-dir', join(root, 'not-final')),
  /visual acceptance/,
);
await assert.rejects(
  repro(
    'export',
    after.directory,
    '--baseline',
    before.directory,
    '--draft',
    '--out-dir',
    join(root, 'not-paired'),
  ),
  /occurrence-aware/,
);
const exported = [];
for (const [captured, rendered] of [
  [before, renderedBefore],
  [after, repeated],
]) {
  const role = captured === before ? 'before' : 'after',
    bundle = join(root, role === 'after' ? 'bundle' : 'bundle-before');
  const result = await repro(
    'export',
    captured.directory,
    '--draft',
    '--out-dir',
    bundle,
  );
  const data = result.manifest.assets.find((a) => a.kind === 'devtools'),
    video = result.manifest.assets.find((a) => a.kind === 'mp4');
  assert.ok(data && video);
  const report = devToolsReportSchema.parse(
    JSON.parse(await readFile(join(bundle, data.path), 'utf8')),
  );
  assert.equal(report.video, basename(video.path));
  assert.equal(report.variant.role, role);
  assert.equal(report.frames.length, rendered.receipt.frameCount);
  assert.ok(report.events.length > 0);
  for (const asset of result.manifest.assets) {
    assert.ok(!asset.path.startsWith('/'));
    assert.ok(['mp4', 'vtt', 'png', 'json', 'devtools'].includes(asset.kind));
  }
  exported.push(result);
}
const identityControls = await verifyIdentityProof(
  before.directory,
  after.directory,
  join(root, 'identity-controls'),
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
      exported: exported[1],
      exports: exported,
      paired,
    },
    null,
    2,
  ),
);
console.log(`Acceptance passed: ${join(root, 'acceptance.json')}`);
