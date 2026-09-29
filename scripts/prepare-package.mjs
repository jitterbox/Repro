/** Build-time package assets. Run from the repository root, never during consumer install. */
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function preparePackages() {
  for (const directory of await readdir(join(root, 'packages'))) {
    const path = join(root, 'packages', directory);
    const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    if (pkg.private) continue;
    await cp(join(root, 'LICENSE'), join(path, 'LICENSE'));
    await writeFile(
      join(path, 'README.md'),
      `# ${pkg.name}\n\n${pkg.description}\n\nVersion ${pkg.version}. Node.js 22+. Windows x64 / Linux x64.\n\nSee the [Repro README](https://github.com/jitterbox/Repro#readme), [installation](https://github.com/jitterbox/Repro/blob/main/docs/installation.md), and [complete reference](https://github.com/jitterbox/Repro/blob/main/docs/README.md).\n\nRepro uses your existing AI harness; no AI API key is required to capture, render or replay committed scenarios.\n\nLicense: Apache-2.0. Third-party dependencies retain their own licenses.\n`,
    );
  }
  await cp(join(root, 'skills'), join(root, 'packages/cli/skills'), {
    recursive: true,
  });
  await cp(join(root, 'docs'), join(root, 'packages/cli/docs'), {
    recursive: true,
    filter: (source) =>
      !/[/\\](?:spike-artifacts|research|design-recs)(?:[/\\]|$)/.test(source),
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await preparePackages();
