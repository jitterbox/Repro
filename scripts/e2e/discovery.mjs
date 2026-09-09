/** A reviewed interpretation becomes committed input and real browser evidence via public CLI. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const output = resolve(process.env.REPRO_DISCOVERY_OUT ?? '.repro/discovery');
await mkdir(output, { recursive: true });
const example = resolve('packages/playwright/examples');
async function invoke(...args) {
  const { stdout } = await execute(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), ...args],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}
const guide = await invoke('discovery-guide', '--json');
assert.ok(guide.strategies.length >= 12);
const pending = await invoke('discover', join(example, 'discovery-bug.json'));
assert.equal(pending.evidenceDraft, null);
const interpreted = await invoke(
  'discover',
  join(example, 'discovery-bug.json'),
  '--assessment',
  join(example, 'discovery-assessment.json'),
);
assert.ok(interpreted.evidenceDraft);
assert.equal(interpreted.sourceTrust, 'reported-not-verified');
await writeFile(
  join(output, 'discovery.json'),
  JSON.stringify(interpreted, null, 2),
);
const runs = [];
for (const role of ['before', 'after']) {
  const evidence = {
    ...interpreted.evidenceDraft,
    variant: { id: role, role, label: role === 'before' ? 'Before' : 'After' },
  };
  const path = join(output, `${role}.json`);
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await invoke('validate-evidence', path);
  const result = await invoke(
    'run',
    join(example, 'discovery.spec.ts'),
    '--playwright-config',
    join(example, 'discovery.config.ts'),
    '--evidence',
    path,
    '--url',
    `http://127.0.0.1:3198${role === 'after' ? '?fixed=1' : ''}`,
    '--out-dir',
    output,
  );
  assert.equal(result.ok, true);
  const directory = result.runs[0].directory;
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  assert.equal(
    run.scenarioOutcome,
    role === 'before' ? 'bug-reproduced' : 'fix-verified',
  );
  assert.equal(run.steps.length, 3);
  const hit = run.observations.find((o) => o.kind === 'hit-test');
  assert.ok(hit && hit.status === 'passed');
  const frame = await invoke('frame', directory, '--checkpoint', 'result');
  assert.ok(frame.context);
  await invoke('render', directory);
  const rendered = JSON.parse(
    await readFile(join(directory, 'run.json'), 'utf8'),
  );
  const still = rendered.artifacts.find((a) => a.kind === 'presentation-image');
  const { stdout: pixelsText } = await execute('tesseract', [
    join(directory, still.path),
    'stdout',
    '--psm',
    '11',
  ]);
  assert.match(
    pixelsText,
    role === 'before' ? /Bug reproduced/ : /Fix verified/,
  );
  runs.push(directory);
}
const compared = await invoke('compare', ...runs);
assert.equal(compared.ok, true);
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify(
    {
      passed: true,
      runs,
      source:
        'Public discover → validate-evidence → run → frame → render → compare; actual Chromium and frame OCR',
    },
    null,
    2,
  ),
);
console.log('Discovery evidence passed: ' + join(output, 'acceptance.json'));
