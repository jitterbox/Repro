import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile),
  root = resolve(process.env.REPRO_SCENE_OUT ?? '.repro/scene-polish');
const result = JSON.parse(
  await readFile(join(root, 'results.json'), 'utf8'),
).find((r) => r.kind === 'geometry' && r.role === 'before');
if (!result) throw new Error('Capture geometry before first');
const original = JSON.parse(
  await readFile(join(result.run, 'run.json'), 'utf8'),
);
const measurements = [];
for (const renderer of ['legacy', 'hyperframes']) {
  const directory = join(root, 'benchmark', renderer);
  await mkdir(directory, { recursive: true });
  const run = {
    ...original,
    artifacts: original.artifacts.filter(
      (a) =>
        !a.kind.startsWith('presentation-') &&
        !a.kind.startsWith('scene-comparison') &&
        a.kind !== 'captions',
    ),
  };
  for (const a of run.artifacts) {
    const to = join(directory, a.path);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(result.run, a.path), to);
  }
  await writeFile(join(directory, 'run.json'), JSON.stringify(run));
  const timing = join(directory, 'process-time.txt');
  const args = [
    '-v',
    '-o',
    timing,
    process.execPath,
    'packages/cli/dist/bin.js',
    'render',
    directory,
    '--renderer',
    renderer,
    ...(renderer === 'hyperframes'
      ? ['--treatment', join(root, 'geometry-before.treatment.json')]
      : []),
  ];
  const started = performance.now();
  const { stdout } = await exec('/usr/bin/time', args, {
    maxBuffer: 16 * 1024 * 1024,
  });
  const rendered = JSON.parse(stdout),
    manifest = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  const media = manifest.artifacts.find((a) => a.kind === 'presentation-video');
  measurements.push({
    renderer,
    elapsedMs: performance.now() - started,
    videoBytes: (await stat(join(directory, media.path))).size,
    time: await readFile(timing, 'utf8'),
    receipt: rendered.receipt ?? manifest.stages.presentation,
    sourceIndexHash: original.artifacts.find(
      (a) => a.kind === 'source-frame-index',
    )?.sha256,
  });
}
await writeFile(
  join(root, 'benchmark.json'),
  JSON.stringify(
    {
      platform: process.platform,
      node: process.version,
      ffmpeg: (await exec('ffmpeg', ['-version'])).stdout.split('\n')[0],
      measurements,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    measurements.map(({ renderer, elapsedMs, videoBytes }) => ({
      renderer,
      elapsedMs,
      videoBytes,
    })),
    null,
    2,
  ),
);
