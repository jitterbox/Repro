import { preparePackages } from './prepare-package.mjs';
import { packageManagerInvocation } from './package-manager.mjs';
/** Portable local distribution; publishing to an external registry is a separate action. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const execute = promisify(execFile),
  repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function packRelease(destination) {
  await preparePackages();
  const output = resolve(destination);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const tarballs = join(output, 'tarballs');
  await mkdir(tarballs);
  const overrides = {},
    checksums = {};
  for (const directory of (
    await readdir(join(repository, 'packages'))
  ).sort()) {
    const cwd = join(repository, 'packages', directory),
      pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
    if (pkg.private) continue;
    console.log(`Packing ${pkg.name}`);
    const invocation = packageManagerInvocation('pnpm', [
      'pack',
      '--pack-destination',
      tarballs,
    ]);
    await execute(invocation.command, invocation.args, { cwd });
    const file =
      pkg.name.replace('@', '').replace('/', '-') + '-' + pkg.version + '.tgz';
    overrides[pkg.name] = `file:./tarballs/${file}`;
    checksums[`tarballs/${file}`] = createHash('sha256')
      .update(await readFile(join(tarballs, file)))
      .digest('hex');
  }
  const manifest = {
    name: 'repro-local-toolchain',
    private: true,
    type: 'module',
    packageManager: 'pnpm@9.15.0',
    engines: { node: '>=22' },
    dependencies: {
      '@jitterbox/repro-cli': overrides['@jitterbox/repro-cli'],
      '@jitterbox/repro-playwright': overrides['@jitterbox/repro-playwright'],
      '@jitterbox/repro-mcp': overrides['@jitterbox/repro-mcp'],
      '@playwright/test': '1.62.0',
    },
    pnpm: { overrides },
  };
  await writeFile(
    join(output, 'package.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await writeFile(
    join(output, 'checksums.json'),
    JSON.stringify(checksums, null, 2) + '\n',
  );
  await writeFile(
    join(output, 'README.md'),
    `# Repro local toolchain\n\nThis directory is relocatable. Package references are relative to it.\n\n1. Install Node 22+ and pnpm 9.15.0.\n2. Run \`pnpm install\` here. External dependencies require registry access or a populated pnpm cache.\n3. Run \`pnpm exec repro setup --system\` (Windows or Ubuntu/Debian; system installation may need elevation).\n4. Run \`pnpm exec repro doctor\`, then \`pnpm exec repro init\`.\n5. Discover evidence workflows with \`pnpm exec repro capabilities --json\`.\n\nThe tarball hashes are in checksums.json. No external registry publication is implied.\nTo use the packages in an existing project, copy tarballs/ and merge the dependencies\nand pnpm.overrides from package.json before installing.\n`,
  );
  return { output, manifest, checksums };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    JSON.stringify(
      await packRelease(process.argv[2] ?? '.repro/release'),
      null,
      2,
    ),
  );
