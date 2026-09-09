/** Reuse verified real media, retaining every cold/warm timing and rejection control. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const source = JSON.parse(
  await readFile(
    process.argv[2] ?? '.repro/public-acceptance/acceptance.json',
    'utf8',
  ),
);
const root = resolve(
  process.env.REPRO_EXPORT_CACHE_OUT ?? '.repro/export-cache',
);
await mkdir(root, { recursive: true });
const attempt = await mkdtemp(join(root, 'attempt-')),
  bundle = join(attempt, 'bundle');
const args = [
  resolve('packages/cli/dist/bin.js'),
  'export',
  source.after,
  '--baseline',
  source.before,
  '--out-dir',
  bundle,
];
const measurements = [];
async function invoke(label, env = process.env) {
  const start = performance.now();
  try {
    const { stdout } = await execute(process.execPath, args, {
      env,
      maxBuffer: 8 * 1024 * 1024,
    });
    await writeFile(join(attempt, `${label}.json`), stdout);
    const result = JSON.parse(stdout);
    measurements.push({
      label,
      durationMs: performance.now() - start,
      cacheHit: result.cacheHit,
    });
    return result;
  } catch (error) {
    await writeFile(join(attempt, `${label}.log`), String(error));
    throw error;
  }
}
assert.equal((await invoke('cold')).cacheHit, false);
for (let i = 0; i < 3; i++)
  assert.equal((await invoke(`warm-${i}`)).cacheHit, true);
const manifest = JSON.parse(
  await readFile(join(bundle, 'evidence-manifest.json'), 'utf8'),
);
const image = manifest.assets.find((asset) => asset.kind === 'png');
assert.ok(image);
await rm(join(bundle, image.href));
assert.equal((await invoke('repair-missing-image')).cacheHit, false);
const tools = join(attempt, 'tools');
await mkdir(tools);
for (const tool of ['ffmpeg', 'ffprobe']) {
  const { stdout } = await execute('which', [tool]);
  await symlink(stdout.trim(), join(tools, tool));
}
const before = await readFile(join(bundle, 'evidence-manifest.json'), 'utf8');
await assert.rejects(
  invoke('missing-ocr', { ...process.env, PATH: tools }),
  /OCR audit is required/,
);
assert.equal(
  await readFile(join(bundle, 'evidence-manifest.json'), 'utf8'),
  before,
);
const warm = measurements
  .filter((item) => item.cacheHit)
  .map((item) => item.durationMs)
  .sort((a, b) => a - b);
const report = {
  passed: true,
  attempt,
  measurements,
  warmMedianMs: warm[1],
  coldMs: measurements[0].durationMs,
  comparison:
    'Unchanged audited export reuse; not the historical Phase 1 annotation baseline',
};
await writeFile(join(root, 'acceptance.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
