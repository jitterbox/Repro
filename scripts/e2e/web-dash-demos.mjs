import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const scenarios = resolve('packages/playwright/examples/web-dash');
const output = resolve('.repro/bug-corpus/web-dash');
const names = ['sales-calendar', 'settings-panel', 'mobile-checks'];
const selected = process.env.REPRO_WEBDASH_DEMO
  ? [process.env.REPRO_WEBDASH_DEMO]
  : names;
for (const name of selected)
  assert.ok(names.includes(name), `Unknown demo: ${name}`);
await mkdir(output, { recursive: true });
async function cli(env, ...args) {
  const result = await exec(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), ...args],
    {
      env: { ...process.env, ...env, OMP_THREAD_LIMIT: '1' },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return args[0] === 'validate-config' ? {} : JSON.parse(result.stdout);
}
for (const name of selected) {
  await cli(
    {},
    'validate-config',
    '--config',
    join(scenarios, `${name}.config.json`),
  );
  await cli({}, 'validate-evidence', join(scenarios, `${name}.evidence.json`));
  await cli(
    {},
    'validate-treatment',
    join(scenarios, `${name}.treatment.json`),
  );
}
if (process.argv.includes('--validate-only')) {
  console.log(
    `Validated ${selected.length} Web-Dash scenario configurations; no captures executed.`,
  );
  process.exit(0);
}
// Fail before any credentials are loaded or recorded. Never install the app's
// E2E mock fallback: the point of this corpus is real application behavior.
const origin = process.env.REPRO_WEBDASH_URL ?? 'http://localhost:4200';
try {
  const response = await fetch(`${origin}/api/auth/csrf`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`API status ${response.status}`);
} catch {
  throw new Error(
    'Web-Dash API is unreachable. Restore the configured API/VPN connection before recording. No mock fallback or successful demo artifacts were generated.',
  );
}
const results = JSON.parse(
  await readFile(join(output, 'results.json'), 'utf8').catch(() => '[]'),
);
for (const name of selected) {
  console.log(`${name}: capturing real Web-Dash UI`);
  const captured = await cli(
    { REPRO_WEBDASH_DEMO: name },
    'run',
    join(scenarios, 'walkthrough.spec.ts'),
    '--playwright-config',
    join(scenarios, 'playwright.config.ts'),
    '--config',
    join(scenarios, `${name}.config.json`),
    '--evidence',
    join(scenarios, `${name}.evidence.json`),
    '--url',
    `${origin}/dev-login`,
    '--out-dir',
    join(output, 'runs'),
  );
  assert.ok(captured.ok);
  const run = captured.runs[0].directory;
  const manifest = JSON.parse(await readFile(join(run, 'run.json'), 'utf8'));
  assert.equal(manifest.pipelineOutcome, 'passed');
  assert.equal(manifest.variant.role, 'standalone');
  const rendered = await cli(
    {},
    'render',
    run,
    '--treatment',
    join(scenarios, `${name}.treatment.json`),
  );
  const receipt = JSON.parse(
    await readFile(join(rendered.directory, 'render-receipt.json'), 'utf8'),
  );
  assert.equal(receipt.randomSeekPassed, true);
  assert.equal(receipt.layoutFramesChecked, receipt.frameCount);
  const bundle = join(output, 'bundles', name);
  console.log(`${name}: auditing all exported media`);
  await cli({}, 'export', run, '--draft', '--out-dir', bundle);
  await copyFile(rendered.outputPath, join(output, `${name}.mp4`));
  await copyFile(
    join(rendered.directory, 'result.png'),
    join(output, `${name}.png`),
  );
  const spec = JSON.parse(
    await readFile(join(scenarios, `${name}.evidence.json`), 'utf8'),
  );
  const config = JSON.parse(
    await readFile(join(scenarios, `${name}.config.json`), 'utf8'),
  );
  const checkout =
    process.env.REPRO_WEBDASH_CHECKOUT ?? '/home/cory/repos/Web-Dash';
  const revision = (
    await exec('git', ['-C', checkout, 'rev-parse', 'HEAD'])
  ).stdout.trim();
  const dirty = !!(
    await exec('git', ['-C', checkout, 'status', '--porcelain'])
  ).stdout.trim();
  const item = {
    name,
    title: spec.title,
    viewport: config.viewport,
    role: process.env.REPRO_WEBDASH_ROLE ?? 'DM',
    run,
    rendered,
    bundle,
    application: {
      origin,
      revision,
      dirty,
      backend: 'configured live API',
      mocked: false,
    },
    sha256: createHash('sha256')
      .update(await readFile(rendered.outputPath))
      .digest('hex'),
    frameCount: receipt.frameCount,
    status: 'recorded-and-audited',
  };
  const index = results.findIndex((r) => r.name === name);
  if (index < 0) results.push(item);
  else results[index] = item;
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(`${name}: ${join(output, `${name}.mp4`)}`);
}
if (names.every((name) => results.some((r) => r.name === name)))
  await exec(process.execPath, [resolve('scripts/e2e/web-dash-check.mjs')]);
await exec(process.execPath, [resolve('scripts/e2e/bug-corpus-gallery.mjs')]);
