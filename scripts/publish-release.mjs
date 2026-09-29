/** Called only by an explicitly requested release, never by build or installation. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (process.env.GITHUB_REF !== `refs/tags/v${version}`)
  throw new Error(
    `Dispatch from tag v${version}; never publish an untagged checkout.`,
  );
if (process.argv.includes('--check-tag')) process.exit(0);
const directory = process.argv[2];
if (!directory) throw new Error('Provide a checked release directory');
const checksums = JSON.parse(
  await readFile(join(directory, 'checksums.json'), 'utf8'),
);
// Verify every archive before the first external write.
for (const [file, expected] of Object.entries(checksums)) {
  if (!/^tarballs\/repro-[a-z-]+-[\d.]+\.tgz$/.test(file))
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
  if (pkg.version !== version || !pkg.name.startsWith('@repro/'))
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
  await exec(
    'npm',
    [
      'publish',
      join(directory, pkg.file),
      '--access',
      'public',
      '--provenance',
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  pending.delete(name);
}
