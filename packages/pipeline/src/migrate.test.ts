import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { migrateRun } from './migrate.js';
import { artifactRef, verifyRun } from './evidence-run.js';
it('migrates defaults explicitly while preserving unknown proof, original manifest and artifact bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-migration-'));
  try {
    const source = join(root, 'old');
    await mkdir(source);
    await writeFile(join(source, 'events.jsonl'), 'synthetic event control');
    const artifact = await artifactRef(
      source,
      join(source, 'events.jsonl'),
      'events',
    );
    const legacy = {
      schemaVersion: '1.0.0',
      id: 'old',
      scenario: { id: 'case', title: 'Legacy case', specHash: 'old' },
      variant: { id: 'before', role: 'before', label: 'Before' },
      build: { id: null, url: null },
      environment: {},
      tools: {},
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:00:01Z',
      durationMs: 1000,
      scenarioOutcome: 'inconclusive',
      pipelineOutcome: 'inconclusive',
      steps: [],
      observations: [],
      artifacts: [artifact, artifact],
      stages: {},
      errors: [],
    };
    const original = JSON.stringify(legacy);
    await writeFile(join(source, 'run.json'), original);
    const destination = join(root, 'new');
    expect((await migrateRun(source, destination)).scenarioSource).toBe(
      'unknown',
    );
    const migrated = await verifyRun(destination);
    expect(migrated.scenario.executableHash).toBeNull();
    expect(migrated.scenario.testCase).toBeNull();
    expect(migrated.scenarioOutcome).toBe('inconclusive');
    expect(migrated.observations).toEqual([]);
    expect(migrated.segments).toEqual([]);
    expect(migrated.diagnostics).toEqual([]);
    const archive = migrated.artifacts.find(
      (a) => a.kind === 'migration-source',
    );
    if (!archive) throw new Error('Original manifest missing');
    expect(await readFile(join(destination, archive.path), 'utf8')).toBe(
      original,
    );
    expect(await readFile(join(source, 'run.json'), 'utf8')).toBe(original);
    await expect(migrateRun(source, destination)).rejects.toThrow();
    await writeFile(join(source, 'events.jsonl'), 'corrupt');
    await expect(migrateRun(source, join(root, 'corrupt'))).rejects.toThrow(
      'Corrupt artifact',
    );
    await expect(access(join(root, 'corrupt'))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
