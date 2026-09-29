import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('.repro/bug-corpus'),
  exec = promisify(execFile);
const results = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
const previous = [
  ...JSON.parse(
    await readFile(join(root, 'polish-export-progress.json'), 'utf8').catch(
      () => '[]',
    ),
  ),
  ...JSON.parse(
    await readFile(join(root, 'final-acceptance.json'), 'utf8').catch(
      () => '[]',
    ),
  ),
  ...JSON.parse(
    await readFile(join(root, 'acceptance.json'), 'utf8').catch(() => '[]'),
  ),
];
const receipts = [];
async function audit(r) {
  const name = `${r.kind}-${r.role}`,
    run = JSON.parse(await readFile(join(r.run, 'run.json'), 'utf8'));
  assert.equal(
    run.scenarioOutcome,
    r.role === 'before' ? 'bug-reproduced' : 'fix-verified',
  );
  const video = run.artifacts.find((a) => a.kind === 'presentation-video');
  assert.ok(video);
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(r.run, video.path)))
      .digest('hex'),
    video.sha256,
  );
  const completed = JSON.parse(
    await readFile(join(root, 'polish-export-progress.json'), 'utf8').catch(
      () => '[]',
    ),
  );
  const prior = [...completed, ...previous].find(
    (p) => p.name === name && p.run === r.run,
  );
  let bundle = prior?.strictExport ?? join(root, 'bundles', name),
    reuse = false;
  if (prior) {
    const manifest = JSON.parse(
      await readFile(join(bundle, 'evidence-manifest.json'), 'utf8').catch(
        () => '{}',
      ),
    );
    const asset = manifest.assets?.find(
      (a) => a.kind === 'mp4' && a.sha256 === video.sha256,
    );
    if (asset)
      reuse =
        createHash('sha256')
          .update(await readFile(join(bundle, asset.path)))
          .digest('hex') === video.sha256;
  }
  if (!reuse) {
    bundle = join(root, 'current-bundles', name);
    const result = await exec(
      process.execPath,
      [
        resolve('packages/cli/dist/bin.js'),
        'export',
        r.run,
        '--draft',
        '--out-dir',
        bundle,
      ],
      {
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      },
    );
    assert.ok(JSON.parse(result.stdout).manifest.assets.length);
  }
  await copyFile(join(r.run, video.path), join(root, `${name}.mp4`));
  await copyFile(
    join(r.rendered.directory, 'result.png'),
    join(root, `${name}.png`),
  );
  const receipt = JSON.parse(
    await readFile(join(r.rendered.directory, 'render-receipt.json'), 'utf8'),
  );
  assert.equal(receipt.randomSeekPassed, true);
  assert.equal(receipt.layoutFramesChecked, receipt.frameCount);
  receipts.push({
    name,
    run: r.run,
    videoSha256: video.sha256,
    strictExport: bundle,
    frameCount: receipt.frameCount,
    randomSeekPassed: true,
  });
  await writeFile(
    join(root, 'final-acceptance.json'),
    JSON.stringify(receipts, null, 2),
  );
  console.log(
    `${reuse ? 'reused content-bound audit' : 'audited current'} ${name}`,
  );
}
let next = 0;
await Promise.all(
  [0, 1].map(async () => {
    while (next < results.length) {
      const r = results[next++];
      if (r) await audit(r);
    }
  }),
);
await writeFile(
  join(root, 'final-acceptance.json'),
  JSON.stringify(receipts, null, 2),
);
console.log(`Verified ${receipts.length} current standalone recordings.`);
