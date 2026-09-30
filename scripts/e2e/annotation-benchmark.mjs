/** Public CLI annotation edits over identical captured pixels; no recapture or export. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  enumerateFonts,
  implementationDigest,
} from '../../packages/core/dist/index.js';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = resolve(
  process.argv[2] ??
    JSON.parse(
      await readFile('.repro/public-acceptance/acceptance.json', 'utf8'),
    ).after,
);
const cli = resolve(
  process.env.REPRO_BENCHMARK_CLI ?? 'packages/cli/dist/bin.js',
);
const require = createRequire(await realpath(cli));
const pipelineRequire = createRequire(
  require.resolve('@jitterbox/repro-pipeline'),
);
const root = resolve(
  process.env.REPRO_BENCHMARK_OUT ?? '.repro/annotation-benchmark',
);
await mkdir(root, { recursive: true });
const attempt = await mkdtemp(join(root, 'attempt-'));
const directory = join(attempt, 'run');
await cp(source, directory, { recursive: true });
const original = JSON.parse(
  await readFile(join(directory, 'run.json'), 'utf8'),
);
const spec = JSON.parse(
  await readFile(join(directory, 'evidence.json'), 'utf8'),
);
const inputs = original.artifacts.filter(
  (a) => !a.kind.startsWith('presentation-') && a.kind !== 'captions',
);
async function verifyInputs() {
  for (const artifact of inputs)
    assert.equal(
      hash(await readFile(join(directory, artifact.path))),
      artifact.sha256,
    );
}
await verifyInputs();
const report = {
  schemaVersion: 1,
  completed: false,
  kind: 'annotation-only-cli-edit',
  baseline: null,
  approvedBaselineCommit: null,
  attempt,
  cli,
  implementations: Object.fromEntries(
    [
      '@jitterbox/repro-cli',
      '@jitterbox/repro-pipeline',
      '@jitterbox/repro-render',
      '@jitterbox/repro-core',
      '@jitterbox/repro-contracts',
    ].map((name) => [
      name,
      implementationDigest(
        name === '@jitterbox/repro-cli' ? cli : pipelineRequire.resolve(name),
      ),
    ]),
  ),
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpus: cpus().map(({ model }) => model),
    ffmpeg: (await execute('ffmpeg', ['-version'])).stdout,
    fonts: await enumerateFonts(),
  },
  inputIdentity: hash(JSON.stringify({ spec, inputs })),
  samples: [],
};
const save = () =>
  writeFile(join(attempt, 'benchmark.json'), JSON.stringify(report, null, 2));
await save();
for (const label of [
  'Warmup',
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
  'Foxtrot',
  'Golf',
]) {
  const edit = { ...spec, title: `Checkout annotation ${label}` };
  const evidence = join(attempt, `${label}.json`);
  await writeFile(evidence, JSON.stringify(edit));
  const start = performance.now();
  const { stdout } = await execute(
    process.execPath,
    [cli, 'render', directory, '--evidence', evidence],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const durationMs = performance.now() - start;
  const result = JSON.parse(stdout);
  await writeFile(join(attempt, `${label}-result.json`), stdout);
  assert.ok(result.receipt.sceneSha256, 'Every edit produces a scene identity');
  const current = JSON.parse(
    await readFile(join(directory, 'run.json'), 'utf8'),
  );
  assert.deepEqual(current.stages.capture, original.stages.capture);
  await verifyInputs();
  const image = current.artifacts.find((a) => a.kind === 'presentation-image');
  assert.ok(image);
  const scene = JSON.parse(
    await readFile(join(result.directory, 'scene.json'), 'utf8'),
  );
  assert.equal(
    scene.cues.find((cue) => cue.kind === 'title').title,
    edit.title,
  );
  const x = scene.style.outerInset,
    y = scene.style.outerInset,
    width = scene.viewport.width,
    height = scene.sourceOrigin.y - y - 8;
  const titlePixels = join(attempt, `${label}-title.png`);
  // Inspect the rendered title region; whole-page segmentation can omit a slate.
  await execute('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    join(directory, image.path),
    '-vf',
    `crop=${Math.floor(width)}:${Math.floor(height)}:${Math.floor(x)}:${Math.floor(y)},scale=iw*2:ih*2`,
    '-frames:v',
    '1',
    titlePixels,
  ]);
  const { stdout: text } = await execute('tesseract', [
    titlePixels,
    'stdout',
    '--psm',
    '7',
  ]);
  await writeFile(join(attempt, `${label}-title.txt`), text);
  assert.ok(
    text.includes(label),
    `Actual checkpoint pixels must contain ${label}`,
  );
  const video = current.artifacts.find((a) => a.kind === 'presentation-video');
  assert.ok(video);
  assert.equal(hash(await readFile(join(directory, video.path))), video.sha256);
  report.samples.push({
    label,
    warmup: label === 'Warmup',
    durationMs,
    renderDurationMs: current.stages.presentation.durationMs,
    imageSha256: image.sha256,
    videoSha256: video.sha256,
  });
  await save();
  console.log(`${label}: ${Math.round(durationMs)} ms`);
}
const values = report.samples
  .filter((s) => !s.warmup)
  .map((s) => s.durationMs)
  .sort((a, b) => a - b);
report.medianMs = values[Math.floor(values.length / 2)];
report.completed = true;
report.performanceGate =
  'unassessed: compare receipts only within the same pinned scene renderer environment';
await save();
console.log(
  JSON.stringify({
    report: join(attempt, 'benchmark.json'),
    medianMs: report.medianMs,
  }),
);
