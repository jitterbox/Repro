/** Additional existing public gates, with stable review IDs and retained reports. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const exec = promisify(execFile),
  root = resolve(process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix');
const rows = [];
const jobs = [
  [
    'TIME-01',
    'capture-timing',
    'REPRO_TIMING_OUT',
    'Stationary intervals, brief transitions, ending and presentation holds',
  ],
  [
    'PIX-01',
    'hidpi',
    'REPRO_HIDPI_OUT',
    'Fractional geometry and high-DPI checkpoint holds',
  ],
  [
    'SEL-01',
    'discovery',
    'REPRO_DISCOVERY_OUT',
    'Source-referenced discovery through actual before/after proof',
  ],
  [
    'PRIV-01',
    'moving-privacy',
    'REPRO_PRIVACY_OUT',
    'Untouched, moving and popup redaction with negative controls',
  ],
  [
    'SYNC-01',
    'synchronization',
    'REPRO_SYNC_OUT',
    'Uneven semantic synchronization and damaged-timing rejection',
  ],
];
async function assets(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await assets(p)));
    else if (
      e.name === 'proof.mp4' ||
      e.name === 'checkpoint-hold.png' ||
      e.name === 'acceptance.json'
    )
      out.push({ label: e.name, path: p });
  }
  return out;
}
for (const [id, script, key, title] of jobs) {
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  const row = {
    id,
    title,
    level: 'Public CLI/browser + decoded-pixel negative controls',
    status: 'running',
    checks: [],
    artifacts: [],
  };
  rows.push(row);
  await writeFile(
    join(root, 'coverage.json'),
    JSON.stringify({ rows }, null, 2),
  );
  try {
    const { stdout, stderr } = await exec(
      process.execPath,
      [`scripts/e2e/${script}.mjs`],
      { env: { ...process.env, [key]: dir }, maxBuffer: 16 * 1024 * 1024 },
    );
    await writeFile(join(dir, 'test.log'), stdout + '\n' + stderr);
    row.status = 'passed';
    row.checks.push('Existing public acceptance script completed successfully');
    row.artifacts = await assets(dir);
  } catch (e) {
    row.status = 'failed';
    row.error = [e.message, e.stdout, e.stderr].filter(Boolean).join('\n');
  }
  await writeFile(
    join(root, 'coverage.json'),
    JSON.stringify({ rows }, null, 2),
  );
  console.log(`${id}: ${row.status}`);
}
if (rows.some((r) => r.status !== 'passed')) process.exitCode = 1;
