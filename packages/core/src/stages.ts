import { withFileLock } from './lock.js';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { contentAddress } from './hash.js';
import { StageNameSchema } from './schema.js';

import type { HashInput, HashRecord } from './hash.js';
import type { StageName } from './schema.js';

const COMPLETE_MARKER = 'COMPLETED';
const MANIFEST_FILE = 'manifest.json';

export interface CacheKeyInput {
  readonly inputs: HashInput;
  readonly config: HashInput;
  readonly versions: Record<string, string>;
}

export interface StageManifest extends HashRecord {
  readonly stage: StageName;
  readonly cacheKey: string;
  readonly inputs: HashInput;
  readonly config: HashInput;
  readonly versions: Record<string, string>;
  readonly artifacts: readonly string[];
  readonly artifactHashes?: Record<string, string>;
  readonly completedAtEpoch: number;
}

export interface WriteStageAtomicInput {
  readonly rootDir: string;
  readonly manifest: StageManifest;
}

export interface ResumeInput {
  readonly rootDir: string;
  readonly stages: readonly StageName[];
  readonly cacheKeys?: Partial<Record<StageName, string>>;
}

export interface ResumeResult {
  readonly stage: StageName | null;
  readonly manifest: StageManifest | null;
  readonly path: string | null;
}

export interface InvalidateInput extends ResumeInput {
  readonly fromStage: StageName;
}

export function cacheKey(input: CacheKeyInput): string {
  return contentAddress({
    config: input.config,
    inputs: input.inputs,
    versions: input.versions,
  });
}

export async function writeStageAtomic(
  input: WriteStageAtomicInput,
): Promise<string> {
  StageNameSchema.parse(input.manifest.stage);
  const stagePath = stageDir(input.rootDir, input.manifest);

  await mkdir(dirname(stagePath), { recursive: true });
  return withFileLock(`${stagePath}.lock`, async () => {
    const tmpPath = `${stagePath}.tmp-${randomUUID()}`;
    try {
      if (await readVerifiedManifest(stagePath)) return stagePath;
      const artifactHashes: Record<string, string> = {};
      for (const artifact of input.manifest.artifacts)
        artifactHashes[resolve(artifact)] = contentAddress(
          await readFile(artifact),
        );
      const manifest = {
        ...input.manifest,
        artifacts: input.manifest.artifacts.map((a) => resolve(a)),
        artifactHashes,
      };
      await mkdir(tmpPath, { recursive: true });
      await writeManifest(tmpPath, manifest);
      // Only an invalid generation is removed, while holding the publication lock.
      await rm(stagePath, { recursive: true, force: true });
      await rename(tmpPath, stagePath);
      if (!(await readVerifiedManifest(stagePath)))
        throw new Error('Stage artifacts changed during publication');
      return stagePath;
    } finally {
      await rm(tmpPath, { recursive: true, force: true });
    }
  });
}

export async function resumeFromLastVerified(
  input: ResumeInput,
): Promise<ResumeResult> {
  let last: ResumeResult = { manifest: null, path: null, stage: null };

  for (const stage of input.stages) {
    const key = input.cacheKeys?.[stage];
    const verified =
      key === undefined
        ? null
        : await exactVerifiedStage(input.rootDir, stage, key);
    if (verified === null) {
      return last;
    }

    last = verified;
  }

  return last;
}

export async function invalidateDownstream(
  input: InvalidateInput,
): Promise<string[]> {
  const start = input.stages.indexOf(input.fromStage);
  if (start < 0) {
    throw new Error(`Unknown stage: ${input.fromStage}`);
  }

  const removed = input.stages.slice(start + 1).map((stage) => {
    return join(input.rootDir, stage);
  });
  await Promise.all(
    removed.map((path) => rm(path, { force: true, recursive: true })),
  );
  return removed;
}

function stageDir(rootDir: string, manifest: StageManifest): string {
  return join(rootDir, manifest.stage, manifest.cacheKey);
}

async function writeManifest(
  directory: string,
  manifest: StageManifest,
): Promise<void> {
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const marker = contentAddress(manifest);

  await writeFile(join(directory, MANIFEST_FILE), text);
  await writeFile(join(directory, COMPLETE_MARKER), `${marker}\n`);
}

async function exactVerifiedStage(
  rootDir: string,
  stage: StageName,
  key: string,
): Promise<ResumeResult | null> {
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const path = join(rootDir, stage, key);
  const manifest = await readVerifiedManifest(path);
  return manifest?.stage === stage && manifest.cacheKey === key
    ? { manifest, path, stage }
    : null;
}

export async function readVerifiedManifest(
  path: string,
): Promise<StageManifest | null> {
  try {
    const text = await readFile(join(path, MANIFEST_FILE), 'utf8');
    const manifest = JSON.parse(text) as StageManifest;
    const marker = (await readFile(join(path, COMPLETE_MARKER), 'utf8')).trim();
    if (contentAddress(manifest) !== marker || !manifest.artifactHashes)
      return null;
    for (const artifact of manifest.artifacts) {
      if (
        contentAddress(await readFile(artifact)) !==
        manifest.artifactHashes[artifact]
      )
        return null;
    }
    return manifest;
  } catch {
    return null;
  }
}
