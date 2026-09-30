import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const require = createRequire(resolve('packages/evaluation/package.json'));
const { PNG } = require('pngjs');
const { default: pixelmatch } = await import(require.resolve('pixelmatch'));

/** Compare terminal presentation pixels with the measured, annotated outcome. */
export async function verifyTerminalCheckpoint(
  directory,
  output,
  videoOverride,
) {
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  const sceneArtifact = run.artifacts.find(
    (a) => a.kind === 'presentation-scene',
  );
  assert.ok(sceneArtifact, 'Scene presentation required');
  const sceneDir = dirname(join(directory, sceneArtifact.path));
  const mapping = JSON.parse(
    await readFile(join(sceneDir, 'frame-map.json'), 'utf8'),
  );
  const finalIndex = mapping.length - 1;
  const expected = PNG.sync.read(
    await readFile(
      join(
        sceneDir,
        'frames',
        `frame_${String(finalIndex).padStart(6, '0')}.png`,
      ),
    ),
  );
  const video =
    videoOverride ??
    join(
      directory,
      run.artifacts.find((a) => a.kind === 'presentation-video').path,
    );
  await mkdir(output, { recursive: true });
  const frame = join(output, 'terminal.png');
  await execute('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    video,
    '-vf',
    `select=eq(n\\,${finalIndex})`,
    '-frames:v',
    '1',
    frame,
  ]);
  const actual = PNG.sync.read(await readFile(frame));
  assert.equal(actual.width, expected.width);
  assert.equal(actual.height, expected.height);
  // Perceptual comparison ignores codec/antialiasing noise; local tiles catch
  // changed status words that a whole-frame average would hide.
  const difference = new PNG({ width: actual.width, height: actual.height });
  pixelmatch(
    actual.data,
    expected.data,
    difference.data,
    actual.width,
    actual.height,
    { threshold: 0.15, includeAA: false, diffMask: true },
  );
  await writeFile(
    join(output, 'terminal-difference.png'),
    PNG.sync.write(difference),
  );
  let worstTileFraction = 0;
  for (let y = 0; y < actual.height; y += 32)
    for (let x = 0; x < actual.width; x += 32) {
      let changed = 0,
        total = 0;
      for (let j = y; j < Math.min(y + 32, actual.height); j++)
        for (let i = x; i < Math.min(x + 32, actual.width); i++) {
          const k = (j * actual.width + i) * 4;
          total++;
          if (difference.data[k + 3]) changed++;
        }
      worstTileFraction = Math.max(worstTileFraction, changed / total);
    }
  assert.ok(
    worstTileFraction <= 0.1,
    `Terminal video reverted from checkpoint pixels: worst changed tile ${worstTileFraction}`,
  );
  return {
    passed: true,
    frame,
    source: mapping.at(-1),
    worstTileFraction,
  };
}
