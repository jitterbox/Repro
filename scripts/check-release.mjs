/** Inspect real pnpm-produced tarballs, including workspace dependency rewriting. */
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { packRelease } from './release.mjs';
const exec = promisify(execFile);
const root = JSON.parse(await readFile('package.json', 'utf8'));
const destination =
  process.argv[2] ??
  join(await mkdtemp(join(tmpdir(), 'repro-release-')), 'release');
const { output, checksums } = await packRelease(destination);
for (const file of Object.keys(checksums)) {
  const archive = join(output, file);
  const { stdout: listing } = await exec('tar', ['-tzf', archive]);
  const files = listing.trim().split(/\r?\n/);
  const { stdout: metadata } = await exec('tar', [
    '-xOf',
    archive,
    'package/package.json',
  ]);
  const pkg = JSON.parse(metadata);
  assert.equal(pkg.version, root.version);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.publishConfig.access, 'public');
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    assert.ok(
      !String(version).startsWith('workspace:'),
      `${name}: unresolved workspace dependency`,
    );
    if (name.startsWith('@jitterbox/repro-'))
      assert.equal(version, root.version);
  }
  for (const path of ['LICENSE', 'README.md', ...Object.values(pkg.bin ?? {})])
    assert.ok(
      files.includes(`package/${path.replace(/^\.\//, '')}`),
      `${pkg.name}: missing ${path}`,
    );
  assert.ok(
    !files.some((f) =>
      /(?:^|\/)(?:\.repro|node_modules|\.env|test-results)(?:\/|$)/.test(f),
    ),
    `Private/runtime files in ${pkg.name}`,
  );
  const retired = {
    '@jitterbox/repro-render': [
      'ass',
      'ass-source',
      'compare-encode',
      'encode-pipeline',
      'filtergraph',
      'theme',
      'text-fit',
      'voiceover',
    ],
    '@jitterbox/repro-compositor': [
      'render',
      'card-view',
      'theme.css',
      'types',
    ],
    '@jitterbox/repro-pipeline': [
      'commands/annotate',
      'commands/render-compare',
    ],
    '@jitterbox/repro-cli': ['commands/annotate', 'commands/render-compare'],
  };
  for (const module of retired[pkg.name] ?? [])
    assert.ok(
      !files.some((f) => f.startsWith(`package/dist/${module}.`)),
      `${pkg.name}: retired module ${module} leaked into tarball`,
    );
  if (pkg.name === '@jitterbox/repro-compositor')
    assert.ok(
      !files.some((f) => f.startsWith('package/dist/components/')),
      'Retired PNG card components leaked into tarball',
    );
  if (pkg.name === '@jitterbox/repro-cli') {
    for (const path of [
      'skills/repro-setup/SKILL.md',
      'skills/repro-capture/SKILL.md',
      'docs/reference/cli.md',
      'docs/reference/mcp.md',
      'docs/configuration.md',
      'assets/branding/repro-logo.png',
    ])
      assert.ok(files.includes(`package/${path}`), `CLI missing ${path}`);
  }
}
console.log(
  JSON.stringify(
    {
      version: root.version,
      packages: Object.keys(checksums).length,
      output,
      checked: true,
    },
    null,
    2,
  ),
);
