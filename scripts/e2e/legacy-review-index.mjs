/** Decode legacy outputs and verify compare role pixels; never claim synthetic geometry as measured proof. */
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
if (process.argv[2]) {
  const log = await readFile(process.argv[2], 'utf8');
  assert.match(log, /27 passed/);
  assert.doesNotMatch(log, /Tests\s+\d+ failed/);
}
const root = resolve('.repro/fixture-videos'),
  rows = [];
async function find(dir, origin = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (
      e.name.startsWith('capture') ||
      e.name === 'stages' ||
      e.name.startsWith('.')
    )
      continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await find(p, origin)));
    else if (e.name.endsWith('.mp4') || e.name === 'plan.json')
      out.push({ label: relative(origin, p), path: p });
  }
  return out;
}
const checkedLayouts = new Set();
const names = (await readdir(root))
  .filter((n) => !n.startsWith('agent-'))
  .sort();
for (const [index, name] of names.entries()) {
  const dir = join(root, name);
  if (!(await stat(dir)).isDirectory()) continue;
  const artifacts = await find(dir);
  const checks = [];
  for (const asset of [...artifacts]) {
    if (!asset.path.endsWith('.mp4')) continue;
    await exec(
      'ffmpeg',
      ['-v', 'error', '-xerror', '-i', asset.path, '-f', 'null', '-'],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    const { stdout } = await exec('ffprobe', [
      '-v',
      'error',
      '-show_streams',
      '-of',
      'json',
      asset.path,
    ]);
    const video = JSON.parse(stdout).streams.find(
      (s) => s.codec_type === 'video',
    );
    assert.ok(
      video && Number(video.duration) > 0,
      `${asset.path}: no video duration`,
    );
    const image = asset.path + '.review.png';
    await exec('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      String(Math.min(0.5, Number(video.duration) / 2)),
      '-i',
      asset.path,
      '-frames:v',
      '1',
      image,
    ]);
    artifacts.push({ label: asset.label + ' decoded frame', path: image });
    if (asset.path.endsWith('_compare.mp4')) {
      checkedLayouts.add(
        asset.path.split('/').at(-1).replace('_compare.mp4', ''),
      );
      assert.equal(video.width, 1280);
      assert.equal(video.height, 720);
      const roi = image + '.labels.png';
      await exec('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-i',
        image,
        '-vf',
        'crop=1240:25:20:80,scale=iw*3:ih*3',
        roi,
      ]);
      const text = (await exec('tesseract', [roi, 'stdout', '--psm', '7']))
        .stdout;
      assert.match(text, /BEFORE/i, `${asset.path}: missing Before role`);
      assert.match(text, /AFTER/i, `${asset.path}: missing After role`);
      checks.push(`${asset.label}: decoded role labels verified by OCR`);
    }
    checks.push(
      `${asset.label}: all frames decode; SHA256 ${createHash('sha256')
        .update(await readFile(asset.path))
        .digest('hex')}`,
    );
  }
  rows.push({
    id: `LEG-${String(index + 1).padStart(2, '0')}`,
    title: name,
    status: 'passed',
    level:
      'Decoded legacy media; compare-role OCR; synthetic diagnostics are not measured bug proof',
    checks: [
      'All listed videos decoded; review frames linked. Individual overlay semantics still use the dedicated matrix.',
      ...checks,
    ],
    artifacts,
  });
}
assert.deepEqual(
  [...checkedLayouts].sort(),
  [
    'side-by-side',
    'onion',
    'wipe',
    'cropped-roi',
    'difference',
    'edge',
    'blink',
  ].sort(),
);
await writeFile(
  resolve(
    process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix',
    'legacy.json',
  ),
  JSON.stringify({ rows }, null, 2),
);
