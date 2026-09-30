/** Synthetic identity metadata controls over an actual captured before/after pair. */
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
const execute = promisify(execFile);
export async function verifyIdentityProof(before, after, output) {
  await mkdir(output, { recursive: true });
  output = await mkdtemp(join(output, 'controls-'));
  const controls = [];
  for (const kind of [
    'changed-source',
    'changed-test',
    'changed-claim',
    'unknown-source',
  ]) {
    const folder = join(output, kind);
    await cp(after, folder, { recursive: true });
    const run = JSON.parse(await readFile(join(folder, 'run.json'), 'utf8'));
    if (kind === 'changed-source') run.scenario.executableHash = 'f'.repeat(64);
    if (kind === 'changed-test') run.scenario.testCase += ' different test';
    if (kind === 'unknown-source') run.scenario.executableHash = null;
    if (kind === 'changed-claim') {
      const artifact = run.artifacts.find((a) => a.kind === 'evidence');
      const spec = JSON.parse(
        await readFile(join(folder, artifact.path), 'utf8'),
      );
      spec.claim = 'A different proof requirement';
      const bytes = Buffer.from(JSON.stringify(spec));
      await writeFile(join(folder, artifact.path), bytes);
      artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
      artifact.bytes = bytes.length;
    }
    await writeFile(join(folder, 'run.json'), JSON.stringify(run));
    let result;
    try {
      await execute(process.execPath, [
        resolve('packages/cli/dist/bin.js'),
        'compare',
        before,
        folder,
      ]);
      assert.fail(`Accepted ${kind}`);
    } catch (error) {
      assert.notEqual(error.code, 0);
      result = JSON.parse(error.stdout || error.stderr);
    }
    const serialized = JSON.stringify(result);
    if (kind === 'unknown-source')
      assert.ok(
        result.ok === false && result.scenarioSource === 'unknown',
        serialized,
      );
    if (kind === 'changed-source')
      assert.ok(serialized.includes('Committed scenario'), serialized);
    if (kind === 'changed-test')
      assert.ok(serialized.includes('Different Playwright test'), serialized);
    if (kind === 'changed-claim')
      assert.ok(serialized.includes('proof requirements differ'), serialized);
    controls.push({ kind, rejected: true });
  }
  const migrated = JSON.parse(
    (
      await execute(process.execPath, [
        resolve('packages/cli/dist/bin.js'),
        'migrate-run',
        join(output, 'unknown-source'),
        '--out-dir',
        join(output, 'migrated'),
      ])
    ).stdout,
  );
  assert.equal(migrated.scenarioSource, 'unknown');
  const migratedRun = JSON.parse(
    await readFile(join(migrated.directory, 'run.json'), 'utf8'),
  );
  assert.equal(migratedRun.scenario.executableHash, null);
  assert.ok(migratedRun.artifacts.some((a) => a.kind === 'migration-source'));
  controls.push({
    kind: 'explicit-migration-preserves-unknown',
    rejected: false,
  });
  const result = { passed: true, controls };
  await writeFile(
    join(output, 'acceptance.json'),
    JSON.stringify(result, null, 2),
  );
  return result;
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  console.log(
    JSON.stringify(
      await verifyIdentityProof(
        resolve(process.argv[2]),
        resolve(process.argv[3]),
        resolve(process.argv[4]),
      ),
    ),
  );
