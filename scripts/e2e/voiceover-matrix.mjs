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
const source = join(root, 'MIX-01');
const config = JSON.parse(await readFile(join(source, 'config.json'), 'utf8'));
config.features = { voiceover: true, redaction: true };
config.metadata.bugId = 'VO-01';
const events = (await readFile(join(source, 'events.jsonl'), 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
events.splice(1, 0, {
  ...events[0],
  id: 'voice',
  kind: 'narration.voiceover',
  payload: { text: 'Inspect the observed application result', durationMs: 600 },
  t_mono: 800,
});
await writeFile(join(dir, 'config.json'), JSON.stringify(config));
await writeFile(
  join(dir, 'events.jsonl'),
  events.map((e) => JSON.stringify(e)).join('\n'),
);
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
  await exec(process.execPath, [
    cli,
    'validate-config',
    '--config',
    join(dir, 'config.json'),
  ]);
  await exec(
    process.execPath,
    [
      cli,
      'annotate',
      '--config',
      join(dir, 'config.json'),
      '--events',
      join(dir, 'events.jsonl'),
      '--video',
      join(strategy.runs[0], 'capture.mp4'),
      '--out-dir',
      dir,
      '--output-name',
      'captions-only.mp4',
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
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
    'Caption contains committed narration; no audio stream is misrepresented as synthesized speech',
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
