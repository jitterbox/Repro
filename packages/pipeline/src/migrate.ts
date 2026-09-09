import { runManifestSchema } from '@repro/contracts';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  artifactRef,
  containedArtifact,
  verifyRun,
  writeJson,
} from './evidence-run.js';

/** Explicitly materialize current defaults without upgrading unknown provenance into proof. */
export async function migrateRun(source: string, destination: string) {
  source = resolve(source);
  destination = resolve(destination);
  if (source === destination)
    throw new Error('Migration requires a new output directory');
  const original = await readFile(join(source, 'run.json'));
  const run = runManifestSchema.parse(JSON.parse(original.toString('utf8')));
  await mkdir(dirname(destination), { recursive: true });
  // Reserve a new directory exclusively; run.json is the final publication marker.
  await mkdir(destination);
  try {
    const copiedPaths = new Set<string>();
    for (const artifact of run.artifacts) {
      if (copiedPaths.has(artifact.path)) continue;
      const bytes = await readFile(
        await containedArtifact(source, artifact.path),
      );
      const output = join(destination, artifact.path);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes, { flag: 'wx' });
      copiedPaths.add(artifact.path);
      const copied = await artifactRef(destination, output, artifact.kind);
      if (copied.sha256 !== artifact.sha256 || copied.bytes !== artifact.bytes)
        throw new Error(`Corrupt artifact during migration: ${artifact.path}`);
    }
    const archived = join(
      destination,
      `.migration/source-${randomUUID()}.json`,
    );
    await mkdir(dirname(archived), { recursive: true });
    await writeFile(archived, original, { flag: 'wx' });
    const preserved = await artifactRef(
      destination,
      archived,
      'migration-source',
    );
    await writeJson(join(destination, 'run.json'), {
      ...run,
      environment: {
        ...run.environment,
        migration: {
          sourceSchemaVersion: run.schemaVersion,
          importedAt: new Date().toISOString(),
          proofInferred: false,
        },
      },
      artifacts: [...run.artifacts, preserved],
    });
    await verifyRun(destination);
    return {
      ok: true,
      directory: destination,
      manifest: join(destination, 'run.json'),
      scenarioOutcome: run.scenarioOutcome,
      scenarioSource: run.scenario.executableHash ? 'preserved' : 'unknown',
      notes: [
        'Original manifest and verified artifact bytes preserved.',
        'Unknown identity, missing observations and existing outcomes are not inferred or repaired.',
        'Recapture older evidence to establish missing before/after proof.',
      ],
    };
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
