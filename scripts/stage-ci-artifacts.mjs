/** Preserve evidence without following fixture dependency links into the workspace. */
import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDirectories = [
  'ci',
  'annotation-benchmark',
  'fresh-agent-replay',
  'review-matrix',
  'discovery',
  'delivery',
  'export-cache',
  'observations',
  'watch-acceptance',
  'public-acceptance',
  'timing-acceptance',
  'timing-trace-acceptance',
  'hidpi-acceptance',
  'hidpi-private',
  'interaction-diagnostics',
  'moving-privacy',
  'checkpoint-checks',
  'synchronization',
  'browser-diagnostics',
  'transient',
  'recipes',
  'har-privacy',
  'review-acceptance',
  'fixture-videos',
];

export async function stageCiArtifacts(root = process.cwd()) {
  root = resolve(root);
  const output = join(root, '.repro', 'ci-artifacts');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const sources = evidenceDirectories.map((name) => join('.repro', name));
  for (const entry of await readdir(join(root, 'packages'), {
    withFileTypes: true,
  })) {
    if (entry.isDirectory())
      sources.push(join('packages', entry.name, 'test-results'));
  }
  sources.push(join('packages', 'e2e-fixture', 'artifacts'));
  let files = 0;
  let bytes = 0;
  for (const source of sources) {
    const input = join(root, source);
    try {
      await lstat(input);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    await mkdir(dirname(join(output, source)), { recursive: true });
    await cp(input, join(output, source), {
      recursive: true,
      filter: async (path) => {
        if (
          relative(root, path)
            .split(sep)
            .some((part) => ['node_modules', '.git'].includes(part))
        )
          return false;
        const entry = await lstat(path);
        // Never dereference links, traverse cycles, or read sockets/FIFOs.
        if (entry.isDirectory()) return true;
        if (!entry.isFile()) return false;
        files++;
        bytes += entry.size;
        return true;
      },
    });
  }
  return { output, files, bytes };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(await stageCiArtifacts(), null, 2));
