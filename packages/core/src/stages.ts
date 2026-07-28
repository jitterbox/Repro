import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  readonly completedAtEpoch: number;
}

export interface WriteStageAtomicInput {
  readonly rootDir: string;
  readonly manifest: StageManifest;
}

export interface ResumeInput {
  readonly rootDir: string;
  readonly stages: readonly StageName[];
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

  if (await isComplete(stagePath)) {
    return stagePath;
  }

  const tmpPath = `${stagePath}.tmp-${String(process.pid)}-` +
    String(Date.now());
  await rm(tmpPath, { force: true, recursive: true });
  await mkdir(tmpPath, { recursive: true });
  await writeManifest(tmpPath, input.manifest);
  await rm(stagePath, { force: true, recursive: true });
  await rename(tmpPath, stagePath);
  return stagePath;
}

export async function resumeFromLastVerified(
  input: ResumeInput,
): Promise<ResumeResult> {
  let last: ResumeResult = { manifest: null, path: null, stage: null };

  for (const stage of input.stages) {
    const verified = await firstVerifiedStage(input.rootDir, stage);
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

async function firstVerifiedStage(
  rootDir: string,
  stage: StageName,
): Promise<ResumeResult | null> {
  const stageRoot = join(rootDir, stage);
  const entries = await readDirSafe(stageRoot);

  for (const entry of entries) {
    const path = join(stageRoot, entry);
    const manifest = await readVerifiedManifest(path);
    if (manifest !== null) {
      return { manifest, path, stage };
    }
  }

  return null;
}

async function readVerifiedManifest(path: string): Promise<StageManifest | null> {
  if (!(await isComplete(path))) {
    return null;
  }

  const text = await readFile(join(path, MANIFEST_FILE), 'utf8');
  return JSON.parse(text) as StageManifest;
}

async function isComplete(path: string): Promise<boolean> {
  try {
    await readFile(join(path, COMPLETE_MARKER), 'utf8');
    await readFile(join(path, MANIFEST_FILE), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function readDirSafe(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}
