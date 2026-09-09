import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { containedArtifact } from './evidence-run.js';

it('rejects an artifact symlink escaping a run even when the external bytes match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-artifact-path-'));
  try {
    const run = join(root, 'run');
    await mkdir(run);
    await writeFile(join(root, 'external.png'), 'matching bytes');
    await writeFile(join(run, 'context.png'), 'matching bytes');
    await symlink(join(root, 'external.png'), join(run, 'escaped.png'));
    expect(await containedArtifact(run, 'context.png')).toBe(
      join(run, 'context.png'),
    );
    await expect(containedArtifact(run, 'escaped.png')).rejects.toThrow(
      'outside',
    );
    await expect(containedArtifact(run, '../external.png')).rejects.toThrow(
      'Unsafe',
    );
    await expect(
      containedArtifact(run, join(root, 'external.png')),
    ).rejects.toThrow('Unsafe');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
