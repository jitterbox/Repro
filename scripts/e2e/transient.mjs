/** Real transient pixels selected from calibrated pointer events after capture has completed. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const output = resolve(process.env.REPRO_TRANSIENT_OUT ?? '.repro/transient');
await mkdir(output, { recursive: true });
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
for (const role of ['before', 'after', 'missing-event']) {
  const spec = JSON.parse(
    await readFile('packages/playwright/examples/after.json', 'utf8'),
  );
  spec.id = 'loading-flash';
  spec.title = 'Content stays visible while loading';
  spec.claim =
    'Loading flashes red before the fix and preserves green content afterward';
  spec.expected = 'Content never flashes red';
  spec.variant = {
    id: role,
    role: role === 'before' ? 'before' : 'after',
    label: role === 'before' ? 'Before' : 'After',
  };
  spec.targets = [{ id: 'target', description: 'Content panel' }];
  spec.segments = [
    { id: 'loading', title: 'Load through completion', step: 'trigger' },
  ];
  spec.steps[0].title = 'Open content';
  spec.steps[1].title = 'Load and observe the transition';
  spec.steps[2].title = 'Verify no flash occurred';
  spec.checkpoints = [
    {
      id: 'during',
      step: 'trigger',
      title: 'Content 100 ms after Load',
      observations: ['screenshot'],
      timing: 'transient',
      frame: {
        segment: 'loading',
        event: {
          kind: 'probe.pointer:path',
          match: {
            phase: role === 'missing-event' ? 'not-an-event' : 'pointerdown',
          },
        },
        offsetMs: 100,
      },
    },
    {
      id: 'result',
      step: 'verify',
      title: 'Completed loading',
      observations: ['screenshot', 'assertion'],
    },
  ];
  const evidence = join(output, role + '.json');
  await writeFile(evidence, JSON.stringify(spec));
  const captured = await invoke(
    'run',
    'packages/playwright/examples/transient.spec.ts',
    '--playwright-config',
    'packages/playwright/examples/transient.config.ts',
    '--evidence',
    evidence,
    '--url',
    'http://127.0.0.1:3196' + (role === 'before' ? '' : '?fixed=1'),
    '--out-dir',
    output,
  );
  const directory = captured.result.runs[0].directory;
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  if (role === 'missing-event') {
    assert.notEqual(captured.code, 0);
    assert.equal(run.pipelineOutcome, 'inconclusive');
    assert.match(
      run.observations.find((o) => o.checkpoint === 'during').detail,
      /event occurrence/,
    );
    const denied = await invoke(
      'export',
      directory,
      '--out-dir',
      join(output, 'rejected'),
    );
    assert.notEqual(denied.code, 0);
    results.push({ role, directory, rejected: true });
    continue;
  }
  assert.equal(captured.code, 0, JSON.stringify(captured));
  assert.equal(
    run.scenarioOutcome,
    role === 'before' ? 'bug-reproduced' : 'fix-verified',
  );
  const shot = run.observations.find(
    (o) => o.checkpoint === 'during' && o.kind === 'screenshot',
  );
  assert.equal(shot.data.selection, 'event-linked');
  assert.ok(shot.data.uncertaintyMs <= 2000 / 30);
  assert.ok(
    shot.timeMs <
      run.observations.find((o) => o.checkpoint === 'result').timeMs,
  );
  const selected = await invoke('frame', directory, '--checkpoint', 'during');
  assert.equal(selected.code, 0);
  assert.equal(selected.result.uncertaintyMs, shot.data.uncertaintyMs);
  const pixel = await execute(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      selected.result.context,
      '-vf',
      'crop=20:20:300:300,scale=1:1,format=rgb24',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { encoding: 'buffer' },
  );
  const [r, g, b] = pixel.stdout;
  assert.ok(
    role === 'before'
      ? r > 200 && g < 40 && b < 40
      : g > 90 && r < 40 && b < 40,
    role + ': ' + [r, g, b],
  );
  results.push({
    role,
    directory,
    actualMs: shot.timeMs,
    selectionOffsetMs: shot.data.selectionOffsetMs,
    eventId: shot.data.eventId,
    pixel: [r, g, b],
  });
}
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log('Transient frames passed: ' + join(output, 'acceptance.json'));
