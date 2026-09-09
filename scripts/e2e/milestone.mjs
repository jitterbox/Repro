/** Sequential real-browser/media milestone checks; run after pnpm build. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve(process.env.REPRO_MILESTONE_OUT ?? '.repro/milestone');
await mkdir(root, { recursive: true });
const jobs = [
  ['public', 'public-workflow', { REPRO_ACCEPTANCE_OUT: join(root, 'public') }],
  [
    'export-cache',
    'export-cache',
    { REPRO_EXPORT_CACHE_OUT: join(root, 'export-cache') },
    [join(root, 'public/acceptance.json')],
  ],
  [
    'delivery',
    'delivery',
    { REPRO_DELIVERY_OUT: join(root, 'delivery') },
    [join(root, 'public/acceptance.json')],
  ],
  ['timing', 'capture-timing', { REPRO_TIMING_OUT: join(root, 'timing') }],
  [
    'timing-trace',
    'capture-timing',
    { REPRO_TIMING_OUT: join(root, 'timing-trace'), REPRO_TIMING_TRACE: '1' },
  ],
  ['hidpi', 'hidpi', { REPRO_HIDPI_OUT: join(root, 'hidpi') }],
  [
    'hidpi-private',
    'hidpi',
    { REPRO_HIDPI_OUT: join(root, 'hidpi-private'), REPRO_HIDPI_PRIVATE: '1' },
  ],
  [
    'interaction',
    'interaction-diagnostics',
    { REPRO_DIAGNOSTICS_OUT: join(root, 'interaction') },
  ],
  ['privacy', 'moving-privacy', { REPRO_PRIVACY_OUT: join(root, 'privacy') }],
  ['har', 'har-privacy', { REPRO_HAR_PRIVACY_OUT: join(root, 'har') }],
  ['checks', 'checkpoint-checks', { REPRO_CHECKS_OUT: join(root, 'checks') }],
  ['sync', 'synchronization', { REPRO_SYNC_OUT: join(root, 'sync') }],
  [
    'diagnostics',
    'browser-diagnostics',
    { REPRO_BROWSER_DIAGNOSTICS_OUT: join(root, 'diagnostics') },
  ],
  [
    'observations',
    'observations',
    { REPRO_OBSERVATIONS_OUT: join(root, 'observations') },
  ],
  ['transient', 'transient', { REPRO_TRANSIENT_OUT: join(root, 'transient') }],
  ['recipes', 'recipes', { REPRO_RECIPES_OUT: join(root, 'recipes') }],
  [
    'review',
    'review',
    { REPRO_REVIEW_OUT: join(root, 'review') },
    [join(root, 'sync/acceptance.json')],
  ],
  [
    'watch-server',
    'watch-server',
    { REPRO_WATCH_OUT: join(root, 'watch-server') },
  ],
  ['compositor', null, {}, ['--filter', '@repro/compositor', 'test']],
  ['shoplite', null, {}, ['test:e2e-fixture']],
  ['clean-install', null, {}, ['test:clean-install']],
  ['agent-mock', null, {}, ['--filter', '@repro/agent-e2e', 'test']],
];
const report = {
  schemaVersion: '1.0.0',
  passed: false,
  completed: false,
  startedAt: new Date().toISOString(),
  checks: [],
};
for (const [name, script, environment, extra = []] of jobs) {
  const path = join(root, `${name}.log`),
    log = await open(path, 'w');
  const started = performance.now();
  console.log(`Checking ${name}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      script ? process.execPath : 'pnpm',
      script ? [resolveScript(script), ...extra] : extra,
      {
        env: { ...process.env, ...environment },
        stdio: ['ignore', log.fd, log.fd],
      },
    );
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  }).catch((error) => {
    console.error(error);
    return 1;
  });
  await log.close();
  report.checks.push({
    name,
    passed: code === 0,
    exitCode: code,
    durationMs: performance.now() - started,
    log: path,
  });
  await writeFile(
    join(root, 'acceptance.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `${name}: ${code === 0 ? 'passed' : 'FAILED'} (${Math.round((performance.now() - started) / 1000)} s)`,
  );
}
report.completed = true;
report.passed = report.checks.every((c) => c.passed);
report.endedAt = new Date().toISOString();
await writeFile(join(root, 'acceptance.json'), JSON.stringify(report, null, 2));
console.log(
  `Milestone ${report.passed ? 'passed' : 'FAILED'}: ${join(root, 'acceptance.json')}`,
);
process.exitCode = report.passed ? 0 : 1;
function resolveScript(name) {
  return resolve(`scripts/e2e/${name}.mjs`);
}
