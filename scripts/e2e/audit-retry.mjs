/** Reuse the moving-privacy negative fixture; exercise only public Repro commands. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const execute = promisify(execFile);
const source =
  process.argv[2] ??
  JSON.parse(await readFile('.repro/moving-privacy/acceptance.json', 'utf8'))
    .negativeControl.directory;
const root = resolve('.repro/audit-retry');
await mkdir(root, { recursive: true });
const output = await mkdtemp(join(root, 'attempt-'));
const env = { ...process.env, REPRO_AUDIT_PROGRESS: '0' };
const results = [];
for (const command of ['export', 'export', 'audit']) {
  const args = [
    resolve('packages/cli/dist/bin.js'),
    command,
    source,
    ...(command === 'export'
      ? ['--draft', '--out-dir', join(output, 'bundle')]
      : ['--json']),
  ];
  const started = performance.now();
  let failure;
  try {
    await execute(process.execPath, args, { env, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    failure = JSON.parse(error.stderr);
  }
  assert.equal(
    failure?.error?.code,
    'OCR_PII_DETECTED',
    'Actual visible privacy canary must block output',
  );
  const report = JSON.parse(await readFile(failure.error.reportPath, 'utf8'));
  assert.equal(report.status, 'complete');
  assert.equal(report.passed, false);
  assert.ok(report.findings.length);
  const pixel = report.findings.find(
    (f) => f.rect && f.reviewImage && f.source,
  );
  assert.ok(
    pixel,
    'OCR findings must retain measured geometry, review image and source mapping',
  );
  assert.ok((await readFile(pixel.reviewImage)).length);
  if (results.length) {
    assert.equal(
      report.stats.scannedFrames,
      0,
      'Retry must reuse complete frame scans',
    );
    assert.equal(report.stats.cacheHits, report.stats.uniqueFrames);
  }
  results.push({
    command,
    durationMs: performance.now() - started,
    reportPath: failure.error.reportPath,
    stats: report.stats,
  });
}
await assert.rejects(
  readFile(join(output, 'bundle', 'evidence-manifest.json')),
);
const report = { passed: true, source, results };
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ passed: true, output, results }));
