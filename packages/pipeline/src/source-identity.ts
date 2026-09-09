import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { build, version } from 'esbuild';

/** Match the pinned Playwright CLI's file/directory resolution without importing private APIs. */
export async function scenarioConfigFile(
  config?: string,
  cwd = process.cwd(),
): Promise<string | undefined> {
  const location = resolve(cwd, config ?? '.');
  if (!(await stat(location)).isDirectory()) return location;
  for (const extension of ['ts', 'js', 'mts', 'mjs', 'cts', 'cjs']) {
    const candidate = join(location, `playwright.config.${extension}`);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

/** Resolve imported local TS/JS/JSON without executing the scenario or writing a bundle. */
export async function scenarioSourceIdentity(
  entries: readonly string[],
  documents: readonly string[] = [],
): Promise<string> {
  if (!entries.length) throw new Error('Scenario source entry is required');
  const entryPoints = [...new Set(entries.map((path) => resolve(path)))];
  const first = entryPoints[0];
  if (!first) throw new Error('Scenario source entry is required');
  const working = dirname(first);
  const result = await build({
    entryPoints,
    absWorkingDir: working,
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outdir: join(working, '.repro-source-analysis'),
    logLevel: 'silent',
  });
  const inputs = [
    ...new Set([
      ...Object.keys(result.metafile.inputs).map((path) =>
        resolve(working, path),
      ),
      ...documents.map((path) => resolve(path)),
    ]),
  ].sort();
  const hash = createHash('sha256').update(`esbuild:${version}\0`);
  for (const path of inputs) {
    const bytes = await readFile(path);
    hash
      .update(JSON.stringify([relative(working, path), bytes.byteLength]))
      .update(bytes);
  }
  return hash.digest('hex');
}
