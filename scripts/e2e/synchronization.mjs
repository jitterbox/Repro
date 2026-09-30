/** Real browser color checkpoints and unequal application delays, through public CLI entry points. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { verifySceneSources } from './scene-source-checks.mjs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const { PNG } = createRequire(import.meta.url)(
  '../../packages/evaluation/node_modules/pngjs',
);
const output = resolve(process.env.REPRO_SYNC_OUT ?? '.repro/synchronization');
await mkdir(output, { recursive: true });
async function repro(...args) {
  const result = await execute(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), ...args],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(result.stdout);
}
const reused = process.env.REPRO_SYNC_REUSE
  ? JSON.parse(await readFile(process.env.REPRO_SYNC_REUSE, 'utf8'))
  : null;
const runs = [];
for (const role of ['before', 'after']) {
  if (reused) {
    runs.push(reused[role]);
    continue;
  }
  const spec = {
    schemaVersion: '1.0.0',
    id: 'uneven-sequence',
    title: 'Uneven sequence reaches Complete',
    variant: { id: role, role, label: role === 'before' ? 'Before' : 'After' },
    claim:
      'The same sequence reaches Complete after the fix despite unequal intermediate delays',
    expected: 'Finish changes the heading to Complete',
    targets: [{ id: 'state', description: 'Measured color-state panel' }],
    steps: [
      { id: 'prepare', title: 'Open the pending sequence' },
      { id: 'blue', title: 'Begin and observe blue', trigger: true },
      { id: 'green', title: 'Continue and observe green' },
      { id: 'red', title: 'Finish and observe red' },
      { id: 'verify', title: 'Verify the Complete heading' },
    ],
    checkpoints: ['blue', 'green', 'red', 'result'].map((id) => ({
      id,
      step: id === 'result' ? 'verify' : id,
      title: id === 'result' ? 'Sequence outcome' : `${id} state`,
      targets: ['state'],
      observations: ['screenshot', 'bounds', 'assertion'],
    })),
    outputs: ['png', 'mp4', 'review'],
    privacy: { strict: true },
  };
  const evidence = join(output, `${role}.json`);
  await writeFile(evidence, JSON.stringify(spec, null, 2));
  const captured = await repro(
    'run',
    '--verbose',
    'packages/playwright/examples/sync.spec.ts',
    '--playwright-config',
    'packages/playwright/examples/sync.config.ts',
    '--evidence',
    evidence,
    '--url',
    `http://127.0.0.1:3195${role === 'after' ? '?fixed=1' : ''}`,
    '--out-dir',
    output,
  );
  assert.equal(captured.ok, true);
  assert.equal(captured.runs.length, 1);
  runs.push(captured.runs[0].directory);
}
const [before, after] = runs;
const comparison = await repro('compare', before, after);
assert.equal(comparison.ok, true, JSON.stringify(comparison));
assert.equal(comparison.matched.length, 4);
assert.equal(comparison.composition.sync.knots.length, 6);
const left = reused?.left ?? (await repro('render', before)),
  right = reused?.right ?? (await repro('render', after));
const checked = [
  await verifySceneSources(before, left),
  await verifySceneSources(after, right),
];
const rendered =
  reused?.rendered ?? (await repro('render', after, '--baseline', before));
await writeFile(
  join(output, 'render-inputs.json'),
  JSON.stringify({ before, after, left, right, rendered }),
);
const mapping = JSON.parse(await readFile(rendered.frameMap, 'utf8'));
assert.equal(mapping.length, rendered.receipt.frameCount);
const origin = checked[0].scene.sourceOrigin;
const paneWidth = checked[0].scene.output.width;
async function decode(path, source = false) {
  const result = await execute(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-filter_complex',
      source
        ? '[0:v]crop=16:16:80:300,scale=1:1,split[left][right];[left][right]hstack,format=rgb24[out]'
        : `[0:v]split[a][b];[a]crop=16:16:${origin.x + 80}:${origin.y + 364},scale=1:1[left];[b]crop=16:16:${paneWidth + 24 + origin.x + 80}:${origin.y + 364},scale=1:1[right];[left][right]hstack,format=rgb24[out]`,
      '-map',
      '[out]',
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
  );
  const classify = (rgb) => {
    const channels = [...rgb],
      peak = Math.max(...channels);
    return peak > 180 && channels.filter((v) => v < 60).length === 2
      ? ['red', 'green', 'blue'][channels.indexOf(peak)]
      : 'other';
  };
  const frames = [];
  for (let i = 0; i < result.stdout.length; i += 6)
    frames.push([
      classify(result.stdout.subarray(i, i + 3)),
      classify(result.stdout.subarray(i + 3, i + 6)),
    ]);
  return frames;
}
const frames = await decode(rendered.outputPath);
// Compare every decoded pane sample with the independently read sanitized PNG
// named in the source mapping. No interpolation or coarse duration ratio can pass.
const classify = (rgb) => {
  const channels = [...rgb],
    peak = Math.max(...channels);
  return peak > 180 && channels.filter((v) => v < 60).length === 2
    ? ['red', 'green', 'blue'][channels.indexOf(peak)]
    : 'other';
};
const cache = new Map();
async function sourceColor(pane, entry) {
  if (!entry.source?.asset) return 'other';
  const path = join(
    pane === 0 ? left.directory : right.directory,
    entry.source.asset,
  );
  if (!cache.has(path)) {
    const pixels = PNG.sync.read(await readFile(path));
    const at = (300 * pixels.width + 80) * 4;
    cache.set(path, classify(pixels.data.subarray(at, at + 3)));
  }
  return cache.get(path);
}
assert.equal(frames.length, mapping.length);
const expected = [];
for (const [i, mapped] of mapping.entries()) {
  assert.deepEqual(mapped.a.source, checked[0].mapping[mapped.a.outputFrame]);
  assert.deepEqual(mapped.b.source, checked[1].mapping[mapped.b.outputFrame]);
  const colors = [
    await sourceColor(0, mapped.a),
    await sourceColor(1, mapped.b),
  ];
  assert.deepEqual(
    frames[i],
    colors,
    `Incorrect source pixels at paired frame ${i}`,
  );
  expected.push(colors);
}
const checkpoints = [];
for (const point of comparison.matched) {
  // Resolve checkpoint identity from observations, not numeric position.
  const runsMeta = await Promise.all(
    [before, after].map(async (dir) =>
      JSON.parse(await readFile(join(dir, 'run.json'), 'utf8')),
    ),
  );
  const ids = runsMeta.map(
    (run) =>
      run.observations.find(
        (o) => o.checkpoint === point.id && o.kind === 'screenshot',
      ).id,
  );
  const frame = mapping.findIndex(
    (f) =>
      f.a.source?.segmentId === `hold-${ids[0]}` &&
      f.b.source?.segmentId === `hold-${ids[1]}`,
  );
  assert.ok(frame >= 0, `Missing aligned checkpoint ${point.id}`);
  const inspect = Math.min(frame + 15, mapping.length - 1);
  const color = point.id === 'result' ? 'red' : point.id;
  assert.deepEqual(frames[inspect], [color, color]);
  checkpoints.push({ id: point.id, frame: inspect });
}
checkpoints.push({ id: 'outcome', frame: mapping.length - 16 });
const labels = [];
for (const checkpoint of checkpoints) {
  const frame = join(output, `checkpoint-${checkpoint.id}.png`);
  await execute('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    rendered.outputPath,
    '-vf',
    `select=eq(n\\,${checkpoint.frame})`,
    '-frames:v',
    '1',
    frame,
  ]);
  const text = (
    await execute('tesseract', [frame, 'stdout', '--psm', '11'])
  ).stdout.replace(/\s+/g, ' ');
  assert.ok(
    text.includes('Before') && text.includes('After'),
    `Pane roles missing: ${text}`,
  );
  const expectedTitle =
    checkpoint.id === 'outcome'
      ? 'Finish changes the heading to Complete'
      : checkpoint.id === 'result'
        ? 'Verify the Complete heading'
        : {
            blue: 'Begin and observe blue',
            green: 'Continue and observe green',
            red: 'Finish and observe red',
          }[checkpoint.id];
  assert.ok(
    text.toLowerCase().includes(expectedTitle.toLowerCase()),
    `Current checkpoint description missing: ${text}`,
  );
  if (checkpoint.id === 'outcome')
    assert.ok(
      text.includes('Bug reproduced') && text.includes('Fix verified'),
      text,
    );
  else
    assert.ok(
      !text.includes('Fix verified') && !text.includes('Bug reproduced'),
      'Future outcome borrowed by an earlier checkpoint',
    );
  labels.push({ checkpoint: checkpoint.id, frame, text });
}
const transitions = [];
for (const pane of [0, 1])
  for (const color of ['blue', 'green', 'red']) {
    const sourceFrame = expected.findIndex((colors) => colors[pane] === color),
      outputFrame = frames.findIndex((colors) => colors[pane] === color);
    assert.ok(sourceFrame >= 0 && outputFrame >= 0);
    assert.equal(
      outputFrame,
      sourceFrame,
      'Source transition shifted in encoded comparison',
    );
    transitions.push({ pane, color, sourceFrame, outputFrame });
  }
const expectedDurationMs = (mapping.length * 1000) / 30;
assert.ok(
  Math.abs(rendered.receipt.durationMs - expectedDurationMs) < 1000 / 30 + 0.01,
);
// Deliberately use a single whole-video ratio in place of semantic beats.
const coarse = checked.map((check) =>
  mapping.map(
    (_, i) =>
      check.mapping[
        Math.min(
          check.mapping.length - 1,
          Math.floor((i * check.mapping.length) / mapping.length),
        )
      ],
  ),
);
const negative = [];
for (let i = 0; i < mapping.length; i++) {
  const colors = [
    await sourceColor(0, { source: coarse[0][i] }),
    await sourceColor(1, { source: coarse[1][i] }),
  ];
  if (colors.some((color, pane) => color !== frames[i][pane])) negative.push(i);
}
assert.ok(
  negative.length > 0,
  'Coarse timing unexpectedly matched every real output frame',
);
const alignment = checkpoints;
await writeFile(
  join(output, 'decoded-frames.json'),
  JSON.stringify({ frames, alignment, transitions, negative }, null, 2),
);
// Synthetic manifest-only negative control: even designated outcomes cannot
// establish comparison proof when every measured checkpoint is removed.
const emptyRuns = [];
for (const [index, directory] of runs.entries()) {
  const empty = join(output, `negative-empty-${index}`);
  await cp(directory, empty, { recursive: true });
  const manifest = JSON.parse(await readFile(join(empty, 'run.json'), 'utf8'));
  manifest.observations = manifest.observations.filter(
    (observation) => observation.kind !== 'screenshot',
  );
  await writeFile(join(empty, 'run.json'), JSON.stringify(manifest, null, 2));
  emptyRuns.push(empty);
}
let emptyComparison;
await assert.rejects(
  execute(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), 'compare', ...emptyRuns],
    { maxBuffer: 8 * 1024 * 1024 },
  ),
  (error) => {
    assert.equal(error.code, 1);
    emptyComparison = JSON.parse(error.stdout);
    return true;
  },
);
assert.equal(emptyComparison.matched.length, 0);
assert.equal(
  emptyComparison.ok,
  false,
  'Missing checkpoints must not establish proof',
);
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify(
    {
      passed: true,
      before,
      after,
      comparison,
      rendered,
      expectedDurationMs,
      actualDurationMs: (frames.length * 1000) / 30,
      alignment,
      transitions,
      labels,
      negative,
      emptyCheckpointControl: {
        rejected: !emptyComparison.ok,
        matched: emptyComparison.matched.length,
      },
    },
    null,
    2,
  ),
);
console.log(
  `Synchronization acceptance passed: ${join(output, 'acceptance.json')}`,
);
