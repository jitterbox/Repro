/** Caption path acceptance. Audible speech is explicitly unavailable in the CLI. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile),
  root = resolve(process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix'),
  dir = join(root, 'VO-01');
await mkdir(dir, { recursive: true });
const strategy = JSON.parse(
  await readFile(join(root, 'strategies.json'), 'utf8'),
).rows.find((r) => r.id === 'STR-01');
const rows = [
  {
    id: 'VO-01',
    title: 'Narration caption path and speech availability',
    features: ['voiceover'],
    status: 'running',
    level: 'Public CLI captions + audio-stream inspection',
    artifacts: [],
    checks: [],
  },
];
try {
  const cli = resolve('packages/cli/dist/bin.js');
  const evidence = JSON.parse(
    await readFile(join(strategy.runs[0], 'evidence.json'), 'utf8'),
  );
  evidence.steps[0].title = 'Inspect the observed application result';
  const edited = join(dir, 'evidence.json');
  await writeFile(edited, JSON.stringify(evidence));
  const result = JSON.parse(
    (
      await exec(
        process.execPath,
        [cli, 'render', strategy.runs[0], '--evidence', edited],
        { maxBuffer: 16 * 1024 * 1024 },
      )
    ).stdout,
  );
  const { copyFile } = await import('node:fs/promises');
  await copyFile(
    join(result.directory, 'captions.vtt'),
    join(dir, 'captions.vtt'),
  );
  await copyFile(result.outputPath, join(dir, 'captions-only.mp4'));
  assert.match(
    await readFile(join(dir, 'captions.vtt'), 'utf8'),
    /Inspect the observed application result/,
  );
  const { stdout } = await exec('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=codec_type',
    '-of',
    'json',
    join(dir, 'captions-only.mp4'),
  ]);
  assert.equal(JSON.parse(stdout).streams.length, 0);
  rows[0].status = 'passed';
  rows[0].checks.push(
    'Caption contains the committed step title; no audio stream is misrepresented as synthesized speech',
  );
  rows[0].artifacts.push(
    { label: 'Captions', path: join(dir, 'captions.vtt') },
    { label: 'Caption-only MP4', path: join(dir, 'captions-only.mp4') },
  );
  rows.push({
    id: 'VO-02',
    title: 'Audible narration through CLI',
    features: ['voiceover'],
    status: 'unsupported',
    level: 'Capability limitation',
    checks: [
      'CLI does not synthesize or mux speech; silence-mock is not speech coverage',
    ],
    artifacts: [],
  });
} catch (e) {
  rows[0].status = 'failed';
  rows[0].error = [e.message, e.stdout, e.stderr].filter(Boolean).join('\n');
  process.exitCode = 1;
}
await writeFile(
  join(root, 'voiceover.json'),
  JSON.stringify({ rows }, null, 2),
);
