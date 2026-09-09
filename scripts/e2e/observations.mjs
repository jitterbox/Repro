/** Real browser evidence through the public CLI; application controls own every state change. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const execute = promisify(execFile),
  out = resolve(process.env.REPRO_OBSERVATIONS_OUT ?? '.repro/observations');
await mkdir(out, { recursive: true });
const results = [];
for (const role of ['before', 'after']) {
  const spec = JSON.parse(
    await readFile('packages/playwright/examples/after.json', 'utf8'),
  );
  spec.id = 'observations';
  spec.title = 'Checkout status follows the response';
  spec.claim =
    'The failed checkout displays a failure status; the fix displays readiness';
  spec.expected = 'Checkout status reads Checkout ready';
  spec.variant = {
    id: role,
    role,
    label: role === 'before' ? 'Before' : 'After',
  };
  spec.targets = [{ id: 'status', description: 'Checkout status' }];
  spec.steps.push(
    ...['hide', 'duplicate', 'remove'].map((id) => ({
      id,
      title: `${id} status using its control`,
      trigger: false,
    })),
  );
  spec.checkpoints = [
    ['initial', 'prepare'],
    ['result', 'verify'],
    ['hidden', 'hide'],
    ['ambiguous', 'duplicate'],
    ['absent', 'remove'],
  ].map(([id, step]) => ({
    id,
    step,
    title: `${id} status`,
    targets: ['status'],
    required: id !== 'ambiguous',
    observations:
      id === 'result'
        ? ['visibility', 'network', 'assertion', 'screenshot']
        : ['visibility'],
    timing: 'stable',
  }));
  spec.privacy.patterns = ['PRIVATE_NETWORK_CANARY'];
  const evidence = join(out, `${role}.json`);
  await writeFile(evidence, JSON.stringify(spec));
  const { stdout } = await execute(
    process.execPath,
    [
      'packages/cli/dist/bin.js',
      'run',
      'packages/playwright/examples/observations.spec.ts',
      '--playwright-config',
      'packages/playwright/examples/observations.config.ts',
      '--evidence',
      evidence,
      '--url',
      `http://127.0.0.1:3191${role === 'after' ? '?fixed=1' : ''}`,
      '--out-dir',
      out,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true, stdout);
  const directory = result.runs[0].directory;
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  const samples = run.observations.filter((o) => o.kind === 'visibility');
  assert.deepEqual(
    samples.map((o) => o.data.count),
    [0, 1, 1, 2, 0],
  );
  assert.deepEqual(
    samples.map((o) => o.data.transition),
    ['unknown', 'appeared', 'disappeared', 'unknown', 'unchanged'],
  );
  assert.equal(samples[3].status, 'unsupported');
  assert.equal(samples[2].data.attached, true);
  assert.equal(samples[4].data.attached, false);
  const response = run.observations.find((o) => o.kind === 'network');
  assert.equal(response.data.status, role === 'before' ? 503 : 200);
  assert.equal(response.data.url, 'http://127.0.0.1:3191/checkout');
  assert.equal(JSON.stringify(run).includes('PRIVATE_NETWORK_CANARY'), false);
  assert.equal(
    run.scenarioOutcome,
    role === 'before' ? 'bug-reproduced' : 'fix-verified',
  );
  assert.equal(run.pipelineOutcome, 'passed');
  results.push({
    role,
    directory,
    outcome: run.scenarioOutcome,
    samples: samples.length,
  });
}
await writeFile(
  join(out, 'acceptance.json'),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log(JSON.stringify({ passed: true, results }));
