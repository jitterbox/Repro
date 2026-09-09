/** Execute every published recipe unchanged apart from its explicit before/after variant. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const output = resolve(process.env.REPRO_RECIPES_OUT ?? '.repro/recipes');
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
const discovered = await invoke('recipes', '--json');
assert.equal(discovered.code, 0);
const recipes = discovered.result;
assert.equal(recipes.length, 3);
const results = [];
for (const recipe of recipes) {
  const fixture =
    recipe.id === 'interaction'
      ? { spec: 'scenario', config: 'playwright', port: 3198 }
      : {
          spec: recipe.id,
          config: recipe.id,
          port: recipe.id === 'geometry' ? 3194 : 3196,
        };
  const directories = [];
  for (const role of ['before', 'after']) {
    const spec = {
      ...recipe,
      variant: {
        id: role,
        role,
        label: role === 'before' ? 'Before' : 'After',
      },
    };
    const evidence = join(output, recipe.id + '-' + role + '.json');
    await writeFile(evidence, JSON.stringify(spec, null, 2));
    assert.equal((await invoke('validate-evidence', evidence)).code, 0);
    const captured = await invoke(
      'run',
      `packages/playwright/examples/${fixture.spec}.spec.ts`,
      '--playwright-config',
      `packages/playwright/examples/${fixture.config}.config.ts`,
      '--evidence',
      evidence,
      '--url',
      `http://127.0.0.1:${fixture.port}${role === 'after' ? '?fixed=1' : ''}`,
      '--out-dir',
      output,
    );
    assert.equal(captured.code, 0, JSON.stringify(captured));
    const directory = captured.result.runs[0].directory;
    directories.push(directory);
    const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
    assert.equal(
      run.scenarioOutcome,
      role === 'before' ? 'bug-reproduced' : 'fix-verified',
    );
    assert.equal(run.steps.length, recipe.steps.length);
    for (const checkpoint of recipe.checkpoints) {
      const selected = await invoke(
        'frame',
        directory,
        '--checkpoint',
        checkpoint.id,
      );
      assert.equal(selected.code, 0);
      assert.ok(selected.result.context);
    }
  }
  const compared = await invoke('compare', ...directories);
  assert.equal(compared.code, 0, JSON.stringify(compared));
  assert.equal(compared.result.ok, true);
  if (recipe.id === 'geometry')
    assert.equal(compared.result.geometryDeltas[0].dx, -12);
  if (recipe.id === 'transient') {
    for (const [index, directory] of directories.entries()) {
      const rendered = await invoke('render', directory);
      assert.equal(rendered.code, 0, JSON.stringify(rendered));
      const run = JSON.parse(
        await readFile(join(directory, 'run.json'), 'utf8'),
      );
      const image = run.artifacts.find(
        (a) =>
          a.kind === 'presentation-image' && a.path.endsWith('/during.png'),
      );
      assert.ok(image);
      const pixels = await execute(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          join(directory, image.path),
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
      const [r, g, b] = pixels.stdout;
      assert.ok(
        index === 0 ? r > 200 && g < 40 && b < 40 : g > 90 && r < 40 && b < 40,
      );
      const text = await execute('tesseract', [
        join(directory, image.path),
        'stdout',
        '--psm',
        '11',
      ]);
      assert.ok(
        !/Bug reproduced|Fix verified/.test(text.stdout),
        'Transient frame cannot borrow the later outcome',
      );
    }

    const exported = await invoke(
      'export',
      directories[1],
      '--baseline',
      directories[0],
      '--out-dir',
      join(output, 'transient-bundle'),
    );
    assert.equal(exported.code, 0, JSON.stringify(exported));
  }
  results.push({
    recipe: recipe.id,
    before: directories[0],
    after: directories[1],
    matched: compared.result.matched.length,
  });
}
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log('Published recipes passed: ' + join(output, 'acceptance.json'));
