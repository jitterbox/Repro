/** Called only by an explicitly requested release, never by build or installation. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { packageManagerInvocation } from './package-manager.mjs';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const local = process.argv.includes('--local');
const tag = `v${version}`;
const { stdout: head } = await exec('git', ['rev-parse', 'HEAD']);
const { stdout: tagged } = await exec('git', ['rev-parse', `${tag}^{commit}`]);
if (head.trim() !== tagged.trim())
  throw new Error(`Checkout must match ${tag}`);
const { stdout: dirty } = await exec('git', ['status', '--porcelain']);
if (dirty.trim()) throw new Error('Publish from a clean checkout');
if (!local && process.env.GITHUB_REF !== `refs/tags/${tag}`)
  throw new Error(
    `Dispatch from tag ${tag}, or use --local from that tagged commit.`,
  );
if (process.argv.includes('--check-tag')) process.exit(0);
const directory = process.argv[2];
if (!directory) throw new Error('Provide a checked release directory');
const checksums = JSON.parse(
  await readFile(join(directory, 'checksums.json'), 'utf8'),
);
// Verify every archive before the first external write.
for (const [file, expected] of Object.entries(checksums)) {
  if (!/^tarballs\/jitterbox-repro-[a-z-]+-[\d.]+\.tgz$/.test(file))
    throw new Error('Invalid archive path');
  if (
    createHash('sha256')
      .update(await readFile(join(directory, file)))
      .digest('hex') !== expected
  )
    throw new Error(`Modified archive: ${file}`);
}
// Dependency order comes from manifests, not directory spelling.
const pending = new Map();
for (const file of Object.keys(checksums)) {
  const { stdout } = await exec('tar', [
    '-xOf',
    join(directory, file),
    'package/package.json',
  ]);
  const pkg = JSON.parse(stdout);
  if (pkg.version !== version || !pkg.name.startsWith('@jitterbox/repro-'))
    throw new Error('Release version/name mismatch');
  pending.set(pkg.name, {
    file,
    dependencies: Object.keys(pkg.dependencies ?? {}),
  });
}
while (pending.size) {
  const item = [...pending].find(([, pkg]) =>
    pkg.dependencies.every((name) => !pending.has(name)),
  );
  if (!item) throw new Error('Internal dependency cycle');
  const [name, pkg] = item;
  // Published versions are immutable. Resume a partial release only after explicit investigation.
  console.log(`Publishing ${name}@${version}`);
  const invocation = packageManagerInvocation('npm', [
    'publish',
    join(directory, pkg.file),
    '--access',
    'public',
    ...(local ? [] : ['--provenance']),
  ]);
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`npm publish failed: ${code ?? signal}`)),
    );
  });
  pending.delete(name);
}
