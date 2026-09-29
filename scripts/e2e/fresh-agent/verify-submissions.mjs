/** Reaudit frozen submissions with current product code; keep original agent reports immutable. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { verifyPair } from './verify.mjs';
const execute = promisify(execFile);
const root = resolve(
  process.env.REPRO_FRESH_VERIFICATION_OUT ?? '.repro/fresh-agent-verification',
);
await mkdir(root, { recursive: true });
const attempt = await mkdtemp(join(root, 'attempt-'));
const rows = [],
  records = [];
async function command(folder, label, ...args) {
  try {
    const { stdout } = await execute(
      process.execPath,
      [resolve('packages/cli/dist/bin.js'), ...args],
      { maxBuffer: 16e6 },
    );
    await writeFile(join(folder, label + '.json'), stdout);
    return JSON.parse(stdout);
  } catch (error) {
    await writeFile(join(folder, label + '.error.txt'), String(error));
    throw error;
  }
}
for (const group of ['interaction-keyboard', 'race-flash', 'geometry-native']) {
  const reportPath = resolve(
    `testdata/fresh-agent/submissions/${group}/report.json`,
  );
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  for (const original of report.cases) {
    const record = structuredClone(original);
    record.strategies = {
      'FA-01': ['interaction'],
      'FA-02': ['keyboard'],
      'FA-03': ['network', 'transient'],
      'FA-04': ['transient'],
      'FA-05': ['geometry'],
      'FA-06': ['native'],
    }[record.id];
    const folder = join(attempt, record.id);
    await mkdir(folder, { recursive: true });
    if (record.id === 'FA-06') {
      const result = await command(
        folder,
        'native',
        'discover',
        'testdata/fresh-agent/tickets/FA-06.json',
        '--assessment',
        'testdata/fresh-agent/submissions/geometry-native/FA-06-assessment.json',
      );
      assert.equal(result.status, 'unsupported-surface');
      assert.equal(result.evidenceDraft, null);
      rows.push({
        id: record.id,
        title: 'Native file picker: reject page-proof substitution',
        status: 'passed',
        level:
          'Fresh-agent limitation correctly identified; no fabricated media',
        features: [],
        strategies: ['native'],
        artifacts: [
          {
            label: 'Unsupported discovery result',
            path: join(folder, 'native.json'),
          },
        ],
        checks: ['Native-surface claim produces no page-evidence draft'],
      });
      continue;
    }
    for (const role of ['before', 'after']) {
      const presentation =
        record.replay?.[
          role === 'before' ? 'presentationBefore' : 'presentationAfter'
        ];
      await command(
        folder,
        `render-${role}`,
        'render',
        record.runs[role],
        ...(presentation ? ['--evidence', presentation] : []),
      );
    }
    const faithful = ['FA-03', 'FA-04'].includes(record.id);
    record.exportManifestPaths = [];
    if (faithful) {
      for (const role of ['before', 'after']) {
        const exported = await command(
          folder,
          `export-${role}`,
          'export',
          record.runs[role],
          '--out-dir',
          join(folder, `bundle-${role}`),
        );
        record.exportManifestPaths.push(exported.manifestPath);
      }
    } else {
      assert.equal(
        (
          await command(
            folder,
            'compare',
            'compare',
            record.runs.before,
            record.runs.after,
          )
        ).ok,
        true,
      );
      const exported = await command(
        folder,
        'export',
        'export',
        record.runs.after,
        '--baseline',
        record.runs.before,
        '--out-dir',
        join(folder, 'bundle'),
      );
      record.exportManifestPaths.push(exported.manifestPath);
    }
    const row = await verifyPair(record);
    row.checks.push(
      'Terminal video pixels agree with the measured outcome checkpoint',
    );
    row.artifacts.push({
      label: 'Agent submission and repair history',
      path: reportPath,
    });
    rows.push(row);
    records.push(record);
    await writeFile(
      join(attempt, 'progress.json'),
      JSON.stringify({ rows, records }, null, 2),
    );
    console.log(`${record.id}: independently verified and reaudited`);
  }
}
const result = {
  passed: true,
  kind: 'independent-submission-verification',
  rows,
  records,
  agentCount: 3,
  tickets: 6,
  scope:
    'Five browser claims plus native rejection; repaired submissions, not first-pass autonomy',
};
await writeFile(
  join(attempt, 'acceptance.json'),
  JSON.stringify(result, null, 2),
);
await mkdir('.repro/review-matrix', { recursive: true });
await writeFile(
  '.repro/review-matrix/fresh-agent.json',
  JSON.stringify(
    { schemaVersion: 1, generatedAt: new Date().toISOString(), rows },
    null,
    2,
  ),
);
console.log(`Verified submissions: ${attempt}`);
