import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const exec = promisify(execFile),
  root = resolve(process.env.REPRO_SCENE_OUT ?? '.repro/scene-polish');
const results = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
const output = join(root, 'acceptance');
await mkdir(output, { recursive: true });
async function cli(...args) {
  try {
    return JSON.parse(
      (
        await exec(process.execPath, ['packages/cli/dist/bin.js', ...args], {
          maxBuffer: 16 * 1024 * 1024,
        })
      ).stdout,
    );
  } catch (e) {
    throw new Error(`${args[0]}: ${e.stdout}\n${e.stderr}`);
  }
}
const review = [];
for (const result of results) {
  const { kind, role, run, rendered } = result;
  const bundle = await cli(
    'export',
    run,
    '--draft',
    '--out-dir',
    join(output, `${kind}-${role}-bundle`),
  );
  assert.ok(bundle.manifest.assets.length, JSON.stringify(bundle));
  await cli(
    'frame',
    run,
    '--checkpoint',
    kind === 'transient' ? 'during' : 'result',
  );
  const video = `${kind}-${role}.mp4`;
  await copyFile(rendered.outputPath, join(output, video));
  const scene = JSON.parse(
    await readFile(join(rendered.directory, 'scene.json'), 'utf8'),
  );
  const beat = scene.segments.find((s) => s.kind === 'hold');
  assert.ok(beat);
  const stills = [];
  for (const [label, time] of [
    ['entry', beat.outStartMs + 67],
    ['hold', beat.outStartMs + 500],
    ['exit', beat.outStartMs + beat.outDurationMs - 67],
  ]) {
    const index = Math.round((time * 30) / 1000),
      name = `${kind}-${role}-${label}.png`;
    await copyFile(
      join(
        rendered.directory,
        'frames',
        `frame_${String(index).padStart(6, '0')}.png`,
      ),
      join(output, name),
    );
    stills.push({ label, path: name });
  }
  // Verify the public review server serves this composition's video and source map.
  const child = spawn(
    process.execPath,
    ['packages/cli/dist/bin.js', 'review', run, '--presentation'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    const url = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(
        () => reject(new Error('Review startup timed out')),
        15000,
      );
      child.stdout.on('data', (b) => {
        text += b.toString();
        try {
          const value = JSON.parse(text);
          clearTimeout(timer);
          resolve(value.url);
        } catch {}
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code) reject(new Error(`Review exited ${code}`));
      });
    });
    const html = await (await fetch(url)).text();
    assert.match(html, /Scene review/);
    assert.match(html, /sourceFrameId/);
    const src = html.match(/<video controls src="([^"]+)"/);
    assert.ok(src);
    assert.equal(
      (await fetch(new URL(src[1], url), { headers: { Range: 'bytes=0-99' } }))
        .status,
      206,
    );
  } finally {
    child.kill('SIGTERM');
  }
  review.push({
    kind,
    role,
    video,
    stills,
    bundle: bundle.manifestPath,
    receipt: rendered.receipt,
  });
  await writeFile(
    join(output, 'receipts.json'),
    JSON.stringify(review, null, 2),
  );
  console.log(`Audited ${kind}/${role}`);
}
for (const kind of ['menu', 'geometry', 'transient']) {
  const a = results.find((r) => r.kind === kind && r.role === 'before'),
    b = results.find((r) => r.kind === kind && r.role === 'after');
  if (!a || !b) continue;
  const pair = await cli(
    'render',
    b.run,
    '--renderer',
    'hyperframes',
    '--baseline',
    a.run,
    ...(kind === 'transient' ? ['--observational'] : []),
  );
  await copyFile(pair.outputPath, join(output, `${kind}-comparison-draft.mp4`));
  await writeFile(
    join(output, `${kind}-comparison.json`),
    JSON.stringify(pair, null, 2),
  );
}
const html = `<!doctype html><meta charset="utf-8"><title>Repro visual acceptance</title><style>body{background:#101721;color:#edf3f8;font:18px system-ui;margin:32px}section{margin:40px 0}video{width:100%;max-height:70vh}img{width:100%}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}a{color:#99d5ff}</style><h1>Repro · visual acceptance drafts</h1><p>Individual bundles passed strict OCR. Comparison clips remain local drafts. Review entry, hold, exit, source-clock replay, retained markers, and the magnifier crop before accepting the visual standard.</p>${review.map((r) => `<section><h2>${r.kind} / ${r.role}</h2><video controls src="${r.video}"></video><div class="grid">${r.stills.map((s) => `<figure><img src="${s.path}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div></section>`).join('')}`;
await writeFile(join(output, 'index.html'), html);
console.log(join(output, 'index.html'));
