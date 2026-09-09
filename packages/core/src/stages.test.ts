import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  cacheKey,
  resumeFromLastVerified,
  writeStageAtomic,
} from './stages.js';
it('selects exact content-verified stages and rejects altered or deleted artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-stage-'));
  try {
    const artifact = join(root, 'frame');
    await writeFile(artifact, 'original pixels');
    const key = cacheKey({ inputs: 'scenario-a', config: {}, versions: {} });
    const manifest = {
      stage: 'capture' as const,
      cacheKey: key,
      artifacts: [artifact],
      inputs: 'scenario-a',
      config: {},
      versions: {},
      completedAtEpoch: 1,
    };
    await Promise.all([
      writeStageAtomic({ rootDir: root, manifest }),
      writeStageAtomic({ rootDir: root, manifest }),
    ]);
    const lookup = () =>
      resumeFromLastVerified({
        rootDir: root,
        stages: ['capture'],
        cacheKeys: { capture: key },
      });
    expect((await lookup()).stage).toBe('capture');
    expect(
      (await resumeFromLastVerified({ rootDir: root, stages: ['capture'] }))
        .stage,
    ).toBeNull();
    await writeFile(artifact, 'corrupt pixels');
    expect((await lookup()).stage).toBeNull();
    await writeFile(artifact, 'repaired pixels');
    await Promise.all([
      writeStageAtomic({ rootDir: root, manifest }),
      writeStageAtomic({ rootDir: root, manifest }),
    ]);
    expect((await lookup()).stage).toBe('capture');
    await rm(artifact);
    expect((await lookup()).stage).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
