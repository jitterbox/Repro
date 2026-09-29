import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  lstat,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stageCiArtifacts } from './stage-ci-artifacts.mjs';

test(
  'stages evidence while excluding dependency trees, outside links and cycles',
  { timeout: 5000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'repro-ci-artifacts-'));
    try {
      const fixture = join(root, '.repro', 'fresh-agent-replay', 'attempt');
      await mkdir(join(fixture, 'node_modules', 'nested'), { recursive: true });
      await mkdir(join(root, 'packages', 'fixture', 'test-results'), {
        recursive: true,
      });
      await writeFile(join(fixture, 'run.json'), '{"passed":true}');
      await writeFile(
        join(fixture, 'node_modules', 'nested', 'private.txt'),
        'DO_NOT_UPLOAD',
      );
      await writeFile(
        join(root, 'packages', 'fixture', 'test-results', 'proof.mp4'),
        'video-bytes',
      );
      await symlink(root, join(fixture, 'cycle'), 'junction');
      await symlink(
        join(root, 'packages'),
        join(fixture, 'outside'),
        'junction',
      );
      const result = await stageCiArtifacts(root);
      assert.equal(result.files, 2);
      assert.equal(
        await readFile(
          join(
            result.output,
            '.repro',
            'fresh-agent-replay',
            'attempt',
            'run.json',
          ),
          'utf8',
        ),
        '{"passed":true}',
      );
      assert.equal(
        await readFile(
          join(
            result.output,
            'packages',
            'fixture',
            'test-results',
            'proof.mp4',
          ),
          'utf8',
        ),
        'video-bytes',
      );
      for (const name of ['node_modules', 'cycle', 'outside'])
        await assert.rejects(
          lstat(
            join(
              result.output,
              '.repro',
              'fresh-agent-replay',
              'attempt',
              name,
            ),
          ),
          { code: 'ENOENT' },
        );
      await writeFile(join(result.output, 'stale.txt'), 'previous run');
      await stageCiArtifacts(root);
      await assert.rejects(lstat(join(result.output, 'stale.txt')), {
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
