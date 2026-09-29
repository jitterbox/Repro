import { createHash } from 'node:crypto';
import { packRelease } from '../release.mjs';
/** Install packed release artifacts in an unrelated project; never resolve workspace sources. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rename, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'repro-install-'));
const release = await packRelease(join(root, 'release'));
const project = join(root, 'consumer');
await rename(release.output, project);
for (const [file, digest] of Object.entries(release.checksums))
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(project, file)))
      .digest('hex'),
    digest,
  );
assert.ok(
  Object.values(release.manifest.pnpm.overrides).every((value) =>
    value.startsWith('file:./tarballs/'),
  ),
);
console.log(`Installing packed packages in ${project}`);
await exec(
  'pnpm',
  ['install', ...(process.env.REPRO_OFFLINE ? ['--offline'] : [])],
  { cwd: project, maxBuffer: 8 * 1024 * 1024 },
);
const cli = join(project, 'node_modules/@repro/cli/dist/bin.js');
// A nested evidence project must not inherit its host app's compiler setup.
await writeFile(
  join(root, 'tsconfig.json'),
  JSON.stringify({ extends: './unavailable-parent-config.json' }),
);
const { stdout } = await exec(
  process.execPath,
  [cli, 'capabilities', '--json'],
  { cwd: project },
);
assert.ok(JSON.parse(stdout).some((c) => c.id === 'run'));
await exec(process.execPath, [cli, 'init'], { cwd: project });
await exec(process.execPath, [cli, 'validate-evidence', 'evidence.json'], {
  cwd: project,
});
await exec(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `import { createRequire } from 'node:module';
     import { realpathSync } from 'node:fs';
     import { pathToFileURL } from 'node:url';
     import assert from 'node:assert/strict';
     await import('@repro/playwright'); await import('@repro/mcp');
     const cliRequire = createRequire(realpathSync(${JSON.stringify(cli)}));
     const pipelineRequire = createRequire(cliRequire.resolve('@repro/pipeline'));
     const { loadCoverageMatrix } = await import(pathToFileURL(pipelineRequire.resolve('@repro/evaluation')).href);
     assert.equal((await loadCoverageMatrix()).compareLayouts.length, 7);`,
  ],
  { cwd: project },
);
await writeFile(
  join(project, 'server.mjs'),
  await readFile(resolve('packages/playwright/examples/server.mjs')),
);
const configPath = join(project, 'playwright.config.ts');
await writeFile(
  configPath,
  (await readFile(configPath, 'utf8')).replace(
    'testDir:',
    "webServer: { command: 'node server.mjs', url: 'http://127.0.0.1:3198' }, testDir:",
  ),
);
const captured = await exec(
  process.execPath,
  [
    cli,
    'run',
    'scenario.spec.ts',
    '--evidence',
    'evidence.json',
    '--config',
    'repro.config.json',
    '--playwright-config',
    'playwright.config.ts',
    '--url',
    'http://127.0.0.1:3198',
  ],
  { cwd: project, maxBuffer: 8 * 1024 * 1024 },
);
assert.equal(JSON.parse(captured.stdout).ok, true);
// An external CLI must launch the consumer fixture's runner, not its own copy.
const external = await exec(
  process.execPath,
  [
    resolve('packages/cli/dist/bin.js'),
    'run',
    'scenario.spec.ts',
    '--evidence',
    'evidence.json',
    '--config',
    'repro.config.json',
    '--playwright-config',
    'playwright.config.ts',
    '--url',
    'http://127.0.0.1:3198',
    '--out-dir',
    '.repro/external-cli',
  ],
  { cwd: project, maxBuffer: 8 * 1024 * 1024 },
);
assert.equal(JSON.parse(external.stdout).ok, true);
console.log(`Clean installation passed: ${project}`);
