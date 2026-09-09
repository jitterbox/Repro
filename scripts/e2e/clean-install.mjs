/** Install packed release artifacts in an unrelated project; never resolve workspace sources. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'repro-install-'));
const tarballs = join(root, 'tarballs');
await mkdir(tarballs);
const overrides = {};
for (const directory of await readdir('packages')) {
  const pkg = JSON.parse(
    await readFile(join('packages', directory, 'package.json'), 'utf8'),
  );
  if (pkg.private) continue;
  console.log(`Packing ${pkg.name}`);
  await exec('pnpm', ['pack', '--pack-destination', tarballs], {
    cwd: resolve('packages', directory),
  });
  overrides[pkg.name] =
    `file:${join(tarballs, pkg.name.replace('@', '').replace('/', '-') + '-' + pkg.version + '.tgz')}`;
}
const project = join(root, 'consumer');
await mkdir(project);
await writeFile(
  join(project, 'package.json'),
  JSON.stringify(
    {
      name: 'repro-clean-install-test',
      packageManager: 'pnpm@9.15.0',
      private: true,
      type: 'module',
      dependencies: {
        '@repro/cli': overrides['@repro/cli'],
        '@repro/playwright': overrides['@repro/playwright'],
        '@repro/mcp': overrides['@repro/mcp'],
        '@playwright/test': '1.62.0',
      },
      pnpm: { overrides },
    },
    null,
    2,
  ),
);
console.log(`Installing packed packages in ${project}`);
await exec(
  'pnpm',
  ['install', ...(process.env.REPRO_OFFLINE ? ['--offline'] : [])],
  { cwd: project, maxBuffer: 8 * 1024 * 1024 },
);
const cli = join(project, 'node_modules/@repro/cli/dist/bin.js');
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
    "import('@repro/playwright'); import('@repro/mcp');",
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
