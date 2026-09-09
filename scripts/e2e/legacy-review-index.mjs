/** Index legacy outputs honestly: the ledger is plan/file coverage, not pixel verification. */
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import assert from 'node:assert/strict';
const log = await readFile(process.argv[2], 'utf8');
assert.match(log, /27 passed/);
assert.doesNotMatch(log, /Tests\s+\d+ failed/);
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
const names = (await readdir(root))
  .filter((n) => !n.startsWith('agent-'))
  .sort();
for (const [index, name] of names.entries()) {
  const dir = join(root, name);
  if (!(await stat(dir)).isDirectory()) continue;
  rows.push({
    id: `LEG-${String(index + 1).padStart(2, '0')}`,
    title: name,
    status: 'passed',
    level: 'Legacy fixture/plan/file checks; inspect pixels manually',
    checks: [
      'Part of the 27-test fixture run. Synthetic geometry/diagnostics may be present; see scenario source.',
    ],
    artifacts: await find(dir),
  });
}
await writeFile(
  resolve(
    process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix',
    'legacy.json',
  ),
  JSON.stringify({ rows }, null, 2),
);
