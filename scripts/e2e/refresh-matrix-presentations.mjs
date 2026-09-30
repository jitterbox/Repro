/** Explicit presentation-only reuse of already verified browser runs. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile),
  root = resolve(process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix'),
  path = join(root, 'strategies.json'),
  report = JSON.parse(await readFile(path, 'utf8'));
for (const row of report.rows) {
  if (!row.runs) continue;
  row.artifacts = [];
  try {
    for (const directory of row.runs) {
      const rendering = await exec(
        process.execPath,
        [resolve('packages/cli/dist/bin.js'), 'render', directory],
        { maxBuffer: 16 * 1024 * 1024 },
      );
      const manifest = JSON.parse(
        await readFile(join(directory, 'run.json'), 'utf8'),
      );
      const image = manifest.artifacts.find(
          (a) =>
            a.kind === 'presentation-image' && a.path.endsWith('/result.png'),
        ),
        video = manifest.artifacts.find((a) => a.kind === 'presentation-video');
      const png = join(directory, image.path),
        role = manifest.variant.role;
      const result = JSON.parse(rendering.stdout);
      const scene = JSON.parse(
        await readFile(join(result.directory, 'scene.json'), 'utf8'),
      );
      const outcome = scene.cues.find((c) => c.kind === 'outcome');
      const at = (outcome.startMs + outcome.endMs) / 2;
      const schedule = JSON.parse(
        await readFile(join(result.directory, 'layout.json'), 'utf8'),
      );
      const box = schedule.beats
        .find((b) => at >= b.startMs && at < b.endMs)
        .panels.find((p) => p.id === outcome.id);
      const pixels = join(
        result.directory,
        'frames',
        `frame_${String(Math.floor((at * 30) / 1000)).padStart(6, '0')}.png`,
      );
      const crop = join(root, row.id, role, 'outcome-ocr.png');
      await exec('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-i',
        pixels,
        '-vf',
        `crop=${Math.floor(box.width)}:${Math.floor(box.height)}:${Math.floor(box.x)}:${Math.floor(box.y)},scale=iw*2:ih*2`,
        crop,
      ]);
      const { stdout } = await exec('tesseract', [
        crop,
        'stdout',
        '--psm',
        '6',
      ]);
      assert.match(
        stdout,
        role === 'before' ? /Bug reproduced/ : /Fix verified/,
      );
      row.artifacts.push(
        { label: `${role} PNG`, path: png },
        { label: `${role} MP4`, path: join(directory, video.path) },
      );
    }
    row.checks.push(
      'Presentation refreshed with current renderer; capture reuse explicit; outcome OCR rechecked',
    );
  } catch (e) {
    row.status = 'failed';
    row.error = [e.message, e.stdout, e.stderr].filter(Boolean).join('\n');
    process.exitCode = 1;
  }
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(`${row.id}: ${row.status}`);
}
