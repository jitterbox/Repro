import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { implementationDigest, runProcess } from '@repro/core';
import { createRequire } from 'node:module';
import type {
  PackageCommandOptions,
  EvidenceManifest,
  EvidenceManifestAsset,
} from './package.js';

const receiptName = '.repro-export-cache.json';
const digest = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

/** Hash every file and reject symlinks, including extra files in relocated bundles. */
export async function packageTree(
  root: string,
  omitReceipt = false,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(directory: string, prefix: string) {
    for (const entry of (await readdir(directory)).sort()) {
      if (omitReceipt && prefix === '' && entry === receiptName) continue;
      const name = prefix + entry;
      const path = join(directory, entry);
      const info = await lstat(path);
      if (info.isSymbolicLink())
        throw new Error('Export cache cannot include symbolic links');
      if (info.isDirectory()) await visit(path, `${name}/`);
      else if (info.isFile()) files[name] = digest(await readFile(path));
      else throw new Error('Export cache contains a non-file artifact');
    }
  }
  await visit(root, '');
  return files;
}

/** Missing OCR or an arbitrary supplemental OCR command disables reuse. */
export async function packageCacheKey(
  options: PackageCommandOptions,
  viewerDir: string,
): Promise<string | undefined> {
  if (process.env.REPRO_OCR_COMMAND) return undefined;
  try {
    const require = createRequire(import.meta.url);
    const tools = await Promise.all([
      runProcess('tesseract', ['--version']),
      runProcess('tesseract', ['--list-langs']),
      runProcess('ffmpeg', ['-version']),
    ]);
    const modelDirectory = /List of available languages in "([^"]+)"/.exec(
      tools[1],
    )?.[1];
    if (!modelDirectory) return undefined;
    const models = await packageTree(modelDirectory);
    return digest(
      JSON.stringify({
        version: 1,
        implementation: [
          implementationDigest(new URL('../index.js', import.meta.url).href),
          implementationDigest(require.resolve('@repro/render')),
          implementationDigest(require.resolve('@repro/core')),
          implementationDigest(require.resolve('@repro/contracts')),
        ],
        tools,
        models,
        tessdata: process.env.TESSDATA_PREFIX ?? null,
        viewer: await packageTree(viewerDir),
        assets: await Promise.all(
          (options.assets ?? []).map(async (asset) => ({
            ...asset,
            path: basename(asset.path),
            sha256: digest(await readFile(asset.path)),
          })),
        ),
        report: options.report ?? null,
        workItem: options.workItem ?? null,
        devtools: options.devtools ?? [],
        compare: options.compare ?? null,
        patterns: options.privacyPatterns ?? [],
      }),
    );
  } catch {
    return undefined;
  }
}

export async function reusablePackage(
  outDir: string,
  key: string | undefined,
): Promise<EvidenceManifest | undefined> {
  if (!key) return undefined;
  try {
    const record = JSON.parse(
      await readFile(join(outDir, receiptName), 'utf8'),
    ) as {
      key: string;
      files: Record<string, string>;
    };
    if (record.key !== key) return undefined;
    const files = await packageTree(outDir, true);
    if (JSON.stringify(files) !== JSON.stringify(record.files))
      return undefined;
    const manifest = JSON.parse(
      await readFile(join(outDir, 'evidence-manifest.json'), 'utf8'),
    ) as Omit<EvidenceManifest, 'schemaVersion'> & { schemaVersion: number };
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets))
      return undefined;
    for (const asset of manifest.assets as readonly EvidenceManifestAsset[]) {
      if (files[asset.href] !== asset.sha256 || asset.path !== asset.href)
        return undefined;
      if (asset.kind === 'png' || asset.kind === 'mp4') {
        const receipt = JSON.parse(
          await readFile(join(outDir, `${asset.href}.audit.json`), 'utf8'),
        ) as { sha256?: string; passed?: boolean; source?: string };
        if (
          receipt.sha256 !== asset.sha256 ||
          receipt.passed !== true ||
          receipt.source !== 'frame-ocr'
        )
          return undefined;
      }
    }
    return { ...manifest, schemaVersion: 1 };
  } catch {
    return undefined;
  }
}

export async function recordPackageCache(
  outDir: string,
  key: string | undefined,
): Promise<void> {
  if (key)
    await writeFile(
      join(outDir, receiptName),
      JSON.stringify({ key, files: await packageTree(outDir, true) }),
    );
}
