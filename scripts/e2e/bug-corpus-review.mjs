import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile),
  root = resolve('.repro/bug-corpus');
const results = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
async function cli(...args) {
  try {
    return JSON.parse(
      (
        await exec(
          process.execPath,
          [resolve('packages/cli/dist/bin.js'), ...args],
          { maxBuffer: 32 * 1024 * 1024 },
        )
      ).stdout,
    );
  } catch (e) {
    throw new Error(`${args.join(' ')}\n${e.stdout}\n${e.stderr}`);
  }
}
const receipts = process.env.REPRO_REVIEW_KIND
  ? JSON.parse(
      await readFile(join(root, 'acceptance.json'), 'utf8').catch(() => '[]'),
    )
  : [];
for (const r of process.env.REPRO_COMPARE_ONLY === '1' ? [] : results) {
  if (process.env.REPRO_REVIEW_KIND && r.kind !== process.env.REPRO_REVIEW_KIND)
    continue;
  const name = `${r.kind}-${r.role}`;
  // Presentation-only repair exercises reuse of committed captures.
  if (
    ['chrome', 'scroll'].includes(r.kind) ||
    process.env.REPRO_RERENDER_ALL === '1'
  ) {
    r.rendered = await cli(
      'render',
      r.run,
      '--renderer',
      'hyperframes',
      '--treatment',
      join(root, `${name}.treatment.json`),
    );
    await copyFile(r.rendered.outputPath, join(root, `${name}.mp4`));
    await writeFile(
      join(root, 'results.json'),
      JSON.stringify(results, null, 2),
    );
  }
  const manifest = JSON.parse(await readFile(join(r.run, 'run.json'), 'utf8'));
  assert.equal(
    manifest.scenarioOutcome,
    r.role === 'before' ? 'bug-reproduced' : 'fix-verified',
    name,
  );
  const receipt = JSON.parse(
    await readFile(join(r.rendered.directory, 'render-receipt.json'), 'utf8'),
  );
  assert.equal(receipt.randomSeekPassed, true);
  assert.equal(receipt.layoutFramesChecked, receipt.frameCount);
  const bundle = await cli(
    'export',
    r.run,
    '--draft',
    '--out-dir',
    join(root, 'bundles', name),
  );
  assert.ok(bundle.manifest.assets.length);
  await cli('frame', r.run, '--checkpoint', 'result');
  await copyFile(
    join(r.rendered.directory, 'result.png'),
    join(root, `${name}.png`),
  );
  const scene = JSON.parse(
    await readFile(join(r.rendered.directory, 'scene.json'), 'utf8'),
  );
  const hold = scene.segments.find((s) => s.kind === 'hold');
  await mkdir(join(root, 'transitions'), { recursive: true });
  for (const [label, time] of [
    ['entry', hold.outStartMs + 67],
    ['hold', hold.outStartMs + 500],
    ['exit', hold.outStartMs + hold.outDurationMs - 67],
  ]) {
    const index = Math.round((time * 30) / 1000);
    await copyFile(
      join(
        r.rendered.directory,
        'frames',
        `frame_${String(index).padStart(6, '0')}.png`,
      ),
      join(root, 'transitions', `${name}-${label}.png`),
    );
  }
  const previous = receipts.findIndex((item) => item.name === name);
  if (previous >= 0) receipts.splice(previous, 1);
  receipts.push({
    name,
    run: r.run,
    frameCount: receipt.frameCount,
    randomSeekPassed: true,
    strictExport: bundle.directory ?? join(root, 'bundles', name),
  });
  await writeFile(
    join(root, 'acceptance.json'),
    JSON.stringify(receipts, null, 2),
  );
  console.log(`audited ${name}`);
}
if (!process.env.REPRO_REVIEW_KIND) {
  const comparisons = [];
  for (const kind of ['alignment', 'dark']) {
    const before = results.find((r) => r.kind === kind && r.role === 'before'),
      after = results.find((r) => r.kind === kind && r.role === 'after');
    assert.ok(before && after);
    const compared = await cli(
      'render',
      after.run,
      '--renderer',
      'hyperframes',
      '--baseline',
      before.run,
    );
    const name = `${kind}-comparison.mp4`;
    await copyFile(compared.outputPath, join(root, name));
    comparisons.push({ kind, ...compared });
    console.log(`comparison ${kind}`);
  }
  await writeFile(
    join(root, 'comparisons.json'),
    JSON.stringify(comparisons, null, 2),
  );
  let html = await readFile(join(root, 'index.html'), 'utf8');
  html += `<h2>Optional comparisons</h2><p>Independent captures. Common explanations appear on the left; differing observations are labeled in both views.</p><main>${comparisons.map((c) => `<article><h2>${c.kind}</h2><video controls preload="metadata" src="${c.kind}-comparison.mp4"></video></article>`).join('')}</main>`;
  await writeFile(join(root, 'index.html'), html);
}
