/** Real browser color checkpoints and unequal application delays, through public CLI entry points. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
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
const runs = [];
for (const role of ['before', 'after']) {
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
const render = async (composition, folder) =>
  repro(
    'render-compare',
    '--composition',
    composition,
    '--video-a',
    join(before, 'capture.mp4'),
    '--video-b',
    join(after, 'capture.mp4'),
    '--out-dir',
    join(output, folder),
  );
const rendered = await render(join(after, 'comparison.json'), 'synchronized');
assert.equal(rendered.timing, 'synchronized');

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
        : '[0:v]split[a][b];[a]crop=16:16:80:300,scale=1:1[left];[b]crop=16:16:720:300,scale=1:1[right];[left][right]hstack,format=rgb24[out]',
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
const checkpoints = comparison.matched.map((point) => {
  const knot = comparison.composition.sync.knots.find(
    (k) => k[0] === point.aMs && k[1] === point.bMs,
  );
  const frame = Math.round((knot[2] * 30) / 1000);
  const color = point.id === 'result' ? 'red' : point.id;
  return { id: point.id, outMs: knot[2], frame, color };
});
function checkpointAlignment(decoded) {
  return checkpoints.map((cp) => {
    const offsets = [-2, -1, 0, 1, 2].filter((offset) =>
      decoded[cp.frame + offset]?.every((color) => color === cp.color),
    );
    return { ...cp, matchingFrameOffsets: offsets };
  });
}
const alignment = checkpointAlignment(frames);
const labels = [];
for (const [index, checkpoint] of checkpoints.entries()) {
  const frame = join(output, `checkpoint-${checkpoint.id}.png`);
  await execute('ffmpeg', [
    '-v',
    'error',
    '-i',
    rendered.outputPath,
    '-ss',
    String(Math.ceil((checkpoint.outMs * 30) / 1000) / 30),
    '-frames:v',
    '1',
    '-y',
    frame,
  ]);
  const text = (
    await execute('tesseract', [frame, 'stdout', '--psm', '11'])
  ).stdout.replace(/\s+/g, ' ');
  const title = comparison.composition.sync.anchors[index].title;
  assert.ok(
    new RegExp(`CHECKPOINT\\s+${index + 1}\\s*/\\s*4`).test(text) &&
      text.includes(title),
    `Incorrect checkpoint label: ${text}`,
  );
  assert.ok(
    !text.includes('STEP 1 / 4'),
    'Static legacy step counter survived',
  );
  assert.ok(
    new RegExp(`STEP\\s+${index + 2}\\s*/\\s*5`).test(text),
    `Meaningful scenario step missing: ${text}`,
  );
  if (checkpoint.id === 'result')
    assert.ok(
      text.includes('Bug reproduced') && text.includes('Fix verified'),
      `Verified result labels missing: ${text}`,
    );
  else
    assert.ok(
      !text.includes('Fix verified') && !text.includes('Bug reproduced'),
      'A future outcome label appeared before its assertion',
    );
  assert.ok(
    text.includes('Expected:'),
    'Expected result missing from comparison',
  );
  labels.push({ checkpoint: checkpoint.id, frame, text });
}
// Independently locate real encoded source transitions, then interpolate their
// expected output times. This detects a warp that happens to show broad stable
// checkpoint states correctly while moving the intervening transitions.
const transitions = [];
for (const [pane, directory] of [before, after].entries()) {
  const source = await decode(join(directory, 'capture.mp4'), true);
  let sourceCursor = 0,
    outputCursor = 0;
  for (const color of ['blue', 'green', 'red']) {
    const sourceFrame = source.findIndex(
      (value, index) => index >= sourceCursor && value[0] === color,
    );
    const outputFrame = frames.findIndex(
      (value, index) => index >= outputCursor && value[pane] === color,
    );
    assert.ok(
      sourceFrame >= 0 && outputFrame >= 0,
      `Missing ${color} transition in pane ${pane}`,
    );
    sourceCursor = sourceFrame + 1;
    outputCursor = outputFrame + 1;
    const sourceMs = (sourceFrame * 1000) / 30;
    const knots = comparison.composition.sync.knots;
    const upperIndex = knots.findIndex(
      (knot, index) => index > 0 && knot[pane] >= sourceMs,
    );
    assert.ok(
      upperIndex > 0,
      'Source transition falls outside measured synchronization',
    );
    const lower = knots[upperIndex - 1],
      upper = knots[upperIndex];
    const expectedMs =
      lower[2] +
      ((sourceMs - lower[pane]) / (upper[pane] - lower[pane])) *
        (upper[2] - lower[2]);
    const expectedFrame = Math.round((expectedMs * 30) / 1000);
    transitions.push({
      pane,
      color,
      sourceFrame,
      outputFrame,
      expectedFrame,
      offsetFrames: outputFrame - expectedFrame,
    });
  }
}
await writeFile(
  join(output, 'decoded-frames.json'),
  JSON.stringify({ frames, alignment, transitions }, null, 2),
);
assert.ok(
  transitions.every((item) => Math.abs(item.offsetFrames) <= 2),
  JSON.stringify(transitions),
);
assert.ok(
  alignment.every((cp) => cp.matchingFrameOffsets.length > 0),
  JSON.stringify(alignment),
);
const expectedDurationMs = comparison.composition.sync.knots.at(-1)[2];
assert.ok(
  frames.length === Math.ceil((expectedDurationMs * 30) / 1000),
  `Comparison duration ${(frames.length * 1000) / 30} differs from ${expectedDurationMs}`,
);

// Explicitly synthetic sync metadata is a negative control over the same real captures.
// A first/last-only warp must fail at least one of the intermediate checkpoints.
const coarse = structuredClone(comparison.composition);
coarse.sync.knots = [coarse.sync.knots[0], coarse.sync.knots.at(-1)];
const coarsePath = join(output, 'synthetic-coarse-sync.json');
await writeFile(coarsePath, JSON.stringify(coarse, null, 2));
const coarseRender = await render(coarsePath, 'negative-coarse');
const negative = checkpointAlignment(await decode(coarseRender.outputPath));
assert.ok(
  negative.some((cp) => cp.matchingFrameOffsets.length === 0),
  'Coarse synchronization unexpectedly passed every intermediate checkpoint',
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
