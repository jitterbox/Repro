/** Public CLI captures actual console, HTTP and transport failures and reviews their event references. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
const execute = promisify(execFile);
const output = resolve(
  process.env.REPRO_BROWSER_DIAGNOSTICS_OUT ?? '.repro/browser-diagnostics',
);
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
async function startReview(after) {
  const child = spawn(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), 'review', after],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Review startup timed out'));
    }, 20000);
    let text = '',
      errors = '';
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Review exited ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (!text.includes('\n')) return;
      try {
        const parsed = JSON.parse(text);
        clearTimeout(timeout);
        resolve(parsed.url);
      } catch {
        /* Wait for the complete JSON line. */
      }
    });
  });
  return {
    url,
    close: () =>
      new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
      }),
  };
}

const results = [];
for (const role of ['before', 'after']) {
  const spec = JSON.parse(
    await readFile('packages/playwright/examples/after.json', 'utf8'),
  );
  spec.id = 'checkout-network';
  spec.title = 'Checkout recovers from request failures';
  spec.variant = {
    id: role,
    role,
    label: role === 'before' ? 'Before' : 'After',
  };
  spec.targets = [];
  spec.checkpoints[0].targets = [];
  spec.checkpoints[0].observations = ['screenshot', 'assertion'];
  spec.privacy.patterns = ['PRIVATE_QUERY_CANARY'];
  const evidence = join(output, role + '.json');
  await writeFile(evidence, JSON.stringify(spec));
  const captured = await invoke(
    'run',
    'packages/playwright/examples/diagnostics.spec.ts',
    '--playwright-config',
    'packages/playwright/examples/diagnostics.config.ts',
    '--evidence',
    evidence,
    '--url',
    'http://127.0.0.1:3197' + (role === 'after' ? '?fixed=1' : ''),
    '--out-dir',
    output,
  );
  assert.equal(captured.code, 0, JSON.stringify(captured));
  const directory = captured.result.runs[0].directory;
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  assert.equal(
    run.scenarioOutcome,
    role === 'before' ? 'bug-reproduced' : 'fix-verified',
  );
  const failure = run.diagnostics.find((d) => d.kind === 'request-failure');
  if (role === 'before') {
    for (const kind of [
      'console',
      'exception',
      'http-error',
      'request-failure',
    ])
      assert.ok(
        run.diagnostics.some((d) => d.kind === kind),
        kind,
      );
    assert.equal(
      run.diagnostics.find((d) => d.kind === 'http-error').status,
      503,
    );
    assert.equal(failure.stepId, 'trigger');
    assert.ok(failure.requestStartedMs <= failure.timeMs);
    assert.equal(failure.timing, 'host-receipt');
    assert.equal(failure.uncertaintyMs, null);
    assert.ok(run.diagnostics.every((d) => !d.url?.includes('?')));
    const events = await readFile(join(directory, 'events.jsonl'), 'utf8');
    assert.ok(!events.includes('private@example.com'));
    assert.ok(!events.includes('PRIVATE_QUERY_CANARY'));
    assert.ok(!JSON.stringify(run.diagnostics).includes('private@example.com'));
    const server = await startReview(directory);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(server.url);
      await page.waitForFunction(
        () => document.querySelector('video').readyState >= 1,
      );
      const row = page.locator('[data-event-id="' + failure.eventId + '"]');
      assert.match(await row.textContent(), /request-failure/);
      await row.getByRole('button').click();
      await page.waitForFunction(
        () => !document.querySelector('video').seeking,
      );
      const time = await page
        .locator('video')
        .evaluate((v) => v.currentTime * 1000);
      assert.ok(
        Math.abs(time - (failure.timeMs - run.environment.recordingStartMs)) <
          40,
      );
      assert.equal(await page.getByLabel('Original timing').isChecked(), true);
      await page.screenshot({
        path: join(output, 'diagnostics.png'),
        fullPage: true,
      });
    } finally {
      await browser.close();
      await server.close();
    }
  } else assert.equal(run.diagnostics.length, 0);
  results.push({ role, directory, diagnostics: run.diagnostics.length });
}
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log('Browser diagnostics passed: ' + join(output, 'acceptance.json'));
