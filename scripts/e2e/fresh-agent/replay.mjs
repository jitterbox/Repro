/** Deterministic replay of frozen fresh-agent submissions. This is not a new agent evaluation. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import {
  mkdir,
  mkdtemp,
  copyFile,
  readFile,
  writeFile,
  symlink,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { verifyTerminalCheckpoint } from '../terminal-checkpoint.mjs';
const execute = promisify(execFile);
const root = resolve(
  process.env.REPRO_FRESH_OUT ?? '.repro/fresh-agent-replay',
);
await mkdir(root, { recursive: true });
const attempt = await mkdtemp(join(root, 'attempt-'));
const catalog = JSON.parse(
  await readFile('testdata/fresh-agent/replay.json', 'utf8'),
);
const cli = resolve('packages/cli/dist/bin.js');
const server = spawn(
  process.execPath,
  [resolve('scripts/e2e/fresh-agent/server.mjs')],
  { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] },
);
const url = await new Promise((resolve, reject) => {
  let output = '';
  const timeout = setTimeout(() => {
    server.kill();
    reject(new Error('Fixture startup timed out'));
  }, 10000);
  server.once('error', reject);
  server.once('exit', (code) => {
    clearTimeout(timeout);
    reject(new Error(`Fixture exited: ${code}`));
  });
  server.stdout.on('data', (chunk) => {
    output += chunk;
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[0]);
    }
  });
});
const rows = [];
async function command(folder, label, ...args) {
  try {
    const { stdout } = await execute(process.execPath, [cli, ...args], {
      maxBuffer: 16e6,
    });
    await writeFile(join(folder, label + '.json'), stdout);
    return args[0] === 'validate-config' ? stdout : JSON.parse(stdout);
  } catch (error) {
    await writeFile(join(folder, label + '.error.txt'), String(error));
    throw error;
  }
}
try {
  for (const item of catalog.cases) {
    const folder = join(attempt, item.id);
    await mkdir(folder, { recursive: true });
    for (const [key, name] of Object.entries({
      spec: 'scenario.spec.ts',
      config: 'repro.config.json',
      playwrightConfig: 'playwright.config.ts',
      tsconfig: 'tsconfig.json',
      evidenceBefore: 'before.json',
      evidenceAfter: 'after.json',
    }))
      await copyFile(item[key], join(folder, name));
    const modules = join(folder, 'node_modules');
    await mkdir(join(modules, '@repro'), { recursive: true });
    await mkdir(join(modules, '@playwright'), { recursive: true });
    await symlink(
      resolve('packages/playwright'),
      join(modules, '@repro/playwright'),
      'dir',
    );
    const require = createRequire(resolve('packages/playwright/package.json'));
    await symlink(
      dirname(require.resolve('@playwright/test/package.json')),
      join(modules, '@playwright/test'),
      'dir',
    );
    await command(
      folder,
      'validate-config',
      'validate-config',
      '--config',
      join(folder, 'repro.config.json'),
    );
    const row = { id: item.id, runs: {}, tails: {} };
    for (const role of ['before', 'after']) {
      await command(
        folder,
        `validate-${role}`,
        'validate-evidence',
        join(folder, role + '.json'),
      );
      const result = await command(
        folder,
        `run-${role}`,
        'run',
        join(folder, 'scenario.spec.ts'),
        '--playwright-config',
        join(folder, 'playwright.config.ts'),
        '--config',
        join(folder, 'repro.config.json'),
        '--evidence',
        join(folder, role + '.json'),
        '--url',
        `${url}/${item.id}/${role}`,
        '--build-id',
        `heldout-${role}`,
        '--out-dir',
        folder,
      );
      assert.equal(result.ok, true, `${item.id}/${role}: pipeline`);
      assert.equal(result.runs.length, 1);
      const run = result.runs[0];
      assert.equal(
        run.run.scenarioOutcome,
        role === 'before' ? 'bug-reproduced' : 'fix-verified',
      );
      row.runs[role] = run.directory;
      await command(folder, `render-${role}`, 'render', run.directory);
      row.tails[role] = await verifyTerminalCheckpoint(
        run.directory,
        join(folder, `terminal-${role}`),
      );
      if (['FA-03', 'FA-04'].includes(item.id)) {
        const manifest = JSON.parse(
          await readFile(join(run.directory, 'run.json'), 'utf8'),
        );
        assert.equal(
          manifest.environment.appliedConfiguration.profile,
          'faithful',
        );
        assert.ok(
          manifest.observations.some(
            (o) =>
              o.kind === 'screenshot' && o.data?.selection === 'event-linked',
          ),
        );
      }
    }
    if (!['FA-03', 'FA-04'].includes(item.id))
      assert.equal(
        (
          await command(
            folder,
            'compare',
            'compare',
            row.runs.before,
            row.runs.after,
          )
        ).ok,
        true,
      );
    row.passed = true;
    rows.push(row);
    await writeFile(
      join(attempt, 'progress.json'),
      JSON.stringify(rows, null, 2),
    );
    console.log(`${item.id}: deterministic replay passed`);
  }
  const native = await command(
    attempt,
    'native',
    'discover',
    catalog.native.ticket,
    '--assessment',
    catalog.native.assessment,
  );
  assert.equal(native.evidenceDraft, null);
  assert.equal(native.status, 'unsupported-surface');
  rows.push({ id: 'FA-06', passed: true, unsupported: true });
  await writeFile(
    join(attempt, 'acceptance.json'),
    JSON.stringify(
      { passed: true, kind: 'deterministic-replay-not-fresh-agent', rows },
      null,
      2,
    ),
  );
  console.log(`Replay passed: ${attempt}`);
} finally {
  server.kill();
}
