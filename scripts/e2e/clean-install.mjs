import { packageManagerInvocation } from '../package-manager.mjs';
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
const install = packageManagerInvocation('pnpm', [
  'install',
  ...(process.env.REPRO_OFFLINE ? ['--offline'] : []),
]);
await exec(install.command, install.args, {
  cwd: project,
  maxBuffer: 8 * 1024 * 1024,
});
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
await exec(process.execPath, [cli, 'init', 'PORTABLE-949'], { cwd: project });
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
  (
    await readFile(resolve('packages/playwright/examples/server.mjs'), 'utf8')
  ).replace(
    '<title>',
    '<meta name="app-version" content="2.7.1"><meta name="build-id" content="runtime-42"><title>',
  ),
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
const discovered = JSON.parse(
  await readFile(
    join(JSON.parse(captured.stdout).runs[0].directory, 'run.json'),
    'utf8',
  ),
);
assert.equal(discovered.environment.appVersion.version, '2.7.1');
assert.equal(discovered.environment.appVersion.sources.version, 'runtime');
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
    '--app-version',
    '3.0.0',
    '--build-id',
    'provided-99',
  ],
  { cwd: project, maxBuffer: 8 * 1024 * 1024 },
);
assert.equal(JSON.parse(external.stdout).ok, true);
const suppliedVersion = JSON.parse(
  await readFile(
    join(JSON.parse(external.stdout).runs[0].directory, 'run.json'),
    'utf8',
  ),
).environment.appVersion;
assert.equal(suppliedVersion.version, '3.0.0');
assert.equal(suppliedVersion.build, 'provided-99');
assert.equal(suppliedVersion.sources.version, 'provided');
console.log(`Clean installation passed: ${project}`);

// Exercise the packaged scene compositor with non-default typography/layout/encoding.
async function consumerCli(...args) {
  const started = performance.now();
  console.log(`Consumer ${args[0]} started`);
  const { stdout } = await exec(process.execPath, [cli, ...args], {
    cwd: project,
    maxBuffer: 16 * 1024 * 1024,
  });
  console.log(
    `Consumer ${args[0]} passed in ${Math.round(performance.now() - started)}ms`,
  );
  return JSON.parse(stdout);
}
const run = JSON.parse(captured.stdout).runs[0].directory;
const defaultsFile = join(project, 'treatment.json');
await consumerCli('defaults', '--out', defaultsFile);
const treatment = JSON.parse(await readFile(defaultsFile, 'utf8'));
treatment.style = {
  ...treatment.style,
  bodyFontSize: 20,
  headingFontSize: 24,
  cardWidth: 400,
  cardPadding: 16,
  outerInset: 32,
  gutterGap: 32,
  background: '#182536',
  criticalAccent: '#f5a56b',
};
treatment.encoding = { crf: 22, preset: 'fast' };
treatment.treatments = [
  {
    id: 'detail',
    kind: 'callout',
    checkpoint: 'result',
    target: 'target',
    severity: 'critical',
    title: 'Pointer recipient',
    detail: 'The measured checkpoint preserves the browser result.',
    rationale: 'Explain the actual interaction',
    expected: 'The intended control receives the click.',
  },
  {
    id: 'zoom',
    kind: 'magnifier',
    checkpoint: 'result',
    target: 'target',
    title: 'Measured control',
    rationale: 'Inspect the actual captured pixels',
    magnification: 2,
  },
];
await writeFile(defaultsFile, JSON.stringify(treatment));
await consumerCli('validate-treatment', defaultsFile);
const rendered = await consumerCli(
  'render',
  run,
  '--renderer',
  'hyperframes',
  '--treatment',
  defaultsFile,
);
assert.equal(rendered.receipt.encoding.crf, 22);
assert.equal(rendered.receipt.encoding.preset, 'fast');
assert.equal(rendered.receipt.randomSeekPassed, true);
assert.equal(rendered.receipt.layoutFramesChecked, rendered.receipt.frameCount);
const scene = JSON.parse(
  await readFile(join(rendered.directory, 'scene.json'), 'utf8'),
);
assert.equal(scene.output.width, scene.viewport.width + 400 + 64 + 32);
assert.equal(scene.style.bodyFontSize, 20);
assert.equal(scene.encoding.crf, 22);
const versionCue = scene.cues.find((cue) => cue.kind === 'app-version');
assert.ok(versionCue, 'Runtime app version is displayed by default');
assert.equal(versionCue.detail, 'Version 2.7.1\nBuild runtime-42');
assert.equal(versionCue.startMs, 0);
assert.equal(
  versionCue.endMs,
  scene.segments.at(-1).outStartMs + scene.segments.at(-1).outDurationMs,
);
const layout = JSON.parse(
  await readFile(join(rendered.directory, 'layout.json'), 'utf8'),
);
assert.ok(layout.every((card) => card.width === 400));
const bundle = await consumerCli(
  'export',
  run,
  '--draft',
  '--out-dir',
  join(project, 'share'),
);
assert.ok(
  bundle.manifest.assets.some(
    (asset) =>
      asset.kind === 'mp4' &&
      asset.href === 'assets/PORTABLE-949_before_repro.mp4',
  ),
);
const devtoolsAsset = bundle.manifest.assets.find(
  (asset) => asset.kind === 'devtools',
);
assert.equal(devtoolsAsset?.href, 'assets/PORTABLE-949_before_devtools.json');
const devtoolsBytes = await readFile(
  join(project, 'share', devtoolsAsset.href),
);
const diagnostic = JSON.parse(devtoolsBytes);
assert.equal(diagnostic.workItem, 'PORTABLE-949');
assert.equal(diagnostic.video, 'PORTABLE-949_before_repro.mp4');
assert.equal(diagnostic.frames.length, rendered.receipt.frameCount);
assert.ok(diagnostic.events.some((event) => event.kind === 'browser.request'));
assert.ok(diagnostic.coverage.length > 0);
await consumerCli('frame', run, '--checkpoint', 'result');
const { spawn } = await import('node:child_process');
const reviewer = spawn(
  process.execPath,
  [cli, 'review', run, '--presentation'],
  { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] },
);
try {
  const address = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(
      () => reject(new Error('Review server timeout')),
      20000,
    );
    reviewer.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    reviewer.stdout.on('data', (chunk) => {
      output += chunk;
      try {
        const parsed = JSON.parse(output);
        clearTimeout(timeout);
        resolve(parsed.url);
      } catch {
        /* Wait for complete JSON. */
      }
    });
    reviewer.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Review exited ${code}`));
    });
  });
  assert.match(
    await (await fetch(address)).text(),
    /Synchronized evidence review/,
  );
} finally {
  reviewer.kill();
}
const { mkdir, copyFile } = await import('node:fs/promises');
await mkdir('.repro', { recursive: true });
await writeFile(
  '.repro/portable-install.json',
  JSON.stringify(
    {
      platform: process.platform,
      project,
      version: '0.2.1',
      capture: true,
      scene: true,
      strictExport: true,
      review: true,
      receipt: rendered.receipt,
    },
    null,
    2,
  ),
);
console.log(`Packed scene/strict export/review passed: ${project}`);

await mkdir('.repro/portable-artifacts', { recursive: true });
await writeFile(
  '.repro/portable-artifacts/PORTABLE-949_before_devtools.json',
  devtoolsBytes,
);
await copyFile(rendered.outputPath, '.repro/portable-artifacts/proof.mp4');
await copyFile(
  join(rendered.directory, 'result.png'),
  '.repro/portable-artifacts/checkpoint.png',
);
await copyFile(
  join(rendered.directory, 'render-receipt.json'),
  '.repro/portable-artifacts/render-receipt.json',
);
