/** Re-render existing audited source pixels; no recapture or alternative renderer. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseScenePlan } from '../../packages/contracts/dist/index.js';
import {
  renderScene,
  renderSceneComparison,
} from '../../packages/compositor/dist/index.js';
import { runProcess } from '../../packages/core/dist/index.js';

const acceptance = JSON.parse(
  await readFile('.repro/public-acceptance/acceptance.json', 'utf8'),
);
const run = JSON.parse(
  await readFile(join(acceptance.before, 'run.json'), 'utf8'),
);
const source = run.artifacts.find((a) => a.kind === 'presentation-source');
assert.ok(
  source,
  'Run public-workflow first to create sanitized source pixels',
);
const folder = resolve('.repro/scene-regressions');
await mkdir(folder, { recursive: true });
const scene = parseScenePlan({
  schemaVersion: '1.0.0',
  renderer: 'hyperframes',
  viewport: { width: 1280, height: 720 },
  sourceOrigin: { x: 24, y: 96 },
  output: { width: 1688, height: 864, fps: 30 },
  cues: [],
  segments: [
    {
      id: 'hold',
      kind: 'hold',
      sourceStartMs: 0,
      rate: 0,
      outStartMs: 0,
      outDurationMs: 200,
    },
  ],
});
const sources = [
  {
    id: 'verified-source',
    path: join(acceptance.before, source.path),
    sha256: source.sha256,
    pageId: 'page',
    timeMs: 0,
  },
];
await renderScene({ scene, sources, outDir: folder });
scene.segments[0].outDurationMs = 100;
const rendered = await renderScene({ scene, sources, outDir: folder });
assert.equal(rendered.receipt.frameCount, 3);
const streams = JSON.parse(
  await runProcess('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=nb_read_frames,duration',
    '-of',
    'json',
    rendered.outputPath,
  ]),
).streams;
assert.equal(
  Number(streams[0].nb_read_frames),
  3,
  'Old PNG frames must not extend a shorter rerender',
);
assert.ok(Math.abs(Number(streams[0].duration) - 0.1) < 0.001);
assert.equal(rendered.frames.length, 3);

const pane = async (label, targetX, lateEnd, name) => {
  const variant = parseScenePlan({
    ...scene,
    timing: { entryMs: 0, exitMs: 0 },
    cues: [
      {
        id: 'shared',
        kind: 'data-panel',
        title: 'Shared baseline',
        startMs: 0,
        endMs: 100,
        layer: 50,
      },
      {
        id: 'late',
        kind: 'data-panel',
        title: 'Later evidence',
        startMs: 0,
        endMs: lateEnd,
        layer: 50,
      },
      {
        id: 'geometry',
        kind: 'callout',
        title: 'Geometry callout',
        detail: 'Measured target location',
        target: { x: targetX, y: 300, width: 40, height: 30 },
        startMs: 0,
        endMs: 100,
        layer: 50,
      },
    ],
  });
  const outDir = join(folder, name);
  await renderScene({ scene: variant, sources, outDir });
  return {
    label,
    width: variant.output.width,
    height: variant.output.height,
    composition: await readFile(join(outDir, 'composition.html'), 'utf8'),
    assets: [
      {
        url: `assets/${source.sha256}.png`,
        sha256: source.sha256,
        path: sources[0].path,
      },
    ],
    beats: [{ id: 'hold', startMs: 0, durationMs: 100 }],
  };
};
const a = await pane('State A', 300, 50, 'a');
const b = await pane('State B', 400, 100, 'b');
const comparison = await renderSceneComparison({
  a,
  b,
  mode: 'observational',
  outDir: join(folder, 'comparison'),
});
const recognize = async (frame, right) => {
  const image = join(folder, `pane-${frame}-${right}.png`);
  await runProcess('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    comparison.outputPath,
    '-vf',
    `select=eq(n\\,${frame}),crop=${a.width}:${a.height}:${right ? a.width + 24 : 0}:64`,
    '-frames:v',
    '1',
    image,
  ]);
  return runProcess('tesseract', [image, 'stdout', '--psm', '11']);
};
const left = await recognize(1, false),
  right = await recognize(1, true);
assert.match(left, /Shared baseline/i);
assert.doesNotMatch(
  right,
  /Shared baseline/i,
  'Common panels should appear on the left only',
);
assert.match(left, /Geometry callout/i);
assert.match(
  right,
  /Geometry callout/i,
  'Equal text at different measured targets is a difference',
);
assert.match(
  await recognize(2, true),
  /Later evidence/i,
  'A vanished left panel must not suppress the visible right panel',
);
await writeFile(
  join(folder, 'acceptance.json'),
  JSON.stringify(
    { passed: true, frameCount: 3, output: rendered.outputPath },
    null,
    2,
  ),
);
console.log(
  'Shorter rerender and comparison deduplication pixel/OCR regressions passed.',
);
