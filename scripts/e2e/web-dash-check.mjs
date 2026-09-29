import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve('.repro/bug-corpus/web-dash');
const results = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
assert.equal(results.length, 3, 'All three real-site examples must be present');
const report = [];
await mkdir(join(root, 'transitions'), { recursive: true });
for (const r of results) {
  const scene = JSON.parse(
    await readFile(join(r.rendered.directory, 'scene.json'), 'utf8'),
  );
  const receipt = JSON.parse(
    await readFile(join(r.rendered.directory, 'render-receipt.json'), 'utf8'),
  );
  const manifest = JSON.parse(await readFile(join(r.run, 'run.json'), 'utf8'));
  const bundle = JSON.parse(
    await readFile(join(r.bundle, 'evidence-manifest.json'), 'utf8'),
  );
  const video = bundle.assets.find(
    (a) => a.kind === 'mp4' && a.sha256 === r.sha256,
  );
  assert.ok(video, 'Audited bundle must contain the exact gallery video');
  for (const path of [join(root, `${r.name}.mp4`), join(r.bundle, video.path)])
    assert.equal(
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
      r.sha256,
    );
  assert.equal(manifest.scenarioOutcome, 'passed');
  assert.equal(manifest.variant.role, 'standalone');
  assert.equal(r.application.mocked, false);
  const events = (await readFile(join(r.run, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(
    events.filter(
      (e) =>
        typeof e.payload?.url === 'string' &&
        e.payload.url.includes('/auth/dev-login'),
    ).length,
    0,
    'Authentication must finish before recording',
  );
  assert.ok(
    events.some((e) => e.kind === 'browser.network'),
    'Network diagnostics are captured',
  );
  assert.ok(
    events.some((e) => e.kind === 'scenario.state'),
    'Explicit page observations are captured',
  );
  assert.equal(receipt.randomSeekPassed, true);
  assert.equal(receipt.layoutFramesChecked, receipt.frameCount);
  const detail = scene.cues.find((c) => c.id === 'observed-detail');
  assert.ok(detail && detail.endMs - detail.startMs >= 5399.99);
  assert.equal(detail.severity, 'normal');
  const markers = scene.cues.filter((c) => c.kind === 'marker');
  assert.equal(
    markers.length,
    3,
    'Three observed actions require three numbered callouts',
  );
  assert.ok(markers.every((m) => m.endMs - m.startMs >= 1800));
  const clicks = scene.cursorSamples.filter((p) => p.phase === 'pointerdown');
  assert.ok(clicks.length >= 3);
  for (let i = 1; i < clicks.length; i++)
    assert.ok(
      clicks[i].timeMs - clicks[i - 1].timeMs >= 1800,
      'Human observation time between actions',
    );
  assert.ok(
    scene.cursorSamples.length >= 60,
    'Actual recorded mouse approaches',
  );
  assert.ok(
    scene.cues.some((c) => c.kind === 'data-panel' && c.samples.length > 0),
  );
  for (const [label, time] of [
    ['entry', detail.startMs + 67],
    ['hold', detail.startMs + 1500],
    ['exit', detail.endMs - 67],
  ])
    await copyFile(
      join(
        r.rendered.directory,
        'frames',
        `frame_${String(Math.round((time * 30) / 1000)).padStart(6, '0')}.png`,
      ),
      join(root, 'transitions', `${r.name}-${label}.png`),
    );
  report.push({
    name: r.name,
    source: r.application,
    viewport: r.viewport,
    framesChecked: receipt.frameCount,
    exactSeeking: true,
    numberedActions: markers.length,
    cursorSamples: scene.cursorSamples.length,
    resultOpaqueSeconds: (detail.endMs - detail.startMs - 350) / 1000,
    sha256: r.sha256,
  });
}
await writeFile(join(root, 'acceptance.json'), JSON.stringify(report, null, 2));
console.log(
  `Verified ${report.length} real-site recordings and ${report.reduce((n, r) => n + r.framesChecked, 0)} output frames.`,
);
