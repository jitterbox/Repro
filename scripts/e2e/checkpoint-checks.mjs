/** Real public scenarios: a prerequisite image is not fix proof; swallowed failures still fail. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
const execute = promisify(execFile);
const output = resolve(
  process.env.REPRO_CHECKS_OUT ?? '.repro/checkpoint-checks',
);
await mkdir(output, { recursive: true });
const spec = JSON.parse(
  await readFile('packages/playwright/examples/after.json', 'utf8'),
);
spec.title = 'Checkout opens after Cart is ready';
spec.targets = [];
spec.checkpoints = [
  {
    id: 'ready',
    step: 'prepare',
    title: 'Cart is ready',
    observations: ['screenshot', 'assertion'],
  },
  {
    id: 'result',
    step: 'verify',
    title: 'Checkout is open',
    observations: ['screenshot', 'assertion'],
  },
];
const evidence = join(output, 'evidence.json');
await writeFile(evidence, JSON.stringify(spec, null, 2));
async function invoke(...args) {
  try {
    const result = await execute(
      process.execPath,
      [resolve('packages/cli/dist/bin.js'), ...args],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return { code: 0, result: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      code: error.code,
      result: JSON.parse(error.stdout || error.stderr),
    };
  }
}
const results = [];
for (const fail of [false, true]) {
  const captured = await invoke(
    'run',
    'packages/playwright/examples/checks.spec.ts',
    '--playwright-config',
    'packages/playwright/examples/checks.config.ts',
    '--evidence',
    evidence,
    '--url',
    `http://127.0.0.1:3198?fixed=1${fail ? '&fail-guard=1' : ''}`,
    '--out-dir',
    output,
  );
  assert.equal(captured.result.runs.length, 1, JSON.stringify(captured));
  const directory = captured.result.runs[0].directory;
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  assert.ok(
    run.observations.some(
      (o) =>
        o.checkpoint === 'result' &&
        o.kind === 'assertion' &&
        o.data.assertionPassed === true &&
        o.data.designated === true,
    ),
  );
  if (fail) {
    assert.notEqual(captured.code, 0);
    assert.equal(run.scenarioOutcome, 'failed');
    assert.equal(run.pipelineOutcome, 'inconclusive');
    assert.ok(
      run.errors.some((error) =>
        error.includes('Checkpoint check failed at ready'),
      ),
    );
    const blocked = await invoke(
      'export',
      directory,
      '--out-dir',
      join(output, 'rejected'),
    );
    assert.notEqual(blocked.code, 0);
    assert.match(
      JSON.stringify(blocked.result),
      /Required evidence or designated outcome is missing/,
    );
  } else {
    assert.equal(captured.code, 0, JSON.stringify(captured));
    assert.equal(run.scenarioOutcome, 'fix-verified');
    const rendered = await invoke('render', directory);
    assert.equal(rendered.code, 0, JSON.stringify(rendered));
    const updated = JSON.parse(
      await readFile(join(directory, 'run.json'), 'utf8'),
    );
    for (const checkpoint of ['ready', 'result']) {
      const image = updated.artifacts.find(
        (a) =>
          a.kind === 'presentation-image' &&
          basename(a.path) === `${checkpoint}.png`,
      );
      assert.ok(image);
      const text = [];
      for (const mode of ['3', '11']) {
        const ocr = await execute('tesseract', [
          join(directory, image.path),
          'stdout',
          '--psm',
          mode,
        ]);
        text.push(ocr.stdout);
      }
      const pixelsText = text.join(' ').replace(/\s+/g, ' ');
      assert.equal(
        /Fix verified/i.test(pixelsText),
        checkpoint === 'result',
        `Incorrect proof label on ${checkpoint}`,
      );
      assert.match(pixelsText, /Checkout opens after Cart is ready/);
    }
  }
  results.push({
    directory,
    scenarioOutcome: run.scenarioOutcome,
    failedGuard: fail,
  });
}
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log(`Checkpoint checks passed: ${join(output, 'acceptance.json')}`);
