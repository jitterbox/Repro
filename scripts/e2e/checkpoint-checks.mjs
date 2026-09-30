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
      '--draft',
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
    const sceneRef = updated.artifacts.find(
      (a) => a.kind === 'presentation-scene',
    );
    const scene = JSON.parse(
      await readFile(join(directory, sceneRef.path), 'utf8'),
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
        false,
        `Incorrect proof label on ${checkpoint}`,
      );
      // Full-page OCR can reorder a header beside a separate gutter panel.
      const titleImage = join(output, `${checkpoint}-title.png`);
      await execute('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-i',
        join(directory, image.path),
        '-vf',
        `crop=${scene.viewport.width}:${scene.sourceOrigin.y - scene.style.outerInset - 8}:${scene.style.outerInset}:${scene.style.outerInset},scale=iw*2:ih*2`,
        '-frames:v',
        '1',
        titleImage,
      ]);
      const titleText = await execute('tesseract', [
        titleImage,
        'stdout',
        '--psm',
        '6',
      ]);
      assert.match(titleText.stdout, /Checkout opens after Cart is ready/);
    }
    const outcome = scene.cues.find((cue) => cue.kind === 'outcome');
    assert.ok(outcome, 'The verified result needs an outcome beat');
    const video = updated.artifacts.find(
      (a) => a.kind === 'presentation-video',
    );
    const outcomeImage = join(output, 'verified-outcome.png');
    await execute('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      String((outcome.startMs + 500) / 1000),
      '-i',
      join(directory, video.path),
      '-frames:v',
      '1',
      outcomeImage,
    ]);
    const outcomeText = await execute('tesseract', [
      outcomeImage,
      'stdout',
      '--psm',
      '11',
    ]);
    assert.match(outcomeText.stdout, /Fix verified/i);
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
