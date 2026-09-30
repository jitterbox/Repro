/** Public CLI negative controls: no forced clicks, CSS changes, or invented geometry. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const output = resolve(
  process.env.REPRO_DIAGNOSTICS_OUT ?? '.repro/interaction-diagnostics',
);
await mkdir(output, { recursive: true });
const cli = resolve('packages/cli/dist/bin.js');
async function invoke(...args) {
  try {
    return {
      code: 0,
      result: JSON.parse(
        (
          await execute(process.execPath, [cli, ...args], {
            maxBuffer: 8 * 1024 * 1024,
          })
        ).stdout,
      ),
    };
  } catch (error) {
    return {
      code: error.code,
      result: JSON.parse(error.stdout || error.stderr),
    };
  }
}
const results = [];
for (const mode of ['passthrough', 'absent', 'scroll', 'frame']) {
  const evidence = JSON.parse(
    await readFile('packages/playwright/examples/after.json', 'utf8'),
  );
  evidence.id = `diagnostic-${mode}`;
  evidence.title = {
    passthrough: 'Transparent non-intercepting overlay permits Checkout',
    absent: 'Checkout is absent after reloading the cart',
    scroll: 'Checkout remains clickable after scrolling',
    frame: 'Child-frame hit testing cannot establish ancestor interception',
  }[mode];
  evidence.claim = evidence.title;
  evidence.variant = {
    id: mode,
    role: mode === 'absent' ? 'before' : 'after',
    label: mode === 'absent' ? 'Before' : 'After',
  };
  if (mode === 'absent') {
    evidence.expected = 'Checkout is visible after reloading';
    evidence.steps[1].title = 'Reload the cart';
    evidence.steps[2].title = 'Check whether Checkout is present';
    evidence.checkpoints[0].observations = ['screenshot', 'assertion'];
    evidence.checkpoints[0].highlights = []; // Absent controls have no measured outline.
  }
  const path = join(output, `${mode}.json`);
  await writeFile(path, JSON.stringify(evidence, null, 2));
  const captured = await invoke(
    'run',
    'packages/playwright/examples/interaction-diagnostics.spec.ts',
    '--playwright-config',
    'packages/playwright/examples/interaction-diagnostics.config.ts',
    '--evidence',
    path,
    '--url',
    `http://127.0.0.1:3193?case=${mode}`,
    '--out-dir',
    join(output, mode),
  );
  assert.equal(captured.result.runs?.length, 1, JSON.stringify(captured));
  const directory = captured.result.runs[0].directory;
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  const bounds = run.observations.find(
    (observation) => observation.kind === 'bounds',
  );
  const hit = run.observations.find(
    (observation) => observation.kind === 'hit-test',
  );
  if (mode === 'absent') {
    assert.equal(captured.result.ok, true);
    assert.equal(run.scenarioOutcome, 'bug-reproduced');
    assert.equal(bounds.status, 'failed');
    assert.equal(bounds.bounds, null);
    const frame = await invoke(
      'frame',
      directory,
      '--checkpoint',
      'result',
      '--target',
      'target',
    );
    assert.notEqual(
      frame.code,
      0,
      'An absent target must not acquire invented crop geometry',
    );
  } else if (mode === 'frame') {
    assert.equal(captured.result.ok, false);
    assert.equal(hit.status, 'unsupported');
    assert.equal(run.pipelineOutcome, 'inconclusive');
    const events = (await readFile(join(directory, 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const pointer = events.find(
      (event) =>
        event.kind === 'probe.pointer:path' &&
        event.payload.phase === 'pointerdown',
    );
    assert.ok(pointer, 'Child-frame pointer event is missing');
    assert.equal(pointer.payload.documentId, hit.data.documentId);
    assert.equal(pointer.payload.coordinateSpace, 'frame-viewport-css');
    assert.equal(pointer.payload.captureClock.method, 'page-sampled');
    const trigger = run.steps.find((step) => step.id === 'trigger');
    assert.ok(
      pointer.t_mono >= trigger.startMs - 1000 / 15 &&
        pointer.t_mono <= trigger.endMs + 1000 / 15,
    );
    assert.equal(
      (
        await invoke(
          'export',
          '--draft',
          directory,
          '--out-dir',
          join(output, 'forbidden-frame-export'),
        )
      ).code === 0,
      false,
    );
  } else {
    assert.equal(captured.result.ok, true, JSON.stringify(captured));
    assert.equal(hit.data.intendedReceives, true);
    assert.equal(hit.data.eventCorrelation.status, 'observed');
    assert.equal(hit.data.eventCorrelation.events[0].recipient, '#checkout');
    assert.equal(bounds.status, 'passed');
    if (mode === 'scroll') {
      assert.ok(bounds.bounds.y >= 0 && bounds.bounds.y < 720);
      assert.ok(
        hit.bounds.y < 1200,
        'Scroll transform must use viewport coordinates',
      );
    }
  }
  assert.equal(
    (await invoke('frame', directory, '--checkpoint', 'result')).code,
    0,
  );
  results.push({
    mode,
    directory,
    outcome: run.scenarioOutcome,
    pipeline: run.pipelineOutcome,
    bounds,
    hit,
  });
}
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log(`Diagnostic acceptance passed: ${join(output, 'acceptance.json')}`);
