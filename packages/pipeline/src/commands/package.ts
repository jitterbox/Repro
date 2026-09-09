import { shareReportSchema, type ShareReport } from '@repro/contracts';
import { createPresidioLikeRedactor } from '@repro/core/redactor';
import { createHash, randomUUID } from 'node:crypto';
import { enforceOcrAudit } from '@repro/render';
import {
  cp,
  mkdir,
  stat,
  readFile,
  rename,
  rm,
  open,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import { writeJson } from './io.js';

export type EvidenceAssetKind = 'chapters' | 'json' | 'mp4' | 'vtt' | 'png';

export interface EvidenceAssetInput {
  readonly kind: EvidenceAssetKind;
  readonly path: string;
  readonly role?: 'before' | 'after';
  readonly title?: string;
}

export interface EvidenceManifestAsset extends EvidenceAssetInput {
  readonly href: string;
  readonly sha256: string;
}

export interface EvidenceManifest {
  readonly assets: readonly EvidenceManifestAsset[];
  readonly generatedAtEpoch: number;
  readonly schemaVersion: 1;
  readonly compare?: {
    readonly syncMap: readonly (readonly [number, number, number, number])[];
  };
}

export interface PackageCommandOptions {
  readonly assets?: readonly EvidenceAssetInput[];
  readonly outDir: string;
  readonly viewerDir?: string;
  readonly privacyPatterns?: readonly string[];
  readonly report?: ShareReport;
  readonly compare?: EvidenceManifest['compare'];
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
  await assertDirectory(viewerDir);
  await mkdir(dirname(options.outDir), { recursive: true });
  const staging = `${options.outDir}.tmp-${randomUUID()}`;
  const backup = `${options.outDir}.previous-${randomUUID()}`;
  const lockPath = `${options.outDir}.lock`;
  const lock = await open(lockPath, 'wx');
  let previous = false;
  let published = false;
  try {
    const assets = [
      ...(await copyEvidenceAssets(
        staging,
        options.assets ?? [],
        options.privacyPatterns ?? [],
      )),
    ];
    if (options.report) {
      const report = shareReportSchema.parse(options.report);
      assertShareableReport(report, options.privacyPatterns ?? []);
      await writeJson(join(staging, 'report.json'), report);
      assets.push({
        kind: 'json',
        path: 'report.json',
        href: 'report.json',
        sha256: hashBytes(await readFile(join(staging, 'report.json'))),
      });
    }
    const manifest = {
      ...evidenceManifest(assets),
      ...(options.compare ? { compare: options.compare } : {}),
    };
    await cp(viewerDir, join(staging, 'viewer'), { recursive: true });
    await writeJson(join(staging, 'evidence-manifest.json'), manifest);
    try {
      await rename(options.outDir, backup);
      previous = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await rename(staging, options.outDir);
      published = true;
    } catch (error) {
      if (previous) await rename(backup, options.outDir);
      throw error;
    }
    return {
      manifest,
      manifestPath: join(options.outDir, 'evidence-manifest.json'),
      viewerPath: join(options.outDir, 'viewer'),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (published) await rm(backup, { recursive: true, force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
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
  patterns: readonly string[],
): Promise<readonly EvidenceManifestAsset[]> {
  const targetDir = join(outDir, 'assets');
  await mkdir(targetDir, { recursive: true });

  const copiedAssets: EvidenceManifestAsset[] = [];
  const verified = new Set<string>();
  for (const asset of assets) {
    if (asset.title) assertShareableText(asset.title, patterns);
    // Snapshot first: audits and publication operate on the same private copy.
    const bytes = await readFile(asset.path);
    const hash = hashBytes(bytes);
    const href = `assets/${hash.slice(0, 16)}-${asset.path.split('/').at(-1) ?? 'asset'}`;
    const destination = join(outDir, href);
    if (verified.has(`${asset.kind}:${href}`)) {
      copiedAssets.push({
        kind: asset.kind,
        path: href,
        href,
        sha256: hash,
        ...(asset.role ? { role: asset.role } : {}),
        ...(asset.title ? { title: asset.title } : {}),
      });
      continue;
    }
    await writeFile(destination, bytes, { flag: 'wx' });
    if (asset.kind === 'mp4' || asset.kind === 'png') {
      await enforceOcrAudit({
        path: destination,
        redaction: { masks: [], strict: true },
        requireAudit: true,
        patterns,
      });
      const receipt = JSON.parse(
        await readFile(`${destination}.audit.json`, 'utf8'),
      ) as { sha256?: string; passed?: boolean; source?: string };
      if (
        receipt.sha256 !== hash ||
        receipt.passed !== true ||
        receipt.source !== 'frame-ocr'
      )
        throw new Error('Audit receipt does not match packaged evidence');
    } else if (asset.kind === 'vtt' || asset.kind === 'chapters') {
      assertShareableText(bytes.toString('utf8'), patterns);
    } else {
      throw new Error(
        'Generic JSON/raw diagnostics cannot be exported without an explicit audited report contract',
      );
    }
    if (hashBytes(await readFile(destination)) !== hash)
      throw new Error('Artifact changed while packaging');
    verified.add(`${asset.kind}:${href}`);
    copiedAssets.push({
      kind: asset.kind,
      path: href,
      href,
      sha256: hash,
      ...(asset.role ? { role: asset.role } : {}),
      ...(asset.title ? { title: asset.title } : {}),
    });
  }
  return copiedAssets;
}

async function assertDirectory(path: string): Promise<void> {
  const info = await stat(path).catch(() => undefined);

  if (info?.isDirectory() !== true) {
    throw new Error(`Viewer bundle not found: ${path}`);
  }
}

function defaultViewerDir(): string {
  return dirname(createRequire(import.meta.url).resolve('@repro/viewer'));
}

function assertShareableText(text: string, patterns: readonly string[]): void {
  if (
    createPresidioLikeRedactor().redactText(text).hits.length ||
    patterns.some((pattern) => text.includes(pattern)) ||
    /repro-canary-secret-/i.test(text)
  )
    throw new Error('Sensitive text in exported report or captions');
}

function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Schema-validated timing numbers are measurements, not user-provided text.
function assertShareableReport(
  value: unknown,
  patterns: readonly string[],
): void {
  if (typeof value === 'string') assertShareableText(value, patterns);
  else if (Array.isArray(value))
    for (const item of value) assertShareableReport(item, patterns);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value))
      assertShareableReport(item, patterns);
}
