import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJson } from './io.js';

export type EvidenceAssetKind = 'chapters' | 'json' | 'mp4' | 'vtt';

export interface EvidenceAssetInput {
  readonly kind: EvidenceAssetKind;
  readonly path: string;
}

export interface EvidenceManifestAsset extends EvidenceAssetInput {
  readonly href: string;
}

export interface EvidenceManifest {
  readonly assets: readonly EvidenceManifestAsset[];
  readonly generatedAtEpoch: number;
  readonly schemaVersion: 1;
}

export interface PackageCommandOptions {
  readonly assets?: readonly EvidenceAssetInput[];
  readonly outDir: string;
  readonly viewerDir?: string;
}

export interface PackageCommandResult {
  readonly manifest: EvidenceManifest;
  readonly manifestPath: string;
  readonly viewerPath: string;
}

export async function packageCommand(
  options: PackageCommandOptions,
): Promise<PackageCommandResult> {
  const viewerDir = options.viewerDir ?? defaultViewerDir();
  const viewerPath = join(options.outDir, 'viewer');
  const manifestPath = join(options.outDir, 'evidence-manifest.json');
  const assets = await copyEvidenceAssets(options.outDir, options.assets ?? []);
  const manifest = evidenceManifest(assets);

  await assertDirectory(viewerDir);
  await mkdir(options.outDir, { recursive: true });
  await cp(viewerDir, viewerPath, { recursive: true });
  await writeJson(manifestPath, manifest);

  return { manifest, manifestPath, viewerPath };
}

function evidenceManifest(
  assets: readonly EvidenceManifestAsset[],
): EvidenceManifest {
  return {
    assets,
    generatedAtEpoch: Date.now(),
    schemaVersion: 1,
  };
}

async function copyEvidenceAssets(
  outDir: string,
  assets: readonly EvidenceAssetInput[],
): Promise<readonly EvidenceManifestAsset[]> {
  const targetDir = join(outDir, 'assets');
  await mkdir(targetDir, { recursive: true });

  return Promise.all(
    assets.map(async (asset) => {
      const href = `assets/${asset.path.split('/').at(-1) ?? 'asset'}`;
      await cp(asset.path, join(outDir, href));
      return { ...asset, href };
    }),
  );
}

async function assertDirectory(path: string): Promise<void> {
  const info = await stat(path).catch(() => undefined);

  if (info?.isDirectory() !== true) {
    throw new Error(`Viewer bundle not found: ${path}`);
  }
}

function defaultViewerDir(): string {
  const current = fileURLToPath(import.meta.url);
  const packageRoot = dirname(dirname(dirname(current)));
  return resolve(packageRoot, '../viewer/dist');
}
