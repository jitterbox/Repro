import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve(process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix');
const catalog = JSON.parse(
  await readFile('testdata/evaluation/review-matrix.json', 'utf8'),
);
const rows = [];
for (const name of ['strategies', 'overlays', 'voiceover'])
  rows.push(
    ...JSON.parse(await readFile(join(root, `${name}.json`), 'utf8')).rows,
  );
const ids = new Set([
  ...Object.values(catalog.features).flat(),
  ...Object.values(catalog.strategies),
  'TXT-01',
]);
for (const id of ids) {
  const row = rows.find((r) => r.id === id);
  assert.ok(row, `Missing required ${id}`);
  assert.equal(row.status, 'passed', `${id}: ${row.error ?? row.status}`);
  assert.ok(row.artifacts.length, `${id} has no review artifact`);
  for (const artifact of row.artifacts)
    assert.ok(
      (await stat(artifact.path)).size > 0,
      `${id} missing ${artifact.path}`,
    );
}
const report = {
  passed: true,
  requiredCases: ids.size,
  featureFlags: Object.keys(catalog.features).length,
  strategies: Object.keys(catalog.strategies).length,
  audibleNarration: 'unsupported',
  generatedAt: new Date().toISOString(),
};
await writeFile(join(root, 'acceptance.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
