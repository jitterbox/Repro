/** Decode scene fixture outputs and verify compare role pixels; never claim synthetic geometry as measured proof. */
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
async function find(dir) {
  const artifacts = [];
  for (const path of [
    join(dir, 'scene-result.json'),
    join(dir, 'compare', 'scene-comparison.json'),
  ]) {
    let document;
    try {
      document = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    artifacts.push({
      label: relative(dir, document.outputPath),
      path: document.outputPath,
      comparison: path.endsWith('scene-comparison.json'),
    });
  }
  return artifacts;
}
let checkedComparisons = 0;
const names = (await readdir(root))
  .filter((n) => !n.startsWith('agent-'))
  .sort();
for (const [index, name] of names.entries()) {
  const dir = join(root, name);
  if (!(await stat(dir)).isDirectory()) continue;
  const artifacts = await find(dir);
  if (!artifacts.length) continue;
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
    if (asset.comparison) {
      checkedComparisons++;
      assert.ok(video.width > 1280 && video.height >= 720);
      const paneWidth = (video.width - 24) / 2;
      const regions = [
        { x: 24, width: 450, roles: ['BROKEN'] },
        { x: paneWidth + 48, width: 450, roles: ['FIXED'] },
      ];
      for (const region of regions) {
        const recognized = [];
        for (const binary of [false, true]) {
          const roi = `${image}.labels-${region.x}-${binary}.png`;
          await exec('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-i',
            image,
            '-vf',
            `crop=${region.width}:30:${region.x}:14,${binary ? "format=gray,lut=y='if(gt(val,200),0,255)'," : ''}scale=iw*3:ih*3`,
            roi,
          ]);
          for (const psm of ['6', '7', '11'])
            recognized.push(
              (await exec('tesseract', [roi, 'stdout', '--psm', psm])).stdout,
            );
        }
        // At small encoded sizes T can be recognized as I/L. This only
        // disambiguates the known role word; missing or unrelated text still fails.
        const text = recognized
          .join(' ')
          .toUpperCase()
          .replace(/\s+/g, '')
          .replace(/AF[IL]ER/g, 'AFTER');
        for (const role of region.roles)
          assert.ok(
            text.includes(role),
            `${asset.path}: missing ${role} role: ${text}`,
          );
      }
      checks.push(
        `${asset.label}: decoded role labels verified by OCR (T/I/L ambiguity normalized)`,
      );
    }
    checks.push(
      `${asset.label}: all frames decode; SHA256 ${createHash('sha256')
        .update(await readFile(asset.path))
        .digest('hex')}`,
    );
  }
  rows.push({
    id: `FIX-${String(index + 1).padStart(2, '0')}`,
    title: name,
    status: 'passed',
    level:
      'Decoded scene media; compare-role OCR; synthetic diagnostics are not measured bug proof',
    checks: [
      'All listed videos decoded; review frames linked. Individual overlay semantics still use the dedicated matrix.',
      ...checks,
    ],
    artifacts,
  });
}
assert.ok(checkedComparisons > 0, 'No paired scene output was inspected');
await writeFile(
  resolve(
    process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix',
    'fixtures.json',
  ),
  JSON.stringify({ rows }, null, 2),
);
